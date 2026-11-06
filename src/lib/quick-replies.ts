// Mẫu trả lời nhanh, chủ đề mẫu và thẻ hội thoại: phần thuần (client + server, có test).
import { parseTable, toCsv } from "./csv";

export type QuickReplyDTO = { id: string; shortcut: string; topic: string; content: string; attachments: string[]; sort: number; uses: number; createdBy: string };
/** Chủ đề mẫu (Pref "quickReplyTopics") và thẻ hội thoại (Pref "inboxTags") cùng dạng. */
export type Topic = { key: string; name: string; color: string };
export type InboxTag = Topic;

export const VARIABLES = [
  { key: "ten", label: "Tên gọi của khách (chữ cuối)", example: "Lan" },
  { key: "ten_day_du", label: "Họ tên đầy đủ của khách", example: "Nguyễn Thị Lan" },
  { key: "nhan_vien", label: "Tên nhân viên đang chat", example: "Thu Trang" },
  { key: "trang", label: "Tên trang / kênh", example: "Hương Spa" },
  { key: "sdt", label: "SĐT của khách (nếu đã có)", example: "0912 345 678" },
  { key: "ngay", label: "Ngày hôm nay", example: "06/11/2026" },
] as const;
export type VarKey = (typeof VARIABLES)[number]["key"];
export type Vars = Partial<Record<VarKey, string>>;

/** Tên gọi thân mật: chữ cuối của họ tên ("Nguyễn Thị Lan" → "Lan"). Tên tạm "Khách Zalo" → rỗng. */
export const givenName = (name: string) => (/^Khách\b/.test(name.trim()) ? "" : (name.trim().split(/\s+/).pop() ?? ""));

/** Thay biến {ten} {ten_day_du} {nhan_vien} {trang} {sdt} {ngay}. Biến trống thì bỏ và dọn khoảng trắng thừa. Biến lạ giữ nguyên. */
export function renderQuickReply(content: string, vars: Vars, now = new Date()): string {
  const v: Vars = { ngay: now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }), ...vars };
  const known = new Set<string>(VARIABLES.map((x) => x.key));
  const out = content.replace(/\{([a-z_]+)\}/g, (m, k: string) => (known.has(k) ? (v[k as VarKey] ?? "").trim() : m));
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/ ([,.!?;:])/g, "$1").replace(/^[ \t]+|[ \t]+$/g, ""))
    .join("\n");
}

/** Biến khách/nhân viên/trang cho một hội thoại. */
export function varsFor(c: { name: string; phones?: string[]; pageName?: string; recordTitle?: string }, me: string, fallbackPage = ""): Vars {
  // Tên tạm ("Khách Messenger") mà hội thoại đã gắn hồ sơ khách → dùng tên trong hồ sơ.
  const name = /^Khách\b/.test(c.name.trim()) && c.recordTitle?.trim() ? c.recordTitle.trim() : c.name;
  return { ten: givenName(name), ten_day_du: /^Khách\b/.test(name) ? "" : name.trim(), nhan_vien: me, trang: c.pageName || fallbackPage, sdt: c.phones?.[0] ?? "" };
}

/** Bỏ dấu, chữ thường: so khớp không dấu. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Chuẩn hoá phím tắt: chữ thường không dấu, chữ số, gạch ngang/dưới. */
export const normShortcut = (s: string) => fold(s.replace(/^\//, "")).replace(/[^a-z0-9_-]+/g, "").slice(0, 40);

/**
 * Đang gõ "/xyz" ngay trước con trỏ? Trả về từ khoá (không có "/") và vị trí bắt đầu của "/".
 * Chỉ nhận "/" ở đầu ô hoặc sau khoảng trắng (không bắt nhầm link http://).
 */
export function slashToken(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)\/([^\s/]{0,40})$/.exec(before);
  if (!m) return null;
  return { query: m[2], start: before.length - m[2].length - 1 };
}

/** Gợi ý mẫu theo từ khoá: khớp đầu phím tắt > chứa trong phím tắt > chứa trong nội dung; cùng hạng thì dùng nhiều hơn lên trước. */
export function suggestQuick(list: QuickReplyDTO[], query: string, limit = 8): QuickReplyDTO[] {
  const q = fold(query.trim());
  const rank = (r: QuickReplyDTO) => {
    if (!q) return 1;
    const sc = fold(r.shortcut);
    if (sc.startsWith(q)) return 0;
    if (sc.includes(q)) return 1;
    if (fold(r.content).includes(q) || fold(r.topic).includes(q)) return 2;
    return 9;
  };
  return list
    .map((r) => ({ r, k: rank(r) }))
    .filter((x) => x.k < 9)
    .sort((a, b) => a.k - b.k || b.r.uses - a.r.uses || a.r.sort - b.r.sort)
    .slice(0, limit)
    .map((x) => x.r);
}

/** Chèn mẫu vào vị trí "/xyz": thay đoạn từ `start` đến con trỏ. */
export function insertAt(text: string, start: number, caret: number, snippet: string) {
  const next = text.slice(0, start) + snippet + text.slice(caret);
  return { text: next, caret: start + snippet.length };
}

/** Chỉ nhận URL ảnh http(s). */
export const cleanUrls = (xs: unknown): string[] =>
  (Array.isArray(xs) ? xs : [])
    .map((x) => (typeof x === "string" ? x : typeof x === "object" && x && "url" in x ? String((x as { url: unknown }).url) : ""))
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/\S+$/i.test(s))
    .slice(0, 10);

