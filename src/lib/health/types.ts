// Kiểu dùng chung cho trang "Kiểm tra kết nối". Mỗi mô-đun xuất health(workspaceId) trả mảng Check.
export type CheckStatus = "ok" | "warn" | "off" | "error";
export type Check = {
  key: string;
  group: string; // vd. "Kênh chat", "Thanh toán", "AI", "Hệ thống"
  label: string;
  status: CheckStatus;
  detail: string; // tiếng Việt, ngắn, không chứa bí mật
  fixHref?: string; // trang để sửa
  /** Có thể bấm "Thử ngay" (gọi thử thật tới dịch vụ). */
  testable?: boolean;
};
