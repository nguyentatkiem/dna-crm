// Dùng chung cho trang nhật ký (server + client) và file CSV.
import type { Prisma } from "@prisma/client";

export const ACTION_LABEL: Record<string, string> = {
  "record.create": "Tạo mục",
  "record.update": "Sửa mục",
  "record.delete": "Chuyển vào thùng rác",
  "record.restore": "Khôi phục mục",
  "record.purge": "Xoá vĩnh viễn",
  "product.create": "Thêm sản phẩm",
  "company.update": "Sửa thông tin doanh nghiệp",
  "quote.create": "Tạo báo giá",
  "quote.submit": "Gửi duyệt báo giá",
  "quote.approve": "Duyệt báo giá",
  "quote.reject": "Từ chối báo giá",
  "quote.send": "Gửi báo giá",
  "quote.accept": "Khách chấp nhận báo giá",
  "order.create": "Tạo đơn hàng",
  "order.update": "Sửa đơn hàng",
  "payment.create": "Thu tiền",
  "payment.delete": "Huỷ phiếu thu",
  "contract.create": "Tạo hợp đồng",
  "member.invite": "Mời thành viên",
  "member.role": "Đổi vai trò",
  "member.remove": "Xoá thành viên",
  "member.password": "Đặt lại mật khẩu",
  "team.add": "Thêm vào đội",
  "settings.permissions": "Đổi phân quyền",
  "role.create": "Tạo vai trò",
  "role.update": "Sửa vai trò",
  "role.delete": "Xoá vai trò",
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;
export const ACTION_COLOR = (a: string) => (a.endsWith(".delete") || a.endsWith(".remove") ? "#df2f4a" : a.endsWith(".create") || a.endsWith(".invite") || a.endsWith(".add") ? "#00c875" : a.startsWith("member") || a.startsWith("settings") || a.startsWith("role.") ? "#a25ddc" : "#579bfc");

export type AuditFilter = { user?: string; action?: string; from?: string; to?: string; page?: string };
export const PAGE_SIZE = 50;

/** Đổi bộ lọc trên URL thành điều kiện Prisma. Ngày dạng YYYY-MM-DD theo giờ máy chủ. */
export function auditWhere(workspaceId: string, f: AuditFilter): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from && !isNaN(Date.parse(f.from))) createdAt.gte = new Date(`${f.from}T00:00:00`);
  if (f.to && !isNaN(Date.parse(f.to))) createdAt.lt = new Date(new Date(`${f.to}T00:00:00`).getTime() + 864e5);
  return {
    workspaceId,
    ...(f.user ? { userName: f.user } : {}),
    ...(f.action ? (f.action.endsWith(".*") ? { action: { startsWith: f.action.slice(0, -1) } } : { action: f.action }) : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
  };
}

/** Chuẩn hoá diffJson về danh sách [trường, cũ, mới]. */
export function diffRows(diffJson: string): [string, unknown, unknown][] {
  if (!diffJson) return [];
  let d: unknown;
  try {
    d = JSON.parse(diffJson);
  } catch {
    return [];
  }
  if (!d || typeof d !== "object") return [];
  const o = d as Record<string, unknown>;
  if (o.after && typeof o.after === "object" && !Array.isArray(o.after)) return Object.entries(o.after as Record<string, unknown>).map(([k, v]) => [k, "", v]);
  if (o.before && typeof o.before === "object" && !Array.isArray(o.before)) return Object.entries(o.before as Record<string, unknown>).map(([k, v]) => [k, v, ""]);
  return Object.entries(o).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[])[0], (v as unknown[])[1]]);
}
