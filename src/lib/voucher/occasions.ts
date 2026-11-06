// Ngày đặc biệt (sinh nhật, ngày kỷ niệm): so ngày-tháng, không quan tâm năm. Thuần.

/** Đọc ngày/tháng từ "YYYY-MM-DD" (có thể kèm giờ ISO), "DD/MM/YYYY", "DD-MM-YYYY" hoặc "DD/MM". */
export function parseDayMonth(v: string): { day: number; month: number } | null {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let day: number, month: number;
  if (m) {
    month = +m[2];
    day = +m[3];
  } else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
    day = +m[1];
    month = +m[2];
  } else return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= maxDay ? { day, month } : null;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Hôm nay (hoặc `daysBefore` ngày nữa) có trùng ngày-tháng của `dateValue` không.
 * 29/02 ở năm không nhuận tính là 28/02. Dùng giờ máy của `today`.
 */
export function isAnniversaryToday(dateValue: string, today: Date, daysBefore = 0) {
  const dm = parseDayMonth(dateValue);
  if (!dm) return false;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.max(0, Math.trunc(daysBefore)));
  let { day } = dm;
  if (dm.month === 2 && day === 29 && !isLeap(t.getFullYear())) day = 28;
  return t.getMonth() + 1 === dm.month && t.getDate() === day;
}
