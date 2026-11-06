// Điểm nối giữa Bán hàng và Chăm sóc. Bán hàng gọi các hàm này khi đơn hàng hoàn tất;
// phần Chăm sóc (tích điểm, bảo hành) hiện thực bên trong.

export type CompletedOrder = { id: string; number: string; workspaceId: string; contactId: string | null; customerName: string; customerPhone: string; total: number; itemsJson: string; createdBy: string };

/** Cộng điểm thưởng cho khách của đơn (nếu bật tích điểm). Trả về số điểm đã cộng. */
export async function awardPointsForOrder(order: CompletedOrder): Promise<number> {
  void order;
  return 0;
}

/** Tạo phiếu bảo hành cho các sản phẩm có thời hạn bảo hành trong đơn. Trả về số phiếu đã tạo. */
export async function createWarrantiesForOrder(order: CompletedOrder): Promise<number> {
  void order;
  return 0;
}
