// Đọc/ghi localStorage an toàn (chế độ riêng tư có thể chặn). Tách riêng để module nhẹ import được.
export function readLS<T>(key: string, fallback: T): T {
  try {
    const s = window.localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLS(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* bỏ qua */
  }
}
