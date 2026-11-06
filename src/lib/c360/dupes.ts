// Ghép trùng phía server: quét nhóm trùng, cảnh báo khi nhập, gộp hồ sơ và chuyển mọi liên kết.
import type { Record as DbRecord } from "@prisma/client";
import { db, dbRaw } from "../db";
import { getPref, setPref } from "../prefs";
import { audit } from "../audit";
import { moveToTrash } from "../trash";
import { notifyOnce } from "../notify";
import type { WorkspaceConfig } from "../config/schema";
import { loadCfg } from "../marketing/store";
import { activeWorkspaces, contactKeys, dataOf, type C360Ctx } from "./common";
import { findDuplicateGroups, groupKey, mergeData, normEmail, normName, normPhoneVN, type DupContact, type DupGroup } from "./dedupe";

/** Pref "dupes": nhóm người dùng đã đánh dấu "không phải trùng" và nhóm đã báo (để job chỉ báo nhóm mới). */
type DupPref = { ignored: string[]; notified: string[] };
const DUP_DEFAULT: DupPref = { ignored: [], notified: [] };
export const dupPref = (wid: string) => getPref<DupPref>(wid, "dupes", DUP_DEFAULT);

function toDup(cfg: WorkspaceConfig, r: DbRecord): DupContact {
  const { phoneKey, emailKey } = contactKeys(cfg);
  const d = dataOf(r);
  return { id: r.id, title: r.title, phone: phoneKey ? String(d[phoneKey] ?? "") : "", email: emailKey ? String(d[emailKey] ?? "") : "", createdAt: r.createdAt, score: r.score };
}

/** Quét toàn bộ khách (db tự bỏ mục trong thùng rác), bỏ các nhóm đã đánh dấu không trùng. */
export async function scanDuplicates(workspaceId: string, cfg: WorkspaceConfig): Promise<{ groups: DupGroup[]; rows: Map<string, DbRecord> }> {
  const recs = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" } });
  const pref = await dupPref(workspaceId);
  const groups = findDuplicateGroups(
    recs.map((r) => toDup(cfg, r)),
    pref.ignored,
  );
  return { groups, rows: new Map(recs.map((r) => [r.id, r])) };
}

export async function ignoreGroup(workspaceId: string, ids: string[]) {
  const p = await dupPref(workspaceId);
  await setPref(workspaceId, "dupes", { ...p, ignored: [...new Set([...p.ignored, groupKey(ids)])].slice(-2000) });
}

/** Khách có thể trùng với thông tin đang nhập (form tạo khách, nhập liệu). */
export async function findDuplicatesFor(workspaceId: string, input: { phone?: string; email?: string; name?: string }, cfg?: WorkspaceConfig, excludeId?: string) {
  const c = cfg ?? (await loadCfg(workspaceId));
  if (!c) return [];
  const phone = normPhoneVN(input.phone);
  const email = normEmail(input.email);
  const name = normName(input.name);
  if (!phone && !email) return [];
  const { phoneKey, emailKey } = contactKeys(c);
  // Lọc thô bằng SQL theo 3 số cuối (số viết có dấu cách/chấm vẫn giữ cụm cuối) / phần trước @ của email, rồi so chính xác sau khi chuẩn hoá.
  const or = [
    ...(phone && phoneKey ? [{ dataJson: { contains: phone.slice(-3) } }] : []),
    ...(email && emailKey ? [{ dataJson: { contains: email.split("@")[0] } }] : []),
  ];
  if (!or.length) return [];
  const recs = await db.record.findMany({ where: { workspaceId, objectKey: "contacts", OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) }, take: 2000 });
  const out: { id: string; title: string; owner: string; reason: string }[] = [];
  for (const r of recs) {
    const d = toDup(c, r);
    const p = normPhoneVN(d.phone);
    const reason = phone && p === phone ? "Trùng số điện thoại" : email && normEmail(d.email) === email ? "Trùng email" : name && phone && p && p.slice(-6) === phone.slice(-6) && normName(r.title) === name ? "Trùng tên và đuôi số" : "";
    if (reason) out.push({ id: r.id, title: r.title, owner: r.ownerName, reason });
  }
  return out.slice(0, 10);
}

/** Bảng → cột liên kết tới khách. Mỗi cột được chuyển sang hồ sơ giữ lại. */
const LINKS = [
  ["activities", "activity", ["recordId"]],
  ["tasks", "task", ["recordId"]],
  ["orders", "order", ["contactId", "recordId"]],
  ["quotes", "quote", ["contactId", "recordId"]],
  ["contracts", "contract", ["contactId", "recordId"]],
  ["tickets", "ticket", ["recordId"]],
  ["loyalty", "loyaltyTxn", ["recordId"]],
  ["warranties", "warranty", ["recordId"]],
  ["calls", "call", ["recordId"]],
  ["conversations", "conversation", ["recordId"]],
  ["outMessages", "outMessage", ["recordId"]],
  ["enrollments", "enrollment", ["recordId"]],
  ["surveys", "surveyResponse", ["recordId"]],
  ["vouchers", "voucher", ["recordId"]],
  ["leadEvents", "leadEvent", ["recordId"]],
  ["docs", "doc", ["recordId"]],
] as const;

type AnyDelegate = { updateMany: (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }> };

