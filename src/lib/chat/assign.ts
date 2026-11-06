// HỢP ĐỒNG (nhóm "Chia hội thoại & thống kê" hiện thực). Nhóm kênh gọi khi có hội thoại mới hoặc tin mới của khách.
import type { Conversation } from "@prisma/client";
import { db } from "../db";
import { getPref, setPref } from "../prefs";
import { notify, userIdByName } from "../notify";
import { ASSIGN_DEFAULT, canKeepPrevious, EMPTY_CURSOR, normAssignPref, pickAssignee, type AssignCursor, type InboxAssignPref } from "./assign-shared";
import { isWorkingTime } from "./hours";
import { onlineNames } from "./presence";

export { ASSIGN_DEFAULT, type InboxAssignPref } from "./assign-shared";

export const ASSIGN_PREF = "inboxAssign";
export const CURSOR_PREF = "inboxAssignCursor";

export async function loadAssignPref(workspaceId: string): Promise<InboxAssignPref> {
  return normAssignPref(await getPref<Partial<InboxAssignPref>>(workspaceId, ASSIGN_PREF, ASSIGN_DEFAULT));
}

/** Tên các thành viên workspace (chỉ người có tài khoản mới được giao hội thoại). */
export async function staffNames(workspaceId: string): Promise<string[]> {
  const ms = await db.membership.findMany({ where: { workspaceId }, select: { user: { select: { name: true } } } });
  return [...new Set(ms.map((m) => m.user.name.trim()).filter(Boolean))];
}

/** Số hội thoại chưa xong theo người phụ trách. */
export async function openCounts(workspaceId: string): Promise<Record<string, number>> {
  const rows = await db.conversation.groupBy({ by: ["assignee"], where: { workspaceId, status: { not: "done" }, assignee: { not: "" } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.assignee, r._count._all]));
}

/** Người đã chăm khách trước đó: người gửi tin gần nhất trong hội thoại này, hoặc người phụ trách hội thoại khác của cùng khách. */
export async function previousAssignee(workspaceId: string, conv: Pick<Conversation, "id" | "recordId">, staff: string[]): Promise<string> {
  const outs = await db.message.findMany({ where: { conversationId: conv.id, direction: "out", author: { in: staff } }, orderBy: { createdAt: "desc" }, take: 1, select: { author: true } });
  if (outs[0]?.author) return outs[0].author;
  if (conv.recordId) {
    const other = await db.conversation.findFirst({ where: { workspaceId, recordId: conv.recordId, id: { not: conv.id }, assignee: { in: staff } }, orderBy: { lastAt: "desc" }, select: { assignee: true } });
    if (other?.assignee) return other.assignee;
  }
  return "";
}

// Khoá theo workspace: con trỏ xoay vòng được đọc-sửa-ghi tuần tự, hai tin đến cùng lúc không chia trùng lượt.
const g = globalThis as unknown as { inboxAssignLock?: Map<string, Promise<unknown>> };
function locked<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  const m = (g.inboxAssignLock ??= new Map());
  const prev = m.get(workspaceId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  m.set(workspaceId, next.catch(() => undefined));
  return next;
}

const CHANNEL_LABEL: Record<string, string> = { messenger: "Messenger", zalo: "Zalo", facebook: "Facebook", instagram: "Instagram" };

/** Ghi người phụ trách (chỉ khi còn trống, hoặc đúng người cũ khi chia lại) và báo cho họ. Trả true nếu đã ghi. */
export async function applyAssignee(workspaceId: string, conv: Pick<Conversation, "id" | "name" | "channel" | "kind">, name: string, why: string, from = ""): Promise<boolean> {
  const r = await db.conversation.updateMany({ where: { id: conv.id, workspaceId, assignee: from }, data: { assignee: name } });
  if (!r.count) return false;
  const userId = await userIdByName(workspaceId, name);
  if (userId) {
    const what = conv.kind === "comment" ? "bình luận" : "hội thoại";
    await notify(workspaceId, { userId, kind: "inbox", text: `Bạn được giao ${what} “${conv.name || "Khách"}” (${CHANNEL_LABEL[conv.channel] ?? conv.channel}) · ${why}`, href: `/w/inbox?c=${conv.id}` });
  }
  return true;
}

