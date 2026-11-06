// Chia hội thoại (thuần, dùng được phía trình duyệt): kiểu cấu hình, mặc định, chuẩn hoá và thuật toán chọn người.
import { z } from "zod";
import { DEFAULT_HOURS, DEFAULT_TZ, hm, type WorkingHours } from "./hours";

export type AssignMode = "off" | "self" | "auto";
export type AssignMethod = "round_robin" | "online_only" | "online_first" | "least_open";
export type AssignGroup = { id: string; name: string; teamId?: string; members: string[]; ratio: number };

export type InboxAssignPref = {
  mode: AssignMode;
  /** Nhân viên không có quyền "Xem mọi hội thoại" chỉ thấy hội thoại của mình + chưa giao. */
  membersSeeOnlyMine: boolean;
  /** Hội thoại chưa giao: người trả lời đầu tiên tự thành người phụ trách. */
  autoAssignFirstReplier: boolean;
  groups: AssignGroup[];
  /** Ai nhận hội thoại tin nhắn / bình luận (rỗng = mọi người trong nhóm). */
  perChannel: { inbox: string[]; comment: string[] };
  method: AssignMethod;
  /** Sau N phút khách chờ mà người phụ trách ngoại tuyến → chia lại cho người đang trực (0 = tắt). */
  reassignAfterMin: number;
  workingHours: WorkingHours;
  /** Khách cũ quay lại → giao lại người đã chăm trước đó. */
  keepPrevious: boolean;
  /** Ngoài giờ làm việc vẫn chia ngay (mặc định: chờ, đầu ca mới chia). */
  offHoursAssign: boolean;
};

export const ASSIGN_DEFAULT: InboxAssignPref = {
  mode: "off",
  membersSeeOnlyMine: false,
  autoAssignFirstReplier: true,
  groups: [],
  perChannel: { inbox: [], comment: [] },
  method: "round_robin",
  reassignAfterMin: 0,
  workingHours: DEFAULT_HOURS,
  keepPrevious: true,
  offHoursAssign: false,
};

export const MODE_INFO: Record<AssignMode, { title: string; desc: string }> = {
  off: { title: "Không chia", desc: "Hội thoại mới để trống người phụ trách. Quản lý tự giao tay khi cần." },
  self: { title: "Tự nhận", desc: "Ai rảnh thì bấm nhận hoặc trả lời trước sẽ thành người phụ trách. Hợp đội nhỏ, mọi người cùng trực." },
  auto: { title: "Xoay vòng tự động", desc: "Hệ thống tự chia lần lượt cho nhân viên theo tỉ lệ từng nhóm, ngay khi khách nhắn tới." },
};

export const METHOD_INFO: Record<AssignMethod, { title: string; desc: string }> = {
  round_robin: { title: "Lần lượt", desc: "Chia đều theo thứ tự, không cần biết ai đang online." },
  online_first: { title: "Ưu tiên người đang trực", desc: "Chia cho người đang mở hộp thư; nếu không ai trực thì chia lần lượt như thường." },
  online_only: { title: "Chỉ người đang trực", desc: "Chỉ chia cho người đang mở hộp thư; không ai trực thì để chờ." },
  least_open: { title: "Ít việc nhất", desc: "Chia cho người đang có ít hội thoại chưa xong nhất trong nhóm." },
};

const name = z.string().trim().min(1).max(120);
const hhmm = z.string().refine((s) => hm(s) != null, "Giờ dạng HH:MM");

export const InboxAssignSchema = z.object({
  mode: z.enum(["off", "self", "auto"]),
  membersSeeOnlyMine: z.boolean(),
  autoAssignFirstReplier: z.boolean(),
  groups: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1, "Nhập tên nhóm").max(80),
        teamId: z.string().max(40).optional(),
        members: z.array(name).max(200),
        ratio: z.number().int().min(0).max(100),
      }),
    )
    .max(30),
  perChannel: z.object({ inbox: z.array(name).max(200), comment: z.array(name).max(200) }),
  method: z.enum(["round_robin", "online_only", "online_first", "least_open"]),
  reassignAfterMin: z.number().int().min(0).max(1440),
  workingHours: z.object({
    tz: z.string().min(1).max(60),
    days: z.array(z.object({ day: z.number().int().min(0).max(6), start: hhmm, end: hhmm })).max(7),
  }),
  keepPrevious: z.boolean(),
  offHoursAssign: z.boolean(),
});

