import { z } from "zod";
import { db, parseJson } from "@/lib/db";
import { moveToTrash } from "@/lib/trash";
import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { runAutomations, toDTO, type FieldValue } from "@/lib/records";
import { can, findScopedRecord, getRole } from "@/lib/permissions";
import { audit, recordSnapshot, snapshotDiff } from "@/lib/audit";
import { notify, userIdByName } from "@/lib/notify";
import { fireRecordUpdate } from "@/lib/automation";
import { dropMaskedEdits, getPrivacy, maskRecord } from "@/lib/privacy";
import { applyFieldAccess, dropReadonlyEdits, getFieldRules } from "@/lib/field-access";
import { postWin } from "@/lib/feed";
import { wonLost } from "@/lib/metrics";
import { vnd } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  title: z.string().max(200).optional(),
  status: z.string().optional(),
  ownerName: z.string().optional(),
  amount: z.number().optional(),
  data: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  // Ngoài phạm vi được xem thì coi như không có (không lộ là mục tồn tại).
  const rec = await findScopedRecord(a.ctx, id);
  if (!rec) return fail("Không tìm thấy mục", 404);
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu chưa hợp lệ");
  const p = parsed.data;
  const obj = getObject(a.ctx.config, rec.objectKey);
  if (p.status && !obj?.statuses.some((s) => s.key === p.status)) return fail("Trạng thái không có trong bảng này");

  // Bỏ các ô còn đang bị che (••) và ô vai trò này không được sửa (chỉ xem / ẩn theo Phân quyền trường).
  const [role, rules] = await Promise.all([getRole(a.ctx.user.id, a.ctx.workspace.id), getFieldRules(a.ctx.workspace.id, rec.objectKey)]);
  const data = p.data ? { ...parseJson<Record<string, FieldValue>>(rec.dataJson, {}), ...dropReadonlyEdits(dropMaskedEdits(p.data), role, rules) } : undefined;
  const updated = await db.record.update({
    where: { id },
    data: { title: p.title, status: p.status, ownerName: p.ownerName, amount: p.amount, dataJson: data ? JSON.stringify(data) : undefined },
    include: { _count: { select: { activities: true } } },
  });

  if (p.status && p.status !== rec.status) {
    const from = obj?.statuses.find((s) => s.key === rec.status)?.label ?? rec.status;
    const to = obj?.statuses.find((s) => s.key === p.status)?.label ?? p.status;
    await db.activity.create({ data: { recordId: id, kind: "system", body: `${a.ctx.user.name} đổi ${obj?.statusLabel.toLowerCase()} từ “${from}” sang “${to}”`, author: a.ctx.user.name } });
    await runAutomations(a.ctx.workspace.id, a.ctx.config, { kind: "status_changed", record: updated, from: rec.status });
    if (obj?.amountLabel && wonLost(a.ctx.config).won.has(p.status)) {
      await postWin(a.ctx.workspace.id, `🎉 ${updated.ownerName || a.ctx.user.name} vừa chốt “${updated.title}”${updated.amount ? ` – ${vnd(updated.amount)}` : ""}`, a.ctx.user.name).catch(() => undefined);
    }
  }
  await fireRecordUpdate(a.ctx.workspace.id, a.ctx.config, rec, updated).catch((e) => console.error("[automation]", e instanceof Error ? e.message : e));

  const diff = snapshotDiff(recordSnapshot(rec), recordSnapshot(updated));
  if (Object.keys(diff).length) {
    const fields = Object.keys(diff).map((k) => (k.startsWith("data.") ? (obj?.fields.find((f) => f.key === k.slice(5))?.label ?? k.slice(5)) : FIELD_NAME[k] ?? k));
    await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "record.update", rec.objectKey, id, `Sửa “${updated.title}”: ${fields.join(", ")}`, diff);
  }

  if (p.ownerName !== undefined && p.ownerName && p.ownerName !== rec.ownerName && p.ownerName !== a.ctx.user.name) {
    const userId = await userIdByName(a.ctx.workspace.id, p.ownerName);
    if (userId) await notify(a.ctx.workspace.id, { userId, kind: "lead", text: `${a.ctx.user.name} giao cho bạn ${obj?.itemLabel.toLowerCase() ?? "mục"} “${updated.title}”`, href: `/w/b/${rec.objectKey}?open=${id}` });
  }

  const fresh = await db.record.findUniqueOrThrow({ where: { id }, include: { _count: { select: { activities: true } } } });
  const prefs = await getPrivacy(a.ctx.workspace.id);
  return ok(applyFieldAccess(maskRecord(toDTO(fresh), obj, role, prefs), role, rules));
}

const FIELD_NAME: Record<string, string> = { title: "tên", status: "trạng thái", ownerName: "người phụ trách", amount: "giá trị" };

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const role = await getRole(a.ctx.user.id, a.ctx.workspace.id);
  if (!can(role, "delete")) return fail("Bạn không có quyền xoá. Hãy nhờ chủ hoặc quản lý.", 403);
  const rec = await findScopedRecord(a.ctx, id);
  if (!rec) return fail("Không tìm thấy mục", 404);
  // Xoá mềm: chuyển vào thùng rác, khôi phục được trong TRASH_DAYS ngày.
  await moveToTrash(a.ctx.workspace.id, id, a.ctx.user.name);
  const obj = getObject(a.ctx.config, rec.objectKey);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "record.delete", rec.objectKey, id, `Chuyển ${obj?.itemLabel.toLowerCase() ?? "mục"} “${rec.title}” vào thùng rác`, { before: recordSnapshot(rec) });
  return ok({ deleted: true, trash: true });
}
