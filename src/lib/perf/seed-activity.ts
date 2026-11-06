// Dữ liệu mẫu cho trang Tổng quan / Hồ sơ hiệu suất: hoạt động trải đều 10 tuần qua, theo giờ làm việc,
// mỗi nhân viên một "phong cách" khác nhau để bảng xếp hạng, bản đồ nhiệt, phễu và xu hướng có ý nghĩa.
// Chạy lại không sinh trùng (đánh dấu ở Pref "perfActivitySeed").
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { wonLost } from "../metrics";
import { setPref } from "../prefs";
import { allMembers } from "./teams";
import { clearFactsCache, perfPeople } from "./facts";

const MARK = "perfActivitySeed";
const D = 864e5;
const VN = 7 * 3600e3;

/** PRNG có hạt giống (mulberry32) để dữ liệu mẫu ổn định giữa các lần gieo ở workspace mới. */
function rng(seed: string) {
  let a = [...seed].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0), 1779033703);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ngọc Anh", "Thanh Hương", "Minh Thư", "Quốc Bảo", "Hải Yến", "Đức Anh", "Phương Linh", "Gia Hân", "Tuấn Kiệt", "Bảo Châu", "Khánh Linh", "Hoàng Nam"];
const LAST = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Ngô"];
const NOTES = ["Đã gọi tư vấn, khách hẹn cuối tuần quyết định.", "Gửi bảng giá qua Zalo, khách đang so sánh.", "Khách hỏi thêm về ưu đãi tháng này.", "Đã xác nhận lịch hẹn, nhắc khách mang theo kết quả cũ.", "Khách phản hồi tốt sau buổi đầu.", "Ghi chú: khách thích liên hệ buổi tối."];
const MSG_IN = ["Cho mình hỏi giá gói này với ạ", "Bên mình còn lịch trống thứ 7 không?", "Mình muốn đổi lịch sang tuần sau", "Có ưu đãi cho khách cũ không em?", "Ok em, để chị sắp xếp"];
const MSG_OUT = ["Dạ em gửi chị bảng giá chi tiết ạ", "Dạ thứ 7 còn khung 9h và 15h chị nhé", "Dạ em đã đổi lịch cho chị rồi ạ", "Dạ khách cũ được giảm 10% chị ạ", "Dạ em cảm ơn chị, có gì chị nhắn em nhé"];

/** Giờ làm việc ngẫu nhiên (giờ VN) trong ngày chứa t, lệch theo "giờ quen" của từng người. */
function workTime(day: number, r: () => number, peak: number) {
  const vnMidnight = Math.floor((day + VN) / D) * D - VN;
  const h = Math.max(7, Math.min(21, Math.round(peak + (r() - 0.5) * 8)));
  return vnMidnight + h * 3600e3 + Math.floor(r() * 60) * 60e3;
}

