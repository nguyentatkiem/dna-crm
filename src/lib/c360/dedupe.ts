// Ghép trùng hồ sơ khách: hàm thuần (không import server), dùng được ở trình duyệt và kiểm thử.

/** Chuẩn hoá SĐT Việt Nam: bỏ khoảng trắng/dấu chấm/gạch, +84/84 → 0, thiếu số 0 đầu thì thêm. */
export function normPhoneVN(p: unknown) {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("0084")) d = d.slice(2);
  if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d.length >= 9 ? d : "";
}

export const normEmail = (e: unknown) => {
  const s = String(e ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
};

/** Tên bỏ dấu, chữ thường, gộp khoảng trắng: "Nguyễn  Thị An" → "nguyen thi an". */
export const normName = (n: unknown) =>
  String(n ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type DupContact = { id: string; title: string; phone?: string; email?: string; createdAt?: string | Date; score?: number };
export type DupGroup = { key: string; ids: string[]; reasons: string[] };

/** Số chữ số cuối dùng để so khi tên giống nhau mà SĐT gõ khác đầu số. */
const SUFFIX = 6;

/** Khoá ổn định của một nhóm: các id sắp xếp, nối bằng dấu phẩy. */
export const groupKey = (ids: string[]) => [...ids].sort().join(",");

/**
 * Tìm các nhóm hồ sơ trùng: cùng SĐT (đã chuẩn hoá), cùng email (chữ thường),
 * hoặc cùng tên (bỏ dấu) và cùng đuôi SĐT. Nhóm nối bắc cầu (A~B, B~C → A,B,C).
 */
export function findDuplicateGroups(contacts: DupContact[], ignored: Iterable<string> = []): DupGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const why = new Map<string, Set<string>>(); // gốc → lý do (gộp lại sau)
  const pairWhy: [string, string, string][] = [];
  for (const c of contacts) parent.set(c.id, c.id);
  const union = (a: string, b: string, reason: string) => {
    pairWhy.push([a, b, reason]);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const index = (keyOf: (c: DupContact) => string, reason: (k: string) => string) => {
    const seen = new Map<string, string>();
    for (const c of contacts) {
      const k = keyOf(c);
      if (!k) continue;
      const first = seen.get(k);
      if (first) union(first, c.id, reason(k));
      else seen.set(k, c.id);
    }
  };
  index((c) => normPhoneVN(c.phone), (k) => `Trùng số điện thoại ${k}`);
  index((c) => normEmail(c.email), (k) => `Trùng email ${k}`);
  index(
    (c) => {
      const n = normName(c.title);
      const p = normPhoneVN(c.phone);
      return n && p ? `${n}|${p.slice(-SUFFIX)}` : "";
    },
    (k) => `Trùng tên “${k.split("|")[0]}” và đuôi số …${k.split("|")[1]}`,
  );

  const members = new Map<string, string[]>();
  for (const c of contacts) {
    const r = find(c.id);
    members.set(r, [...(members.get(r) ?? []), c.id]);
  }
  for (const [a, , reason] of pairWhy) {
    const r = find(a);
    if (!why.has(r)) why.set(r, new Set());
    why.get(r)!.add(reason);
  }
  const skip = new Set(ignored);
  const out: DupGroup[] = [];
  for (const [r, ids] of members) {
    if (ids.length < 2) continue;
    const key = groupKey(ids);
    if (skip.has(key)) continue;
    out.push({ key, ids, reasons: [...(why.get(r) ?? [])] });
  }
  return out.sort((a, b) => b.ids.length - a.ids.length || a.key.localeCompare(b.key));
}

/** Gợi ý hồ sơ giữ lại: nhiều dữ liệu nhất, rồi điểm cao, rồi tạo sớm nhất. */
export function pickSurvivor<T extends { id: string; createdAt?: string | Date; score?: number; data?: Record<string, unknown> }>(rows: T[]): T | undefined {
  const filled = (r: T) => Object.values(r.data ?? {}).filter((v) => String(v ?? "").trim() !== "").length;
  return [...rows].sort((a, b) => filled(b) - filled(a) || (b.score ?? 0) - (a.score ?? 0) || new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())[0];
}

const empty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");

/**
 * Gộp dữ liệu: giữ giá trị của hồ sơ chính, ô trống thì lấy từ hồ sơ phụ.
 * Danh sách (mảng, trường thẻ) thì nối không lặp; ghi chú dài thì nối thêm đoạn khác nhau.
 */
export function mergeData(survivor: Record<string, unknown>, losers: Record<string, unknown>[], fieldTypes: Record<string, string> = {}) {
  const out: Record<string, unknown> = { ...survivor };
  for (const d of losers) {
    for (const [k, v] of Object.entries(d)) {
      if (empty(v)) continue;
      const cur = out[k];
      if (empty(cur)) {
        out[k] = v;
        continue;
      }
      if (Array.isArray(cur) || Array.isArray(v)) {
        const a = Array.isArray(cur) ? cur : [cur];
        const b = Array.isArray(v) ? v : [v];
        const seen = new Set<string>();
        out[k] = [...a, ...b].filter((x) => {
          const id = JSON.stringify(x);
          return seen.has(id) ? false : (seen.add(id), true);
        });
        continue;
      }
      const t = fieldTypes[k];
      if (t === "tags") {
        const parts = [...String(cur).split(","), ...String(v).split(",")].map((s) => s.trim()).filter(Boolean);
        out[k] = [...new Set(parts)].join(", ");
      } else if (t === "longtext" && String(cur) !== String(v) && !String(cur).includes(String(v))) {
        out[k] = `${cur}\n— ${v}`;
      }
    }
  }
  return out;
}