/**
 * Gộp các hồ sơ phụ vào hồ sơ giữ lại: điền ô trống, nối danh sách, giữ điểm cao hơn,
 * chuyển mọi liên kết (đơn, phiếu, cuộc gọi, hội thoại…), ghi MergeLog, rồi đưa hồ sơ phụ vào thùng rác.
 */
export async function mergeContacts(ctx: C360Ctx, survivorId: string, loserIds: string[]) {
  const wid = ctx.workspace.id;
  const ids = [...new Set(loserIds.filter((x) => x && x !== survivorId))];
  if (!ids.length) throw new Error("Chọn ít nhất một hồ sơ để gộp");
  const survivor = await db.record.findFirst({ where: { id: survivorId, workspaceId: wid, objectKey: "contacts" } });
  if (!survivor) throw new Error("Không tìm thấy hồ sơ giữ lại");
  const losers = await db.record.findMany({ where: { id: { in: ids }, workspaceId: wid, objectKey: "contacts" } });
  if (losers.length !== ids.length) throw new Error("Có hồ sơ không còn tồn tại hoặc không phải khách");

  const { types } = contactKeys(ctx.config);
  const merged = mergeData(dataOf(survivor), losers.map(dataOf), types);
  const score = Math.max(survivor.score, ...losers.map((l) => l.score));
  const moved: Record<string, number> = {};

  await dbRaw.$transaction(async (tx) => {
    for (const [label, model, cols] of LINKS) {
      const del = (tx as unknown as Record<string, AnyDelegate>)[model];
      let n = 0;
      for (const col of cols) {
        // Activity/Task/Enrollment… không có workspaceId ở mọi bảng, nhưng id hồ sơ là cuid duy nhất nên lọc theo id là đủ.
        n += (await del.updateMany({ where: { [col]: { in: ids } }, data: { [col]: survivorId } })).count;
      }
      if (n) moved[label] = n;
    }
    // Giao dịch và mục khác trỏ tới khách qua data (vd. _lien_he, trường liên kết).
    let deals = 0;
    for (const id of ids) {
      const linked = await tx.record.findMany({ where: { workspaceId: wid, deletedAt: null, id: { notIn: [survivorId, ...ids] }, dataJson: { contains: id } } });
      for (const r of linked) {
        const d = dataOf(r);
        let hit = false;
        for (const [k, v] of Object.entries(d)) {
          if (v === id) {
            d[k] = survivorId;
            hit = true;
          } else if (Array.isArray(v) && v.includes(id)) {
            d[k] = [...new Set(v.map((x) => (x === id ? survivorId : x)))];
            hit = true;
          }
        }
        if (hit) {
          await tx.record.update({ where: { id: r.id }, data: { dataJson: JSON.stringify(d) } });
          deals++;
        }
      }
    }
    if (deals) moved.linkedRecords = deals;
    await tx.record.update({ where: { id: survivorId }, data: { dataJson: JSON.stringify(merged), score, ownerName: survivor.ownerName || losers.find((l) => l.ownerName)?.ownerName || "" } });
    await tx.mergeLog.create({
      data: {
        workspaceId: wid,
        objectKey: "contacts",
        survivorId,
        mergedIds: JSON.stringify(ids),
        snapshotJson: JSON.stringify(losers.map((l) => ({ id: l.id, title: l.title, status: l.status, ownerName: l.ownerName, score: l.score, data: dataOf(l), createdAt: l.createdAt }))).slice(0, 200000),
        movedJson: JSON.stringify(moved),
        by: ctx.user.name,
      },
    });
    await tx.activity.create({ data: { recordId: survivorId, kind: "system", body: `Đã gộp ${ids.length} hồ sơ trùng: ${losers.map((l) => l.title).join(", ")}`, author: ctx.user.name } });
  });

  for (const id of ids) await moveToTrash(wid, id, ctx.user.name);
  await audit({ workspaceId: wid, user: ctx.user }, "merge", "record", survivorId, `Gộp ${ids.length} hồ sơ trùng vào “${survivor.title}”`, { mergedIds: ids, moved });
  return { survivorId, merged: ids.length, moved };
}

/** Lịch sử gộp gần đây. */
export const mergeHistory = (workspaceId: string) => db.mergeLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20 });

/** Job hằng tuần: báo chủ workspace khi xuất hiện nhóm trùng mới (mỗi nhóm báo một lần). */
export async function tickDuplicateScan(): Promise<void> {
  for (const { workspaceId, cfg } of await activeWorkspaces()) {
    const { groups } = await scanDuplicates(workspaceId, cfg);
    const p = await dupPref(workspaceId);
    const known = new Set(p.notified);
    const fresh = groups.filter((g) => !known.has(g.key));
    if (!fresh.length) continue;
    const owners = await db.membership.findMany({ where: { workspaceId, role: { in: ["owner", "manager"] } }, select: { userId: true } });
    const text = `Phát hiện ${fresh.length} nhóm hồ sơ khách có thể trùng (tổng ${groups.length} nhóm). Gộp để chân dung khách đầy đủ hơn.`;
    for (const o of owners) await notifyOnce(workspaceId, { userId: o.userId, kind: "duplicates", text, href: "/w/duplicates" });
    await setPref(workspaceId, "dupes", { ...p, notified: [...new Set([...p.notified, ...fresh.map((g) => g.key)])].slice(-2000) });
  }
}
