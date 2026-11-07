// Gọi API JSON cho trang Kho kiến thức (lỗi → Error có thông báo tiếng Việt của máy chủ).
export async function kbApi<T>(url: string, init?: { method?: string; json?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Lỗi ${r.status}`);
  return j as T;
}
export const errText = (e: unknown, f = "Có lỗi, thử lại nhé") => (e instanceof Error && e.message ? e.message : f);
export const pct = (n: number) => `${Math.round(n * 100)}%`;
