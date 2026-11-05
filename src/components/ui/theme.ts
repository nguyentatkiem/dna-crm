// Giao diện sáng/tối dùng chung. Khoá localStorage "crm_theme": light | dark | system.
// Script chống nháy trong src/app/layout.tsx đặt data-theme trước khi vẽ trang.
export type Theme = "light" | "dark" | "system";
export const THEME_KEY = "crm_theme";
export const THEME_EVENT = "theme:change";
/** Khoá lưu trạng thái thu gọn sidebar ("1" = thu gọn). */
export const SIDEBAR_KEY = "crm_sidebar_collapsed";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Giao diện đang hiển thị thật (đã quy "system" về sáng/tối). */
export function resolvedTheme(t: Theme = getTheme()): "light" | "dark" {
  if (t !== "system") return t;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Đổi giao diện, lưu lại và báo cho các thành phần khác qua sự kiện "theme:change". */
export function setTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {}
  const el = document.documentElement;
  if (t === "system") delete el.dataset.theme;
  else el.dataset.theme = t;
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: t }));
}

/** Đảo sáng ↔ tối dựa trên giao diện đang thấy. */
export function toggleTheme() {
  setTheme(resolvedTheme() === "dark" ? "light" : "dark");
}

/** Chuỗi script chèn vào <head> để không bị nháy màu khi tải trang. */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.dataset.theme=t;if(localStorage.getItem("${SIDEBAR_KEY}")==="1")d.dataset.sidebar="collapsed";}catch(e){}})();`;