/* ───────────── Nhập / xuất ───────────── */

export type QuickImportRow = { shortcut: string; topic: string; content: string; attachments: string[] };
const CSV_HEAD = ["phim_tat", "chu_de", "noi_dung", "anh"];

export function quickToCsv(list: Pick<QuickReplyDTO, "shortcut" | "topic" | "content" | "attachments">[], topics: Topic[]) {
  const name = (k: string) => topics.find((t) => t.key === k)?.name ?? k;
  return toCsv([CSV_HEAD, ...list.map((r) => [r.shortcut, name(r.topic), r.content, r.attachments.join(" ")])]);
}

/** Đọc tệp JSON (mảng hoặc { items }) hoặc CSV/Excel dán (cột phim_tat, chu_de, noi_dung, anh). Chủ đề trả về theo tên. */
export function parseQuickImport(text: string): QuickImportRow[] {
  const t = text.trim();
  if (!t) return [];
  const rows: QuickImportRow[] = [];
  if (t.startsWith("[") || t.startsWith("{")) {
    let j: unknown;
    try {
      j = JSON.parse(t);
    } catch {
      throw new Error("Tệp JSON không hợp lệ");
    }
    const arr = Array.isArray(j) ? j : (j as { items?: unknown }).items;
    if (!Array.isArray(arr)) throw new Error("Tệp JSON cần là danh sách mẫu");
    for (const x of arr) {
      if (!x || typeof x !== "object") continue;
      const o = x as Record<string, unknown>;
      const content = String(o.content ?? o.noi_dung ?? "").trim();
      if (!content) continue;
      rows.push({ shortcut: normShortcut(String(o.shortcut ?? o.phim_tat ?? "")), topic: String(o.topic ?? o.chu_de ?? "").trim(), content: content.slice(0, 2000), attachments: cleanUrls(o.attachments ?? o.anh) });
    }
    return rows.slice(0, 1000);
  }
  const table = parseTable(t);
  if (!table.length) return [];
  const head = table[0].map((h) => fold(h).replace(/\s+/g, "_"));
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h));
  let iS = idx(["phim_tat", "shortcut", "phim"]);
  let iT = idx(["chu_de", "topic"]);
  let iC = idx(["noi_dung", "content", "mau"]);
  let iA = idx(["anh", "attachments", "hinh"]);
  let body = table.slice(1);
  if (iC < 0) {
    // Không có tiêu đề: coi như cột 1 = phím tắt, 2 = chủ đề, 3 = nội dung, 4 = ảnh.
    [iS, iT, iC, iA] = table[0].length >= 3 ? [0, 1, 2, 3] : [0, -1, 1, -1];
    body = table;
  }
  for (const r of body) {
    const content = (r[iC] ?? "").trim();
    if (!content) continue;
    rows.push({ shortcut: normShortcut(iS >= 0 ? (r[iS] ?? "") : ""), topic: iT >= 0 ? (r[iT] ?? "").trim() : "", content: content.slice(0, 2000), attachments: iA >= 0 ? cleanUrls((r[iA] ?? "").split(/\s+/)) : [] });
  }
  return rows.slice(0, 1000);
}

/* ───────────── Thẻ / chủ đề ───────────── */

export const TAG_COLORS = ["green", "orange", "red", "blue", "purple", "darkblue", "grass", "sky", "berry", "pink", "yellow", "gray"] as const;

/** Khoá từ tên: "Khách VIP" → "khach-vip"; trùng thì thêm số. */
export function keyFromName(name: string, taken: string[]): string {
  const base = fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "the";
  let k = base;
  for (let i = 2; taken.includes(k); i++) k = `${base}-${i}`;
  return k;
}

/** Kiểm tra + làm sạch danh sách thẻ/chủ đề: tên không rỗng, không trùng tên, màu hợp lệ. */
export function cleanTopics(xs: unknown): Topic[] {
  const out: Topic[] = [];
  for (const x of Array.isArray(xs) ? xs : []) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 40);
    if (!name || out.some((t) => fold(t.name) === fold(name))) continue;
    const key = typeof o.key === "string" && /^[a-z0-9_-]{1,40}$/.test(o.key) && !out.some((t) => t.key === o.key) ? o.key : keyFromName(name, out.map((t) => t.key));
    const color = (TAG_COLORS as readonly string[]).includes(String(o.color)) ? String(o.color) : "gray";
    out.push({ key, name, color });
  }
  return out.slice(0, 100);
}

export const parseTags = (json: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
