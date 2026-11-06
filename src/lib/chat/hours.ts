// Giờ làm việc của hộp thư (thuần, dùng được cả phía trình duyệt): kiểm tra đang trong ca,
// và tính thời lượng chỉ trong giờ làm việc (thời gian phản hồi không tính đêm, ngày nghỉ).

export type DayHours = { day: number; start: string; end: string }; // day 0 = Chủ nhật … 6 = Thứ bảy
export type WorkingHours = { tz: string; days: DayHours[] };

export const DEFAULT_TZ = "Asia/Ho_Chi_Minh";
export const DEFAULT_HOURS: WorkingHours = {
  tz: DEFAULT_TZ,
  days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "08:00", end: "21:00" })),
};
export const DAY_LABEL = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
export const DAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** "08:30" → 510 phút. "24:00" hợp lệ (hết ngày). Sai định dạng → null. */
export function hm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

/** Ca làm việc theo thứ: [bắt đầu, kết thúc) tính bằng phút trong ngày; ngày nghỉ không có trong map. */
function windows(wh: WorkingHours): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  for (const d of wh.days ?? []) {
    const a = hm(d.start);
    const b = hm(d.end);
    if (a == null || b == null || b <= a || d.day < 0 || d.day > 6) continue;
    out.set(d.day, [a, b]);
  }
  return out;
}

// Độ lệch múi giờ (phút) theo từng giờ UTC, nhớ lại để tính nhanh khi duyệt hàng chục nghìn tin nhắn.
const offsetMemo = new Map<string, number>();
const fmtMemo = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtMemo.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      f = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    fmtMemo.set(tz, f);
  }
  return f;
}

/** Độ lệch (phút) của múi giờ tz so với UTC tại thời điểm t. */
export function tzOffsetMin(t: number, tz: string): number {
  const hourKey = `${tz}|${Math.floor(t / 3600e3)}`;
  const hit = offsetMemo.get(hourKey);
  if (hit != null) return hit;
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const off = Math.round((asUtc - Math.floor(t / 1000) * 1000) / 60000);
  if (offsetMemo.size > 50000) offsetMemo.clear();
  offsetMemo.set(hourKey, off);
  return off;
}

/** Giờ địa phương: thứ (0–6), phút trong ngày (có phần lẻ), khoá ngày "YYYY-MM-DD", giờ 0–23. */
export function localParts(t: number | Date, tz = DEFAULT_TZ) {
  const ms = typeof t === "number" ? t : t.getTime();
  const local = ms + tzOffsetMin(ms, tz) * 60000;
  const d = new Date(local);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  return { day: d.getUTCDay(), minutes, hour: d.getUTCHours(), dayKey: d.toISOString().slice(0, 10) };
}

/** Lịch không có ngày nào hợp lệ = làm cả ngày, mọi ngày (không giới hạn giờ). */
export const isAlwaysOpen = (wh: WorkingHours | null | undefined) => !wh || windows(wh).size === 0;

/** Thời điểm t có nằm trong giờ làm việc không. */
export function isWorkingTime(t: number | Date, wh: WorkingHours): boolean {
  const w = windows(wh);
  if (w.size === 0) return true;
  const p = localParts(t, wh.tz || DEFAULT_TZ);
  const win = w.get(p.day);
  return !!win && p.minutes >= win[0] && p.minutes < win[1];
}

/**
 * Thời lượng (ms) từ a đến b chỉ tính trong giờ làm việc.
 * Ví dụ: khách nhắn 20:50, ca kết thúc 21:00, nhân viên trả lời 08:05 hôm sau → 15 phút.
 */
export function businessMs(a: number | Date, b: number | Date, wh: WorkingHours): number {
  let t = typeof a === "number" ? a : a.getTime();
  const end = typeof b === "number" ? b : b.getTime();
  if (!(end > t)) return 0;
  const w = windows(wh);
  if (w.size === 0) return end - t;
  const tz = wh.tz || DEFAULT_TZ;
  let total = 0;
  // Mỗi vòng xử lý tối đa một ngày; giới hạn 400 ngày để không treo khi dữ liệu lạ.
  for (let i = 0; i < 800 && t < end; i++) {
    const p = localParts(t, tz);
    const win = w.get(p.day);
    const dayStart = t - p.minutes * 60000; // nửa đêm địa phương
    if (win && p.minutes < win[1]) {
      const s = Math.max(t, dayStart + win[0] * 60000);
      const e = Math.min(end, dayStart + win[1] * 60000);
      if (e > s) total += e - s;
      if (e >= end) break;
    }
    t = dayStart + 1440 * 60000; // sang nửa đêm hôm sau
  }
  return total;
}

/** Trung vị (mảng rỗng → null). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** 75000 ms → "1 phút 15 giây"; 0 → "0 giây". null → "—". */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 && m < 10 ? `${m} phút ${s % 60} giây` : `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} giờ ${m % 60} phút` : `${h} giờ`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} ngày ${h % 24} giờ` : `${d} ngày`;
}
