import { db, parseJson } from "./db";

/**
 * Cấu hình không bí mật của workspace (bảng Pref), mỗi khoá một JSON.
 * Khoá đang dùng: "company" (thông tin in chứng từ), "loyalty", "privacy", "ticket".
 */
export async function getPref<T>(workspaceId: string, key: string, fallback: T): Promise<T> {
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
  return row ? { ...fallback, ...parseJson<Partial<T>>(row.valueJson, {}) } : fallback;
}

export async function setPref<T extends object>(workspaceId: string, key: string, value: T) {
  const valueJson = JSON.stringify(value);
  await db.pref.upsert({ where: { workspaceId_key: { workspaceId, key } }, create: { workspaceId, key, valueJson }, update: { valueJson } });
  return value;
}

/** Thông tin doanh nghiệp in trên báo giá, đơn hàng, hợp đồng. */
export type Company = { name: string; address: string; phone: string; email: string; taxCode: string; bank: string; logoUrl: string; quoteTerms: string; footer: string };
export const COMPANY_DEFAULT: Company = { name: "", address: "", phone: "", email: "", taxCode: "", bank: "", logoUrl: "", quoteTerms: "Báo giá có hiệu lực trong 15 ngày. Giá đã bao gồm VAT nếu có ghi.", footer: "" };
