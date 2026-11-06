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

/**
 * Con trỏ trang "Xem cũ hơn": "<thời điểm ISO>|<id mục cuối>". Nhiều mục cùng thời điểm (vd. ghi chú + khảo sát ghi cùng lúc)
 * vẫn không bị mất khi rơi đúng ranh giới trang. Chuỗi ngày ISO thuần (không có id) vẫn được chấp nhận.
 */
export function parseCursor(c: string | null | undefined): { at: number; id: string } | null {
  if (!c) return null;
  const bar = c.indexOf("|");
  const at = Date.parse(bar < 0 ? c : c.slice(0, bar));
  return Number.isFinite(at) ? { at, id: bar < 0 ? "" : c.slice(bar + 1) } : null;
}

/** Ghép nhiều nguồn đã sắp xếp, lấy `limit` mục mới nhất sau con trỏ `before` (mới → cũ, cùng giờ thì theo id). */
export function mergeTimeline(lists: TimelineItem[][], limit: number, before?: string | null): { items: TimelineItem[]; next: string | null } {
  const cur = parseCursor(before);
  const seen = new Set<string>();
  const all = lists.flat().filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    if (!cur) return true;
    const t = new Date(x.at).getTime();
    return t < cur.at || (t === cur.at && !!cur.id && x.id > cur.id);
  });
  all.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const items = all.slice(0, limit);
  const last = items[items.length - 1];
  return { items, next: all.length > limit && last ? `${last.at}|${last.id}` : null };
}
