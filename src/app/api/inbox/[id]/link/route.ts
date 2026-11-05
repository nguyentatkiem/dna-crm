import { z } from "zod";
import { audit } from "@/lib/audit";
import { getObject } from "@/lib/config/schema";
import { db, parseJson } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { CHANNEL_LABEL, findConversation, type InboxChannel } from "@/lib/inbox";
import { recordScope } from "@/lib/permissions";
import { createRecord, type FieldValue } from "@/lib/records";
import { normPhone } from "@/lib/sources/ingest";

type P = { params: Promise<{ id: string }> };

/** Tìm khách có sẵn theo tên hoặc SĐT để gắn: ?q=... */
export async function GET(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await findConversation(a.ctx, (await params).id))) return fail("Không tìm thấy hội thoại", 404);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const obj = getObject(a.ctx.config, "contacts");
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
  const digits = q.replace(/\D/g, "");
  const needle = digits.length >= 4 ? digits.slice(-9) : q;
  const rows = await db.record.findMany({
    where: { AND: [await recordScope(a.ctx), { objectKey: "contacts" }, q ? { OR: [{ title: { contains: q } }, { dataJson: { contains: needle } }] } : {}] },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return ok({
    items: rows.map((r) => {
      const d = parseJson<Record<string, FieldValue>>(r.dataJson, {});
      return { id: r.id, title: r.title, phone: phoneKey ? String(d[phoneKey] ?? "") : "", status: obj?.statuses.find((s) => s.key === r.status)?.label ?? "" };
    }),
  });
}

const Body = z.union([
  z.object({ mode: z.literal("create"), title: z.string().trim().max(120).optional(), phone: z.string().max(30).optional() }),
  z.object({ mode: z.literal("existing"), recordId: z.string().min(1) }),
]);

/** Tạo khách mới từ hội thoại, hoặc gắn với khách có sẵn. */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const cfg = a.ctx.config;
  const obj = getObject(cfg, "contacts");
  if (!obj) return fail("Workspace chưa có bảng khách hàng");
  const label = CHANNEL_LABEL[conv.channel as InboxChannel] ?? conv.channel;
  let recordId: string;
  if (p.data.mode === "create") {
    const phoneKey = obj.fields.find((f) => f.type === "phone")?.key;
    const data: Record<string, FieldValue> = { _kenh: conv.channel === "zalo" ? "zalo" : "organic", _nguon: conv.channel === "zalo" ? "Zalo OA" : "Facebook Messenger" };
    const phone = normPhone(p.data.phone);
    if (phoneKey && phone) data[phoneKey] = phone;
    if (conv.channel === "zalo") data._zalo_uid = conv.externalId;
    const src = obj.fields.find((f) => f.key === "nguon")?.options.find((o) => (conv.channel === "zalo" ? /zalo/i : /facebook|messenger|fb/i).test(o.label));
    if (src) data.nguon = src.label;
    const rec = await createRecord(a.ctx.workspace.id, cfg, { objectKey: "contacts", title: p.data.title || conv.name, ownerName: conv.assignee || a.ctx.user.name, data }, a.ctx.user.name);
    await db.activity.create({ data: { recordId: rec.id, kind: "system", body: `Tạo từ hội thoại ${label}`, author: a.ctx.user.name } });
    recordId = rec.id;
  } else {
    const rec = await db.record.findFirst({ where: { AND: [{ id: p.data.recordId }, await recordScope(a.ctx)] } });
    if (!rec) return fail("Không tìm thấy khách", 404);
    // Gắn Zalo user id để nhắn được từ hồ sơ khách.
    const d = parseJson<Record<string, FieldValue>>(rec.dataJson, {});
    if (conv.channel === "zalo" && !d._zalo_uid) await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify({ ...d, _zalo_uid: conv.externalId }) } });
    await db.activity.create({ data: { recordId: rec.id, kind: "system", body: `Đã gắn hội thoại ${label} (${conv.name})`, author: a.ctx.user.name } });
    recordId = rec.id;
  }
  await db.conversation.update({ where: { id: conv.id }, data: { recordId } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, p.data.mode === "create" ? "create" : "update", "conversation", conv.id, `${p.data.mode === "create" ? "Tạo khách từ" : "Gắn khách vào"} hội thoại ${label} ${conv.name}`);
  return ok({ ok: true, recordId });
}
