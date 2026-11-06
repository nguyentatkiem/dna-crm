import type { Record as DbRecord } from "@prisma/client";

/**
 * Lấy danh sách khách thuộc một nhóm khách động (bộ lọc đã lưu), áp đúng logic Lọc nâng cao của bảng.
 * Phần Chăm sóc hiện thực; Gửi hàng loạt dùng hàm này để chọn người nhận.
 */
export async function resolveSegment(workspaceId: string, segmentId: string): Promise<DbRecord[]> {
  void workspaceId;
  void segmentId;
  return [];
}
