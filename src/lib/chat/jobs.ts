// Job nền của hộp thư (đăng ký trong src/lib/jobs.ts):
//   tickInboxReassign  — 5 phút   tickSentiment — 5 phút   tickQuality — 15 phút
import { db } from "../db";
import { audit } from "../audit";
import { applyAssignee, decideAssignee, loadAssignPref, staffNames, ASSIGN_PREF } from "./assign";
import { isWorkingTime } from "./hours";
import { onlineNames } from "./presence";

export { tickSentiment } from "./sentiment";
export { tickQuality } from "./quality";

const AGENT = "Chia hội thoại";

/**
 * Mỗi 5 phút, với từng workspace đã cấu hình chia hội thoại:
 * 1. "Người trả lời đầu tiên nhận hội thoại": hội thoại chưa giao mà đã có nhân viên trả lời → giao người đó.
 * 2. Chế độ xoay vòng, trong giờ làm việc: hội thoại chưa giao còn chờ (khách nhắn ngoài giờ trong 24 giờ qua) → chia đầu ca.
 * 3. Chia lại (reassignAfterMin > 0): khách chờ quá N phút mà người phụ trách ngoại tuyến → chuyển cho người đang trực.
 */
export async function tickInboxReassign(now = Date.now()): Promise<{ firstReplier: number; pending: number; reassigned: number }> {
  const out = { firstReplier: 0, pending: 0, reassigned: 0 };
  const prefs = await db.pref.findMany({ where: { key: ASSIGN_PREF }, select: { workspaceId: true, updatedAt: true } });
  for (const { workspaceId, updatedAt } of prefs) {
    const pref = await loadAssignPref(workspaceId);
    const staff = await staffNames(workspaceId);
    // Chỉ xét hoạt động trong 24 giờ qua và sau lần lưu cài đặt gần nhất: bật chế độ mới không xáo trộn hội thoại cũ.
    const dayAgo = new Date(Math.max(now - 864e5, updatedAt.getTime()));

    if (pref.autoAssignFirstReplier) {
      const rows = await db.conversation.findMany({ where: { workspaceId, assignee: "", lastOutAt: { not: null, gte: dayAgo } }, select: { id: true }, take: 200 });
      if (rows.length) {
        const firsts = await db.message.findMany({ where: { conversationId: { in: rows.map((r) => r.id) }, direction: "out", author: { in: staff } }, orderBy: { createdAt: "asc" }, select: { conversationId: true, author: true } });
        const first = new Map<string, string>();
        for (const m of firsts) if (!first.has(m.conversationId)) first.set(m.conversationId, m.author);
        for (const [id, author] of first) {
          const r = await db.conversation.updateMany({ where: { id, workspaceId, assignee: "" }, data: { assignee: author } });
          out.firstReplier += r.count;
        }
      }
    }

    if (pref.mode === "off") continue;
    const working = isWorkingTime(now, pref.workingHours);

    const online = await onlineNames(workspaceId, now);
    if (pref.mode === "auto" && working) {
      const waiting = await db.conversation.findMany({
        where: { workspaceId, assignee: "", status: { not: "done" }, lastInAt: { gte: dayAgo }, lastOutAt: null },
        orderBy: { lastInAt: "asc" },
        take: 100,
        select: { id: true, name: true, channel: true, kind: true, recordId: true },
      });
      for (const c of waiting) {
        // Đầu ca: có người đang trực thì chỉ chia cho người trực (tránh giao cho người chưa vào ca rồi lại phải chia lại).
        const d = await decideAssignee(workspaceId, c, { pref, now, requireOnline: online.size > 0 });
        if (d.name && (await applyAssignee(workspaceId, c, d.name, `${d.reason}, đầu ca`))) out.pending++;
      }
    }

    if (pref.reassignAfterMin > 0 && working) {
      if (!online.size) continue;
      const cut = new Date(now - pref.reassignAfterMin * 60_000);
      const stale = await db.conversation.findMany({
        where: { workspaceId, assignee: { not: "" }, status: { not: "done" }, lastInAt: { lte: cut, gte: dayAgo } },
        orderBy: { lastInAt: "asc" },
        take: 200,
        select: { id: true, name: true, channel: true, kind: true, recordId: true, assignee: true, lastInAt: true, lastOutAt: true },
      });
      const moved: string[] = [];
      for (const c of stale) {
        if (c.lastOutAt && c.lastInAt && c.lastOutAt >= c.lastInAt) continue; // đã trả lời
        if (online.has(c.assignee)) continue;
        const d = await decideAssignee(workspaceId, c, { pref, now, exclude: [c.assignee], requireOnline: true });
        if (!d.name) continue;
        if (await applyAssignee(workspaceId, c, d.name, `chia lại vì ${c.assignee} ngoại tuyến quá ${pref.reassignAfterMin} phút`, c.assignee)) {
          moved.push(`${c.name || "Khách"}: ${c.assignee} → ${d.name}`);
          out.reassigned++;
        }
      }
      if (moved.length) {
        await db.agentLog.create({ data: { workspaceId, agent: AGENT, message: `Chia lại ${moved.length} hội thoại khách chờ lâu (người phụ trách ngoại tuyến)` } });
        await audit({ workspaceId, user: { id: "", name: AGENT } }, "inbox.reassign", "conversation", "", moved.slice(0, 20).join("; ")).catch(() => undefined);
      }
    }
  }
  return out;
}