const uniq = (xs: string[]) => [...new Set(xs.map((s) => s.trim()).filter(Boolean))];

/** Ghép giá trị đã lưu với mặc định và làm sạch (tên trùng, tỉ lệ âm, ngày lặp). */
export function normAssignPref(p: Partial<InboxAssignPref> | null | undefined): InboxAssignPref {
  const v = { ...ASSIGN_DEFAULT, ...(p ?? {}) };
  const days = new Map<number, { day: number; start: string; end: string }>();
  for (const d of v.workingHours?.days ?? []) if (d && hm(d.start) != null && hm(d.end) != null && d.day >= 0 && d.day <= 6) days.set(d.day, { day: d.day, start: d.start, end: d.end });
  return {
    mode: (["off", "self", "auto"] as const).includes(v.mode) ? v.mode : "off",
    membersSeeOnlyMine: !!v.membersSeeOnlyMine,
    autoAssignFirstReplier: v.autoAssignFirstReplier !== false,
    groups: (v.groups ?? []).map((g, i) => ({ id: String(g.id || `g${i + 1}`), name: String(g.name || `Nhóm ${i + 1}`), ...(g.teamId ? { teamId: g.teamId } : {}), members: uniq(g.members ?? []), ratio: Math.max(0, Math.round(Number(g.ratio) || 0)) })),
    perChannel: { inbox: uniq(v.perChannel?.inbox ?? []), comment: uniq(v.perChannel?.comment ?? []) },
    method: (["round_robin", "online_only", "online_first", "least_open"] as const).includes(v.method) ? v.method : "round_robin",
    reassignAfterMin: Math.max(0, Math.min(1440, Math.round(Number(v.reassignAfterMin) || 0))),
    workingHours: { tz: v.workingHours?.tz || DEFAULT_TZ, days: [...days.values()].sort((a, b) => a.day - b.day) },
    keepPrevious: v.keepPrevious !== false,
    offHoursAssign: !!v.offHoursAssign,
  };
}

/* ───────────── Thuật toán chọn người ───────────── */

/** Con trỏ lưu ở Pref "inboxAssignCursor": trọng số hiện tại của từng nhóm (smooth weighted round-robin) + vị trí trong nhóm. */
export type AssignCursor = { weights: Record<string, number>; pos: Record<string, number> };
export const EMPTY_CURSOR: AssignCursor = { weights: {}, pos: {} };

export type PickInput = {
  pref: InboxAssignPref;
  kind: "inbox" | "comment";
  /** Tên người đang trực tuyến. */
  online: Iterable<string>;
  /** Số hội thoại chưa xong của từng người (cho least_open). */
  openCounts?: Record<string, number>;
  /** Danh sách nhân viên hợp lệ (thành viên workspace). Không có nhóm nào → chia trong danh sách này. */
  staff: string[];
  cursor: AssignCursor;
  /** Không chọn những người này (vd. người phụ trách cũ đang ngoại tuyến khi chia lại). */
  exclude?: string[];
  /** Bắt buộc người đang trực (dùng khi chia lại). */
  requireOnline?: boolean;
};
export type PickResult = { name: string; groupId: string; cursor: AssignCursor; reason: string };

/** Các nhóm và thành viên đủ điều kiện nhận loại hội thoại này. */
export function eligibleGroups(pref: InboxAssignPref, kind: "inbox" | "comment", staff: string[]): AssignGroup[] {
  const valid = new Set(staff);
  const channelList = pref.perChannel[kind] ?? [];
  const allowCh = channelList.length ? new Set(channelList) : null;
  const filt = (ms: string[]) => uniq(ms).filter((m) => (valid.size ? valid.has(m) : true) && (!allowCh || allowCh.has(m)));
  const groups = pref.groups.filter((g) => g.ratio > 0);
  if (!pref.groups.length) {
    const members = filt(channelList.length ? channelList : staff);
    return members.length ? [{ id: "_all", name: "Mọi người", members, ratio: 1 }] : [];
  }
  return groups.map((g) => ({ ...g, members: filt(g.members) })).filter((g) => g.members.length);
}