export async function seedPerfActivity(workspaceId: string): Promise<{ skipped: boolean; created?: Record<string, number> }> {
  if (await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: MARK } }, select: { key: true } })) return { skipped: true };
  const cfgRow = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  const cfg = cfgRow ? parseJson<WorkspaceConfig | null>(cfgRow.configJson, null) : null;
  if (!cfg) return { skipped: true };
  const { people, teams } = await perfPeople(workspaceId, cfg);
  if (!people.length) return { skipped: true };

  const r = rng(workspaceId);
  const now = Date.now();
  const start = now - 70 * D;
  const deals = getObject(cfg, "deals");
  const contacts = getObject(cfg, "contacts");
  const { won, lost } = wonLost(cfg);
  const wonKey = [...won][0];
  const lostKey = [...lost][0];
  const openKeys = (deals?.statuses ?? []).map((s) => s.key).filter((k) => !won.has(k) && !lost.has(k));
  const label = (k: string) => deals?.statuses.find((s) => s.key === k)?.label ?? k;
  const care = new Set(teams.filter((t) => /chăm sóc|cskh|hỗ trợ/i.test(t.name)).flatMap(allMembers));
  const n: Record<string, number> = { contacts: 0, deals: 0, calls: 0, activities: 0, conversations: 0, messages: 0, tasks: 0, tickets: 0, quotes: 0, orders: 0 };
  const seq = { q: 0, o: 0, t: 0 };

  for (const [i, who] of people.entries()) {
    // Phong cách: người đầu mạnh về chốt, người sau gọi nhiều nhưng phản hồi chậm hơn…
    const p = {
      callsPerWeek: 6 + ((i * 5) % 9),
      connect: 0.45 + ((i * 17) % 40) / 100,
      quality: 55 + ((i * 13) % 35),
      replyMin: [6, 25, 70, 12, 140][i % 5],
      stlMin: [15, 45, 180, 30, 600][i % 5],
      taskDone: 0.65 + ((i * 7) % 30) / 100,
      peak: [10, 14, 16, 9, 19][i % 5],
      winRate: 0.4 + ((i * 11) % 40) / 100,
      trend: [1.15, 0.95, 0.7, 1.05, 1.3][i % 5], // tuần gần đây nhiều/ít hơn tuần đầu
    };
    const weekFactor = (t: number) => 1 + (p.trend - 1) * ((t - start) / (now - start));
    const myContacts: string[] = (await db.record.findMany({ where: { workspaceId, objectKey: "contacts", ownerName: who, deletedAt: null }, select: { id: true }, take: 20 })).map((x) => x.id);

    // Khách mới (lead) + điểm chạm đầu tiên.
    for (let d = start + Math.floor(r() * 5) * D; d < now - D; d += (6 + Math.floor(r() * 6)) * D) {
      if (!contacts) break;
      const at = workTime(d, r, p.peak);
      const title = `${LAST[Math.floor(r() * LAST.length)]} ${FIRST[Math.floor(r() * FIRST.length)]}`;
      const c = await db.record.create({ data: { workspaceId, objectKey: "contacts", title, status: contacts.statuses[0]?.key ?? "", ownerName: who, dataJson: JSON.stringify({ source: "Mẫu hiệu suất" }), createdAt: new Date(at), updatedAt: new Date(at) } });
      n.contacts++;
      myContacts.push(c.id);
      if (r() < 0.85) {
        const touch = at + Math.max(2, Math.round(p.stlMin * (0.3 + r() * 1.6))) * 60e3;
        await db.call.create({ data: { workspaceId, recordId: c.id, direction: "out", agentName: who, outcome: r() < p.connect ? "connected" : "no_answer", durationSec: Math.round(60 + r() * 240), provider: "manual", note: "Gọi lần đầu", startedAt: new Date(touch), createdAt: new Date(touch), aiScore: Math.round(p.quality + (r() - 0.5) * 20) } });
        n.calls++;
      }
    }

    // Cuộc gọi rải đều theo tuần, giờ quen.
    const calls: Parameters<typeof db.call.createMany>[0]["data"] = [];
    for (let d = start; d < now; d += D) {
      const dow = new Date(d + VN).getUTCDay();
      if (dow === 0) continue;
      const k = Math.round((p.callsPerWeek / 6) * weekFactor(d) * (0.4 + r() * 1.2));
      for (let j = 0; j < k; j++) {
        const at = workTime(d, r, p.peak);
        if (at > now) continue;
        const talked = r() < p.connect;
        const outcome = !talked ? (r() < 0.6 ? "no_answer" : "busy") : r() < 0.3 ? "appointment" : r() < 0.1 ? "won" : r() < 0.5 ? "connected" : r() < 0.6 ? "callback" : "not_interested";
        calls.push({ workspaceId, recordId: myContacts.length ? myContacts[Math.floor(r() * myContacts.length)] : null, direction: "out", agentName: who, outcome, durationSec: talked ? Math.round(40 + r() * 400) : 0, provider: "manual", startedAt: new Date(at), createdAt: new Date(at), aiScore: talked && r() < 0.7 ? Math.max(20, Math.min(100, Math.round(p.quality + (r() - 0.5) * 30))) : null });
      }
    }
    if (calls.length) await db.call.createMany({ data: calls });
    n.calls += calls.length;

    // Giao dịch: thắng/thua có hoạt động đổi trạng thái; vài giao dịch đang mở bị bỏ quên (tồn đọng).
    if (deals && wonKey && lostKey) {
      for (let d = start; d < now - 5 * D; d += (8 + Math.floor(r() * 8)) * D) {
        const created = workTime(d, r, p.peak);
        const closedAt = Math.min(now - D, created + Math.round((3 + r() * 20) * D));
        const isWon = r() < p.winRate;
        const amount = Math.round((3 + r() * 25) * 1e6 / 1e5) * 1e5;
        const contactId = myContacts.length ? myContacts[Math.floor(r() * myContacts.length)] : null;
        const status = isWon ? wonKey : lostKey;
        const rec = await db.record.create({ data: { workspaceId, objectKey: "deals", title: `Gói dịch vụ ${(n.deals + 1).toString().padStart(2, "0")} – ${who}`, status, ownerName: who, amount, dataJson: JSON.stringify(contactId ? { contactId } : {}), createdAt: new Date(created), updatedAt: new Date(closedAt) } });
        n.deals++;
        await db.activity.create({ data: { recordId: rec.id, kind: "system", author: who, body: `${who} đổi ${deals.statusLabel.toLowerCase()} từ “${label(openKeys[0] ?? "")}” sang “${label(status)}”`, createdAt: new Date(closedAt) } });
        if (isWon) {
          const order = await db.order.create({ data: { workspaceId, number: `DH-HS-${String(++seq.o).padStart(4, "0")}-${workspaceId.slice(-4)}`, recordId: rec.id, contactId, customerName: "Khách mẫu", status: "done", total: amount, subtotal: amount, paid: amount, createdBy: who, createdAt: new Date(closedAt), updatedAt: new Date(closedAt) } });
          await db.payment.create({ data: { workspaceId, orderId: order.id, amount, method: "transfer", paidAt: new Date(closedAt), createdBy: who, createdAt: new Date(closedAt) } });
          n.orders++;
        }
        if (r() < 0.6) {
          await db.quote.create({ data: { workspaceId, number: `BG-HS-${String(++seq.q).padStart(4, "0")}-${workspaceId.slice(-4)}`, recordId: rec.id, contactId, customerName: "Khách mẫu", title: rec.title, status: isWon ? "accepted" : "sent", total: amount, subtotal: amount, createdBy: who, createdAt: new Date(created + D), updatedAt: new Date(created + D) } });
          n.quotes++;
        }
      }
      for (let j = 0; j < 1 + (i % 3); j++) {
        const idle = now - (18 + Math.floor(r() * 30)) * D;
        await db.record.create({ data: { workspaceId, objectKey: "deals", title: `Khách đang cân nhắc ${j + 1} – ${who}`, status: openKeys[0] ?? wonKey, ownerName: who, amount: Math.round(5 + r() * 15) * 1e6, createdAt: new Date(idle - 5 * D), updatedAt: new Date(idle) } });
        n.deals++;
      }
    }

    // Ghi chú / cập nhật.
    const recIds = (await db.record.findMany({ where: { workspaceId, ownerName: who, deletedAt: null }, select: { id: true }, take: 40 })).map((x) => x.id);
    const acts: Parameters<typeof db.activity.createMany>[0]["data"] = [];
    for (let d = start; d < now && recIds.length; d += D) {
      if (r() < 0.45) continue;
      const at = workTime(d, r, p.peak + 1);
      if (at < now) acts.push({ recordId: recIds[Math.floor(r() * recIds.length)], kind: "update", author: who, body: NOTES[Math.floor(r() * NOTES.length)], createdAt: new Date(at) });
    }
    if (acts.length) await db.activity.createMany({ data: acts });
    n.activities += acts.length;

    // Hộp thư: 3 hội thoại, khách nhắn → nhân viên trả lời sau ~replyMin phút.
    for (let c = 0; c < 3; c++) {
      const conv = await db.conversation.create({ data: { workspaceId, channel: c % 2 ? "messenger" : "zalo", externalId: `hs-${workspaceId.slice(-6)}-${i}-${c}`, name: `${LAST[(i + c) % LAST.length]} ${FIRST[(i * 3 + c) % FIRST.length]}`, recordId: myContacts[c] ?? null, assignee: who, status: "open", lastAt: new Date(now - c * D), lastText: MSG_OUT[c % MSG_OUT.length] } });
      n.conversations++;
      const msgs: Parameters<typeof db.message.createMany>[0]["data"] = [];
      for (let d = start + c * 3 * D; d < now; d += (4 + Math.floor(r() * 6)) * D) {
        const at = workTime(d, r, p.peak);
        const gap = Math.max(1, Math.round(p.replyMin * (0.2 + r() * 1.8))) * 60e3;
        if (at + gap > now) break;
        msgs.push({ conversationId: conv.id, direction: "in", text: MSG_IN[Math.floor(r() * MSG_IN.length)], createdAt: new Date(at) });
        msgs.push({ conversationId: conv.id, direction: "out", author: who, text: MSG_OUT[Math.floor(r() * MSG_OUT.length)], createdAt: new Date(at + gap) });
      }
      if (msgs.length) await db.message.createMany({ data: msgs });
      n.messages += msgs.length;
    }

    // Việc được giao.
    const tasks: Parameters<typeof db.task.createMany>[0]["data"] = [];
    for (let d = start; d < now + 7 * D; d += Math.floor(1 + r() * 3) * D) {
      const due = workTime(d, r, 17);
      tasks.push({ workspaceId, title: ["Gọi lại khách", "Gửi báo giá", "Xác nhận lịch hẹn", "Chăm sóc sau dịch vụ"][Math.floor(r() * 4)], assignee: who, dueAt: new Date(due), done: due < now && r() < p.taskDone, source: "Mẫu hiệu suất", createdAt: new Date(due - 2 * D), recordId: recIds.length ? recIds[Math.floor(r() * recIds.length)] : null });
    }
    if (tasks.length) await db.task.createMany({ data: tasks });
    n.tasks += tasks.length;

    // Phiếu hỗ trợ cho người thuộc đội chăm sóc (hoặc người cuối danh sách nếu không có đội CSKH).
    if (care.has(who) || (!care.size && i === people.length - 1)) {
      for (let d = start; d < now - D; d += (3 + Math.floor(r() * 4)) * D) {
        const created = workTime(d, r, p.peak);
        const hours = 1 + r() * 40;
        const resolved = created + hours * 3600e3;
        if (resolved > now) continue;
        await db.ticket.create({ data: { workspaceId, number: `TK-HS-${String(++seq.t).padStart(4, "0")}-${workspaceId.slice(-4)}`, recordId: myContacts.length ? myContacts[Math.floor(r() * myContacts.length)] : null, subject: r() < 0.25 ? "Khiếu nại thời gian chờ" : "Hỏi lịch và chính sách", category: r() < 0.25 ? "Khiếu nại dịch vụ" : "Tư vấn sản phẩm", status: "resolved", assignee: who, dueAt: new Date(created + 24 * 3600e3), resolvedAt: new Date(resolved), csat: r() < 0.7 ? Math.max(2, Math.min(5, Math.round(3.5 + r() * 2 - (hours > 24 ? 1 : 0)))) : null, createdAt: new Date(created), updatedAt: new Date(resolved) } });
        n.tickets++;
      }
    }
  }

  await setPref(workspaceId, MARK, { at: new Date().toISOString(), created: n });
  clearFactsCache();
  return { skipped: false, created: n };
}