export type AssignDecision = { name: string; reason: string };

/** Quyết định người nhận (không ghi DB, trừ con trỏ xoay vòng). Dùng chung cho tin đến và job chia lại. */
export async function decideAssignee(
  workspaceId: string,
  conv: Pick<Conversation, "id" | "recordId" | "kind">,
  opts: { pref?: InboxAssignPref; exclude?: string[]; requireOnline?: boolean; now?: number; skipHours?: boolean } = {},
): Promise<AssignDecision> {
  const pref = opts.pref ?? (await loadAssignPref(workspaceId));
  if (pref.mode === "off") return { name: "", reason: "Đang tắt chia hội thoại" };
  const kind = conv.kind === "comment" ? "comment" : "inbox";
  const [staff, online] = await Promise.all([staffNames(workspaceId), onlineNames(workspaceId, opts.now)]);
  const exclude = new Set(opts.exclude ?? []);
  if (pref.keepPrevious) {
    const prev = await previousAssignee(workspaceId, conv, staff);
    if (prev && !exclude.has(prev) && canKeepPrevious(pref, kind, staff, prev, online) && (!opts.requireOnline || online.has(prev))) return { name: prev, reason: "khách cũ, giao lại người đã chăm" };
  }
  if (pref.mode !== "auto") return { name: "", reason: "Chế độ tự nhận" };
  if (!opts.skipHours && !pref.offHoursAssign && !isWorkingTime(opts.now ?? Date.now(), pref.workingHours)) return { name: "", reason: "Ngoài giờ làm việc" };
  return locked(workspaceId, async () => {
    const cursor = { ...EMPTY_CURSOR, ...(await getPref<AssignCursor>(workspaceId, CURSOR_PREF, EMPTY_CURSOR)) };
    const counts = pref.method === "least_open" ? await openCounts(workspaceId) : undefined;
    const r = pickAssignee({ pref, kind, online, openCounts: counts, staff, cursor, exclude: [...exclude], requireOnline: opts.requireOnline });
    if (r.name) await setPref(workspaceId, CURSOR_PREF, r.cursor);
    return { name: r.name, reason: r.name ? `chia tự động (${r.reason.toLowerCase()})` : r.reason };
  });
}

/**
 * Chọn người phụ trách cho hội thoại vừa có tin mới (theo Pref "inboxAssign"). Trả tên người hoặc "" nếu không đổi.
 * - Đã có người phụ trách → giữ nguyên, trả "".
 * - "Giao lại người cũ" bật và tìm được người đã chăm khách → giao người đó (cả chế độ Tự nhận).
 * - Chế độ Xoay vòng: chia theo nhóm/tỉ lệ/cách chia; ngoài giờ làm việc thì để chờ (job đầu ca sẽ chia).
 * Đã ghi Conversation.assignee và gửi thông báo "Bạn được giao hội thoại …" cho người nhận; bên gọi có thể ghi lại cùng giá trị.
 */
export async function assignOnIngest(workspaceId: string, conv: Conversation): Promise<string> {
  try {
    if (conv.assignee) return "";
    const d = await decideAssignee(workspaceId, conv);
    if (!d.name) return "";
    return (await applyAssignee(workspaceId, conv, d.name, d.reason)) ? d.name : "";
  } catch (e) {
    console.error("[assignOnIngest]", e instanceof Error ? e.message : e);
    return "";
  }
}

/**
 * Gọi khi nhân viên trả lời: hội thoại chưa giao + bật "Người trả lời đầu tiên nhận hội thoại" → giao cho người đó.
 * Trả tên nếu đã giao. (Job tickInboxReassign cũng tự làm việc này nên không bắt buộc phải gọi.)
 */
export async function assignOnReply(workspaceId: string, conv: Pick<Conversation, "id" | "name" | "channel" | "kind" | "assignee">, staffName: string): Promise<string> {
  if (conv.assignee || !staffName) return "";
  const pref = await loadAssignPref(workspaceId);
  if (!pref.autoAssignFirstReplier) return "";
  if (!(await staffNames(workspaceId)).includes(staffName)) return "";
  const r = await db.conversation.updateMany({ where: { id: conv.id, workspaceId, assignee: "" }, data: { assignee: staffName } });
  return r.count ? staffName : "";
}
