// Chat nội bộ — phần thuần (dùng được ở trình duyệt và kiểm thử): thành viên, đã đọc, chưa đọc, quyền sửa/thu hồi,
// nhận diện link CRM trong tin nhắn.

export const EDIT_WINDOW_MS = 15 * 60e3;
export const DM_NOTIFY_THROTTLE_MS = 2 * 60e3;
export const MAX_BODY = 4000;

export type RefKind = "record" | "order" | "task" | "ticket";
export const REF_KINDS: RefKind[] = ["record", "order", "task", "ticket"];
export type Ref = { kind: RefKind; id: string };
export type RefMeta = { refs: Ref[]; edited?: boolean; deleted?: boolean };

/** Thẻ đính kèm đã giải theo quyền người xem: ok=false → "Không có quyền xem" (không lộ tiêu đề). */
export type RefCard = { kind: RefKind; id: string; ok: true; title: string; sub: string; href: string } | { kind: RefKind; id: string; ok: false };

function parseArr(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export const parseMembers = parseArr;
export const parseReadBy = parseArr;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function parseRefMeta(json: string | null | undefined): RefMeta {
  try {
    const v = JSON.parse(json || "{}") as Partial<RefMeta>;
    const refs = Array.isArray(v.refs) ? v.refs.filter((r): r is Ref => !!r && REF_KINDS.includes(r.kind) && typeof r.id === "string" && ID_RE.test(r.id)) : [];
    return { refs, ...(v.edited ? { edited: true } : {}), ...(v.deleted ? { deleted: true } : {}) };
  } catch {
    return { refs: [] };
  }
}

/**
 * Link CRM dán trong tin nhắn → tham chiếu (tối đa 5). Nhận cả URL đầy đủ và đường dẫn /w/...:
 * /w/b/<bảng>?open=<id>, /w/orders/<id>, /w/tickets/<id>, /w/my-work?task=<id>.
 */
export function extractRefs(text: string): Ref[] {
  const out: Ref[] = [];
  const push = (kind: RefKind, id: string) => {
    if (ID_RE.test(id) && !out.some((r) => r.kind === kind && r.id === id)) out.push({ kind, id });
  };
  const re = /(?:https?:\/\/[^\s/]+)?(\/w\/[^\s<>"')]+)/g;
  for (const m of text.matchAll(re)) {
    let u: URL;
    try {
      u = new URL(m[1].replace(/[.,;:!?]+$/, ""), "http://x");
    } catch {
      continue;
    }
    const p = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean); // ["w", ...]
    if (p[1] === "b" && p[2] && u.searchParams.get("open")) push("record", u.searchParams.get("open")!);
    else if (p[1] === "orders" && p[2] && !["new", "debts"].includes(p[2])) push("order", p[2]);
    else if (p[1] === "tickets" && p[2]) push("ticket", p[2]);
    else if (p[1] === "my-work" && u.searchParams.get("task")) push("task", u.searchParams.get("task")!);
    if (out.length >= 5) break;
  }
  return out;
}

/** Gộp tham chiếu chọn từ nút "Đính kèm" với link dán trong chữ (không trùng, tối đa 5). */
export function mergeRefs(a: Ref[], b: Ref[]): Ref[] {
  const out: Ref[] = [];
  for (const r of [...a, ...b]) if (!out.some((x) => x.kind === r.kind && x.id === r.id)) out.push(r);
  return out.slice(0, 5);
}

type Msg = { userId: string; readByJson: string; refJson?: string };

/** Tin chưa đọc của `me`: của người khác, chưa có `me` trong danh sách đã đọc, chưa bị thu hồi. */
export const isUnread = (m: Msg, me: string) => m.userId !== me && !parseReadBy(m.readByJson).includes(me) && !parseRefMeta(m.refJson).deleted;
export const unreadCount = (msgs: Msg[], me: string) => msgs.filter((m) => isUnread(m, me)).length;

/** Thêm `me` vào danh sách đã đọc; trả null nếu không cần ghi. */
export function withRead(readByJson: string, me: string): string | null {
  const list = parseReadBy(readByJson);
  if (list.includes(me)) return null;
  return JSON.stringify([...list, me]);
}

/** Sửa / thu hồi: chỉ tin của mình, trong 15 phút, chưa bị thu hồi. */
export function canModify(m: { userId: string; createdAt: Date | string; refJson?: string }, me: string, now = Date.now()) {
  if (m.userId !== me) return false;
  if (parseRefMeta(m.refJson).deleted) return false;
  return now - new Date(m.createdAt).getTime() <= EDIT_WINDOW_MS;
}

/** Có nên báo tin nhắn riêng mới không: mỗi hội thoại tối đa một lần / 2 phút / người nhận. */
export const shouldNotifyDm = (lastNotifiedAt: Date | null | undefined, now = Date.now()) => !lastNotifiedAt || now - lastNotifiedAt.getTime() >= DM_NOTIFY_THROTTLE_MS;

/** Tên hiển thị của hội thoại với người xem: nhóm → tên nhóm; 1-1 → tên người kia. */
export function threadTitle(t: { kind: string; name: string; membersJson: string }, me: string, names: Map<string, string>) {
  if (t.kind === "group") return t.name || "Nhóm không tên";
  const other = parseMembers(t.membersJson).find((u) => u !== me) ?? me;
  return names.get(other) ?? "Thành viên cũ";
}

export const dmPartner = (membersJson: string, me: string) => parseMembers(membersJson).find((u) => u !== me) ?? me;

/** Khoá ổn định cho cặp DM (sắp xếp để A–B và B–A là một). */
export const dmMembers = (a: string, b: string) => (a === b ? [a] : [a, b].sort());

/** Tóm tắt tin cuối hiển thị ở danh sách hội thoại. */
export function preview(author: string, body: string, refs: number) {
  const text = body.replace(/\s+/g, " ").trim() || (refs ? "📎 Đính kèm" : "");
  return `${author}: ${text}`.slice(0, 140);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
export const matchesSearch = (body: string, q: string) => !!q.trim() && fold(body).includes(fold(q.trim()));
