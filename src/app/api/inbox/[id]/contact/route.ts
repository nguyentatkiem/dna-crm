import { z } from "zod";
import { audit } from "@/lib/audit";
import { detectContact } from "@/lib/chat/detect";
import { getObject } from "@/lib/config/schema";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { findVisibleConversation } from "@/lib/inbox-list";
import { findScopedRecord } from "@/lib/permissions";
import { createRecord, type FieldValue } from "@/lib/records";

type P = { params: Promise<{ id: string }> };

/**
 * Thông tin khách phát hiện trong tin nhắn (SĐT, email, địa chỉ) để điền sẵn form "Tạo khách".
 * Dùng detectContact (nhóm kênh hiện thực) + cột phones của hội thoại.
 */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const msgs = await db.message.findMany({ where: { conversationId: conv.id, direction: "in" }, orderBy: { createdAt: "desc" }, take: 50, select: { text: true } });
  const phones = new Set(conv.phones.split(",").map((s) => s.trim()).filter(Boolean));
  const emails = new Set<string>();
  let address = "";
  for (const m of msgs) {
    const d = detectContact(m.text);
    d.phones.forEach((x) => phones.add(x));
    d.emails.forEach((x) => emails.add(x));
    if (!address && d.address) address = d.address;
  }
  return ok({ name: /^Khách\b/.test(conv.name) ? "" : conv.name, phones: [...phones].slice(0, 5), emails: [...emails].slice(0, 3), address });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deal"), title: z.string().trim().min(1, "Cần tên giao dịch").max(200), amount: z.coerce.number().min(0).max(1e13).catch(0) }),
  z.object({ action: z.literal("appointment"), title: z.string().trim().max(200).catch(""), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"), time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).catch(""), note: z.string().trim().max(1000).catch("") }),
]);

/** Tạo giao dịch (pipeline) hoặc lịch hẹn cho khách đã gắn với hội thoại. */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  if (!conv.recordId) return fail("Hãy tạo hoặc nối khách trước");
  const contact = await findScopedRecord(a.ctx, conv.recordId);
  if (!contact) return fail("Không tìm thấy khách", 404);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const cfg = a.ctx.config;
  const d = p.data;
  const objectKey = d.action === "deal" ? "deals" : "appointments";
  const obj = getObject(cfg, objectKey);
  if (!obj || (objectKey === "appointments" && !cfg.modules.appointments)) return fail(`Workspace chưa bật bảng ${objectKey === "deals" ? "giao dịch" : "lịch hẹn"}`, 409);
  const data: Record<string, FieldValue> = { _lien_he: contact.id };
  // Ô "khách" dạng chữ (nếu bảng có) để nhìn bảng là biết của ai.
  const nameKey = obj.fields.find((f) => f.type === "text" && /khach|lien_he|customer/.test(f.key))?.key;
  if (nameKey) data[nameKey] = contact.title;
  let title: string;
  if (d.action === "deal") title = d.title;
  else {
    const dateKey = obj.fields.find((f) => f.type === "date")?.key;
    if (dateKey) data[dateKey] = d.date;
    title = d.title || `${obj.itemLabel} ${d.time ? `${d.time} ` : ""}${d.date.split("-").reverse().join("/")} · ${contact.title}`;
  }
  const rec = await createRecord(a.ctx.workspace.id, cfg, { objectKey, title, ownerName: contact.ownerName || a.ctx.user.name, amount: d.action === "deal" ? d.amount : 0, data }, a.ctx.user.name);
  const what = d.action === "deal" ? `${obj.itemLabel.toLowerCase()} “${rec.title}”` : `${obj.itemLabel.toLowerCase()} ${d.time ? `${d.time} ` : ""}${d.date.split("-").reverse().join("/")}`;
  await db.activity.create({ data: { recordId: contact.id, kind: "system", body: `Tạo ${what} từ hội thoại${d.action === "appointment" && d.note ? `\n${d.note}` : ""}`, author: a.ctx.user.name } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "record.create", objectKey, rec.id, `Tạo ${what} từ hội thoại ${conv.name}`);
  return ok({ id: rec.id, title: rec.title, href: `/w/b/${objectKey}?open=${rec.id}` }, 201);
}
