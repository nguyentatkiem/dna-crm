// Loại điểm chạm trên dòng thời gian 360° (dùng chung server và trình duyệt).

export const TL_KINDS = [
  { key: "note", label: "Ghi chú & cập nhật", icon: "edit", color: "#579bfc" },
  { key: "call", label: "Cuộc gọi", icon: "phone", color: "#00c875" },
  { key: "chat", label: "Tin nhắn", icon: "chat", color: "#0068ff" },
  { key: "sent", label: "Tin đã gửi", icon: "send", color: "#a25ddc" },
  { key: "email", label: "Mở/nhấp email", icon: "mail", color: "#9d50dd" },
  { key: "sales", label: "Mua hàng", icon: "cart", color: "#fdab3d" },
  { key: "care", label: "Hỗ trợ & bảo hành", icon: "ticket", color: "#df2f4a" },
  { key: "loyalty", label: "Điểm & ưu đãi", icon: "award", color: "#e2a400" },
  { key: "survey", label: "Khảo sát", icon: "chart", color: "#66ccff" },
  { key: "lead", label: "Nguồn & form", icon: "funnel", color: "#037f4c" },
] as const;
export type TlKind = (typeof TL_KINDS)[number]["key"];
export const tlKind = (k: string) => TL_KINDS.find((x) => x.key === k) ?? TL_KINDS[0];

export type TimelineItem = { id: string; at: string; kind: TlKind; icon: string; title: string; detail?: string; href?: string };

/** Ghép nhiều nguồn đã sắp xếp, lấy `limit` mục mới nhất trước mốc `before`. */
export function mergeTimeline(lists: TimelineItem[][], limit: number, before?: string): { items: TimelineItem[]; next: string | null } {
  const b = before ? new Date(before).getTime() : Infinity;
  const all = lists.flat().filter((x) => new Date(x.at).getTime() < b);
  all.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime() || x.id.localeCompare(y.id));
  const items = all.slice(0, limit);
  return { items, next: all.length > limit ? items[items.length - 1].at : null };
}