/**
 * Chọn người nhận hội thoại:
 * 1. Lọc nhóm/thành viên theo loại hội thoại (tin nhắn / bình luận) và theo cách chia (đang trực...).
 * 2. Chọn nhóm theo tỉ lệ bằng "smooth weighted round-robin" (tỉ lệ 2:1 → A A B, rải đều chứ không dồn cục).
 * 3. Trong nhóm: lần lượt theo con trỏ; least_open → người ít hội thoại mở nhất, hoà thì theo lượt.
 * Không ai phù hợp → name "".
 */
export function pickAssignee(input: PickInput): PickResult {
  const { pref, kind, cursor } = input;
  const online = new Set(input.online);
  const exclude = new Set(input.exclude ?? []);
  const base = eligibleGroups(pref, kind, input.staff).map((g) => ({ ...g, members: g.members.filter((m) => !exclude.has(m)) }));
  const onlineGroups = base.map((g) => ({ ...g, members: g.members.filter((m) => online.has(m)) })).filter((g) => g.members.length);
  let groups = base.filter((g) => g.members.length);
  let reason = METHOD_INFO[pref.method].title;
  if (input.requireOnline || pref.method === "online_only") {
    groups = onlineGroups;
  } else if (pref.method === "online_first" && onlineGroups.length) {
    groups = onlineGroups;
    reason = "Ưu tiên người đang trực";
  } else if (pref.method === "online_first") reason = "Không ai trực, chia lần lượt";
  if (!groups.length) return { name: "", groupId: "", cursor, reason: "Không có người phù hợp" };

  // Smooth weighted round-robin giữa các nhóm.
  const weights = { ...cursor.weights };
  let total = 0;
  let best = groups[0];
  for (const g of groups) {
    weights[g.id] = (weights[g.id] ?? 0) + g.ratio;
    total += g.ratio;
    if (weights[g.id] > weights[best.id]) best = g;
  }
  weights[best.id] -= total;
  // Nhóm đã bị xoá thì bỏ trọng số cũ.
  for (const k of Object.keys(weights)) if (!pref.groups.some((g) => g.id === k) && k !== "_all") delete weights[k];

  // Lượt trong nhóm: xoay theo vị trí trong danh sách đầy đủ của nhóm (ổn định khi có người offline / bị loại).
  const pos = { ...cursor.pos };
  const full = best.id === "_all" ? best.members : uniq(pref.groups.find((g) => g.id === best.id)?.members ?? best.members);
  const L = full.length;
  const start = ((pos[best.id] ?? 0) % L + L) % L;
  const avail = new Set(best.members);
  const order: string[] = [];
  for (let k = 0; k < L; k++) if (avail.has(full[(start + k) % L])) order.push(full[(start + k) % L]);
  let chosen = order[0];
  if (pref.method === "least_open" && input.openCounts) {
    const oc = input.openCounts;
    chosen = order.reduce((m, x) => ((oc[x] ?? 0) < (oc[m] ?? 0) ? x : m), order[0]);
  }
  pos[best.id] = (full.indexOf(chosen) + 1) % L;
  return { name: chosen, groupId: best.id, cursor: { weights, pos }, reason };
}

/** Người cũ còn hợp lệ để giao lại không (là nhân viên, nhận được loại hội thoại này, không bắt buộc online trừ online_only). */
export function canKeepPrevious(pref: InboxAssignPref, kind: "inbox" | "comment", staff: string[], prev: string, online: Iterable<string>): boolean {
  if (!pref.keepPrevious || !prev || !staff.includes(prev)) return false;
  const ch = pref.perChannel[kind] ?? [];
  if (ch.length && !ch.includes(prev)) return false;
  if (pref.method === "online_only" && !new Set(online).has(prev)) return false;
  return true;
}
