// Thông tin khách của một đơn để điền sẵn người mua (hoá đơn) và người nhận (vận đơn).
import type { Order } from "@prisma/client";
import { db, parseJson } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { activeConfig } from "@/lib/sales/service";

export type CustomerDetails = { name: string; phone: string; email: string; address: string; taxCode: string; company: string };

const pick = (d: Record<string, unknown>, keys: (string | undefined)[]) => {
  for (const k of keys) if (k && d[k] != null && String(d[k]).trim()) return String(d[k]).trim();
  return "";
};

/** Địa chỉ ghi trong ghi chú đơn tạo từ Hộp thư: "Giao tới: …". */
export const addressFromNote = (note: string) => note.match(/Giao tới:\s*(.+)/)?.[1]?.trim() ?? "";

export async function customerDetails(order: Pick<Order, "workspaceId" | "contactId" | "customerName" | "customerPhone" | "note">): Promise<CustomerDetails> {
  const out: CustomerDetails = { name: order.customerName, phone: order.customerPhone, email: "", address: addressFromNote(order.note), taxCode: "", company: "" };
  if (!order.contactId) return out;
  const [rec, cfg] = await Promise.all([db.record.findFirst({ where: { id: order.contactId, workspaceId: order.workspaceId } }), activeConfig(order.workspaceId)]);
  if (!rec) return out;
  const d = parseJson<Record<string, unknown>>(rec.dataJson, {});
  const fields = (cfg && getObject(cfg, rec.objectKey)?.fields) || [];
  const byType = (t: string) => fields.find((f) => f.type === t)?.key;
  const byName = (re: RegExp) => fields.find((f) => re.test(f.key) || re.test(f.label))?.key;
  return {
    name: rec.title || out.name,
    phone: out.phone || pick(d, [byType("phone")]),
    email: pick(d, [byType("email")]),
    address: pick(d, [byName(/dia_chi|address|địa chỉ/i), "_dia_chi"]) || out.address,
    taxCode: pick(d, [byName(/ma_so_thue|\bmst\b|tax|mã số thuế/i), "_mst"]),
    company: pick(d, [byName(/cong_ty|company|đơn vị|công ty/i)]),
  };
}
