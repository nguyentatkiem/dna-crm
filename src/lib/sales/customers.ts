// Lấy thông tin khách (tên, SĐT, email) từ một record khách hoặc giao dịch.
import type { Record as DbRecord } from "@prisma/client";
import { db, parseJson } from "@/lib/db";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { contactInfo } from "@/lib/marketing/store";

export type CustomerCard = { contactId: string | null; recordId: string | null; name: string; phone: string; email: string };

function fieldsOf(cfg: WorkspaceConfig, rec: DbRecord) {
  const obj = getObject(cfg, "contacts");
  const d = parseJson<Record<string, unknown>>(rec.dataJson, {});
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
  const emailKey = obj?.fields.find((f) => f.type === "email")?.key;
  return { phone: phoneKey ? String(d[phoneKey] ?? "") : "", email: emailKey ? String(d[emailKey] ?? "") : "" };
}

/**
 * Record khách → chính nó. Record giao dịch → khách qua data._lien_he (do tự động hoá ghi),
 * nếu không có thì dò theo tên như phần Marketing đang làm.
 */
export async function customerOf(workspaceId: string, cfg: WorkspaceConfig, rec: DbRecord): Promise<CustomerCard> {
  if (rec.objectKey === "contacts") return { contactId: rec.id, recordId: null, name: rec.title, ...fieldsOf(cfg, rec) };
  const d = parseJson<Record<string, unknown>>(rec.dataJson, {});
  let contact: DbRecord | null = null;
  if (typeof d._lien_he === "string" && d._lien_he) contact = await db.record.findFirst({ where: { id: d._lien_he, workspaceId, objectKey: "contacts" } });
  if (!contact) contact = (await contactInfo(workspaceId, cfg, rec)).contact;
  if (contact && contact.objectKey !== "contacts") contact = null;
  const recordId = rec.objectKey === "deals" ? rec.id : null;
  if (contact) return { contactId: contact.id, recordId, name: contact.title, ...fieldsOf(cfg, contact) };
  return { contactId: null, recordId, name: rec.title.includes("·") ? rec.title.split("·").pop()!.trim() : rec.title, phone: "", email: "" };
}

export const contactFields = fieldsOf;
