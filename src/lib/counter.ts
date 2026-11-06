import { db } from "./db";

/**
 * Lấy số chứng từ kế tiếp theo năm, ví dụ nextNumber(ws, "BG") → "BG-2026-0001".
 * Tăng nguyên tử trong DB nên hai người tạo cùng lúc không bị trùng số.
 */
export async function nextNumber(workspaceId: string, prefix: string, now = new Date()) {
  const key = `${prefix}-${now.getFullYear()}`;
  const row = await db.counter.upsert({ where: { workspaceId_key: { workspaceId, key } }, create: { workspaceId, key, value: 1 }, update: { value: { increment: 1 } } });
  return `${key}-${String(row.value).padStart(4, "0")}`;
}
