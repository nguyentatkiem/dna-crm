export function vnd(n: number) {
  if (!n) return "0";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tỷ";
  if (a >= 1e6) return (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr";
  if (a >= 1e3) return Math.round(n / 1e3).toLocaleString("vi-VN") + "k";
  return n.toLocaleString("vi-VN");
}

export function dateVi(d: string | Date | null | undefined) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function ago(d: string | Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

export const heat = (score: number) =>
  score >= 70 ? { key: "hot", label: "Nóng", color: "red" as const } : score >= 40 ? { key: "warm", label: "Ấm", color: "orange" as const } : { key: "cold", label: "Lạnh", color: "blue" as const };

/**
 * Thông báo lỗi cho người dùng: dùng message của lỗi khi đó là câu tiếng Việt do app tự đặt,
 * còn lỗi kỹ thuật tiếng Anh (Prisma, "Failed to fetch", JsSIP...) thì thay bằng câu dự phòng.
 */
export function viMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return m && /[À-ỹđĐ]/.test(m) && m.length <= 300 && !/prisma|invocation/i.test(m) ? m : fallback;
}
