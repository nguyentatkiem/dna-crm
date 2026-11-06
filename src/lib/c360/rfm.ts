// Phân tích RFM (Recency, Frequency, Monetary): chấm 1–5 theo ngũ phân vị và xếp nhóm. Hàm thuần.

export const RFM_SEGMENTS = [
  { key: "vip", label: "VIP", color: "#a25ddc", hint: "Mua gần đây, mua nhiều, chi nhiều. Giữ chân bằng ưu đãi riêng." },
  { key: "loyal", label: "Trung thành", color: "#00c875", hint: "Mua đều đặn. Mời giới thiệu bạn bè, tặng điểm thưởng." },
  { key: "potential", label: "Tiềm năng trung thành", color: "#579bfc", hint: "Mới mua gần đây vài lần. Gợi ý gói/combo để mua tiếp." },
  { key: "new", label: "Khách mới", color: "#66ccff", hint: "Vừa mua lần đầu. Chăm sóc sau bán, hướng dẫn sử dụng." },
  { key: "attention", label: "Cần quan tâm", color: "#fdab3d", hint: "Đã lâu chưa quay lại, giá trị trung bình. Nhắc lịch, gửi ưu đãi nhẹ." },
  { key: "sleeping", label: "Sắp rời bỏ", color: "#ff7575", hint: "Ít mua và đang nguội dần. Gọi hỏi thăm trước khi mất hẳn." },
  { key: "at_risk", label: "Có nguy cơ mất", color: "#df2f4a", hint: "Từng mua nhiều nhưng lâu rồi không quay lại. Ưu tiên gọi ngay." },
  { key: "hibernating", label: "Đã ngủ đông", color: "#a0a3b1", hint: "Rất lâu không mua. Thử chiến dịch kích hoạt lại chi phí thấp." },
] as const;
export type RfmKey = (typeof RFM_SEGMENTS)[number]["key"];
export const RFM_LABEL = Object.fromEntries(RFM_SEGMENTS.map((s) => [s.key, s.label])) as Record<RfmKey, string>;
export const rfmMeta = (k: string | null | undefined) => RFM_SEGMENTS.find((s) => s.key === k);

export type RfmOrder = { at: Date | string | number; total: number };
export type RfmCustomer = { id: string; orders: RfmOrder[] };
export type RfmResult = { id: string; r: number; f: number; m: number; recencyDays: number; frequency: number; monetary: number; lastAt: string; segment: RfmKey };

/** Điểm 1–5 theo vị trí trong phân bố (hạng trung bình khi bằng nhau, nên điểm bằng nhau cho giá trị bằng nhau). */
export function quintile(sorted: number[], v: number) {
  const n = sorted.length;
  if (!n) return 3;
  let less = 0;
  let equal = 0;
  for (const x of sorted) {
    if (x < v) less++;
    else if (x === v) equal++;
  }
  if (equal === n) return 3; // mọi người như nhau → trung bình
  const p = (less + equal / 2) / n;
  return Math.min(5, Math.floor(p * 5) + 1);
}

/** Xếp nhóm từ điểm R, F, M (1–5) và số đơn. */
export function segmentOf(r: number, f: number, m: number, frequency = f): RfmKey {
  const fm = (f + m) / 2;
  if (r >= 4 && fm >= 4) return "vip";
  if (r >= 4 && frequency <= 1) return "new";
  if (r >= 3 && fm >= 3.5) return "loyal";
  if (r >= 4) return "potential";
  if (r === 3) return "attention";
  if (fm >= 3) return "at_risk";
  if (r === 2) return "sleeping";
  return "hibernating";
}

/**
 * Chấm RFM cho các khách có đơn trong khoảng `months` tháng gần nhất.
 * Khách chỉ có đơn cũ hơn khoảng đó → "Đã ngủ đông" (R=F=M=1). Khách chưa có đơn không có trong kết quả.
 */
export function computeRfm(customers: RfmCustomer[], now: Date | number = Date.now(), months = 12): RfmResult[] {
  const t = typeof now === "number" ? now : now.getTime();
  const from = t - months * 30.44 * 864e5;
  const rows: { id: string; recencyDays: number; frequency: number; monetary: number; lastAt: number; old: boolean }[] = [];
  for (const c of customers) {
    const all = c.orders.map((o) => ({ at: new Date(o.at).getTime(), total: Number(o.total) || 0 })).filter((o) => Number.isFinite(o.at));
    if (!all.length) continue;
    const recent = all.filter((o) => o.at >= from && o.at <= t);
    const lastAt = Math.max(...all.map((o) => o.at));
    if (!recent.length) {
      rows.push({ id: c.id, recencyDays: Math.floor((t - lastAt) / 864e5), frequency: 0, monetary: 0, lastAt, old: true });
      continue;
    }
    const last = Math.max(...recent.map((o) => o.at));
    rows.push({ id: c.id, recencyDays: Math.max(0, Math.floor((t - last) / 864e5)), frequency: recent.length, monetary: recent.reduce((s, o) => s + o.total, 0), lastAt, old: false });
  }
  const live = rows.filter((x) => !x.old);
  const R = live.map((x) => x.recencyDays).sort((a, b) => a - b);
  const F = live.map((x) => x.frequency).sort((a, b) => a - b);
  const M = live.map((x) => x.monetary).sort((a, b) => a - b);
  return rows.map((x) => {
    if (x.old) return { id: x.id, r: 1, f: 1, m: 1, recencyDays: x.recencyDays, frequency: 0, monetary: 0, lastAt: new Date(x.lastAt).toISOString(), segment: "hibernating" as RfmKey };
    const r = 6 - quintile(R, x.recencyDays); // càng ít ngày càng tốt
    const f = quintile(F, x.frequency);
    const m = quintile(M, x.monetary);
    return { id: x.id, r, f, m, recencyDays: x.recencyDays, frequency: x.frequency, monetary: x.monetary, lastAt: new Date(x.lastAt).toISOString(), segment: segmentOf(r, f, m, x.frequency) };
  });
}

export type RfmSummary = { key: RfmKey; label: string; color: string; hint: string; count: number; revenue: number; share: number; avgRecency: number };

/** Tổng hợp theo nhóm: số khách, doanh thu, tỉ trọng doanh thu, số ngày trung bình từ lần mua cuối. */
export function summarizeRfm(rows: RfmResult[]): RfmSummary[] {
  const total = rows.reduce((s, r) => s + r.monetary, 0);
  return RFM_SEGMENTS.map((s) => {
    const xs = rows.filter((r) => r.segment === s.key);
    const revenue = xs.reduce((a, r) => a + r.monetary, 0);
    return { key: s.key, label: s.label, color: s.color, hint: s.hint, count: xs.length, revenue, share: total ? revenue / total : 0, avgRecency: xs.length ? Math.round(xs.reduce((a, r) => a + r.recencyDays, 0) / xs.length) : 0 };
  });
}

/** Bộ lọc Nhóm khách theo nhóm RFM (đọc data._rfm do job ghi). Bảng cần có trường lọc "f:_rfm" (xem filterFields). */
export const rfmFilter = (key: string) => [{ id: "rfm", field: "f:_rfm", op: "is", value: key }];

/** Trường lọc giả cho Lọc nâng cao của bảng Khách, để nhóm khách lọc được theo _rfm. */
export const RFM_FILTER_FIELD = { key: "f:_rfm", label: "Nhóm RFM", kind: "option" as const, options: RFM_SEGMENTS.map((s) => ({ value: s.key, label: s.label })) };
