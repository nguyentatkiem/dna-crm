// Dữ liệu mẫu cho Chăm sóc sau bán: điểm thưởng, phiếu hỗ trợ, bảo hành, nhóm khách.
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { setPref } from "../prefs";
import { nextNumber } from "../counter";
import { loadCfg } from "../marketing/store";
import { LOYALTY_DEFAULT, TICKET_DEFAULT, addMonths, normPhone, slaDueAt, type Priority } from "./shared";

const H = 3600e3;
const D = 864e5;

/** Gieo dữ liệu mẫu. Bỏ qua nếu workspace đã có phiếu hỗ trợ (chạy lại không nhân đôi). */
export async function seedCare(workspaceId: string, config?: WorkspaceConfig): Promise<void> {
  if (await db.ticket.count({ where: { workspaceId } })) return;
  const cfg = config ?? (await loadCfg(workspaceId));
  if (!cfg) return;
  const obj = getObject(cfg, "contacts");
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 12 });
  const team = cfg.team.length ? cfg.team : ["Bạn"];
  const now = Date.now();

  if (!(await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: "loyalty" } } }))) await setPref(workspaceId, "loyalty", LOYALTY_DEFAULT);
  if (!(await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: "ticket" } } }))) await setPref(workspaceId, "ticket", TICKET_DEFAULT);

  // Điểm thưởng: khách đầu nhiều điểm (đủ lên Vàng/Kim cương), có một lần đổi quà.
  // Chỉ tính điểm cộng tay: điểm từ đơn hàng mẫu (bán hàng gieo trước) không được chặn bước này.
  if (!(await db.loyaltyTxn.count({ where: { workspaceId, orderId: null } }))) {
    const plan = [5400, 2600, 1200, 650, 320, 120];
    const txns: { workspaceId: string; recordId: string; points: number; reason: string; createdBy: string; createdAt: Date }[] = [];
    contacts.slice(0, plan.length).forEach((c, i) => {
      const total = plan[i];
      txns.push({ workspaceId, recordId: c.id, points: Math.round(total * 0.6), reason: "Tích điểm liệu trình", createdBy: "Hệ thống", createdAt: new Date(now - (40 - i) * D) });
      txns.push({ workspaceId, recordId: c.id, points: total - Math.round(total * 0.6), reason: "Tích điểm liệu trình", createdBy: "Hệ thống", createdAt: new Date(now - (10 - i) * D) });
      if (i === 1) txns.push({ workspaceId, recordId: c.id, points: -300, reason: "Đổi quà: Gội dưỡng sinh miễn phí", createdBy: team[0], createdAt: new Date(now - 3 * D) });
    });
    if (txns.length) await db.loyaltyTxn.createMany({ data: txns });
  }

  // Phiếu hỗ trợ: đủ trạng thái, một phiếu quá hạn, một phiếu có CSAT 5 sao.
  const c = (i: number) => contacts[i % Math.max(1, contacts.length)]?.id ?? null;
  const tickets: { subject: string; body: string; priority: Priority; status: string; ageH: number; assignee: string; channel: string; rec: string | null; csat?: number; comment?: string; replies?: [string, string, boolean][] }[] = [
    { subject: "Da bị đỏ rát sau buổi trị mụn", body: "Khách nhắn sau 1 ngày làm liệu trình trị mụn thấy da đỏ, rát nhẹ vùng má. Cần tư vấn cách chăm sóc và hẹn kiểm tra lại.", priority: "high", status: "open", ageH: 11, assignee: team[1] ?? team[0], channel: "inbox", rec: c(0), replies: [["Hỏi khách có dùng thêm sản phẩm lạ không, gửi hướng dẫn đắp mặt nạ làm dịu.", team[1] ?? team[0], true]] },
    { subject: "Muốn đổi lịch hẹn tuần sau", body: "Khách bận công tác, nhờ dời lịch chăm sóc da sang thứ 7 tuần sau.", priority: "normal", status: "pending", ageH: 5, assignee: team[2] ?? team[0], channel: "call", rec: c(1), replies: [["Dạ em đã giữ chỗ 9h sáng thứ 7, chị xác nhận giúp em nhé.", team[2] ?? team[0], false]] },
    { subject: "Hỏi về hoá đơn VAT gói 10 buổi", body: "Khách cần xuất hoá đơn công ty cho gói triệt lông 10 buổi.", priority: "low", status: "open", ageH: 2, assignee: "", channel: "manual", rec: c(2) },
    { subject: "Phàn nàn thời gian chờ quá lâu", body: "Khách đến đúng giờ nhưng chờ 25 phút mới được phục vụ.", priority: "urgent", status: "resolved", ageH: 30, assignee: team[0], channel: "form", rec: c(3), csat: 5, comment: "Quản lý gọi xin lỗi và tặng thêm buổi, rất chu đáo!", replies: [["Đã gọi xin lỗi khách, tặng 1 buổi gội dưỡng sinh.", team[0], false]] },
    { subject: "Xin lại hướng dẫn chăm sóc tại nhà", body: "Khách làm mất tờ hướng dẫn sau liệu trình.", priority: "normal", status: "closed", ageH: 72, assignee: team[1] ?? team[0], channel: "inbox", rec: c(4) },
  ];
  for (const t of tickets) {
    const created = new Date(now - t.ageH * H);
    const due = slaDueAt(t.priority, TICKET_DEFAULT, created);
    const done = t.status === "resolved" || t.status === "closed";
    const row = await db.ticket.create({
      data: {
        workspaceId,
        number: await nextNumber(workspaceId, "TK", created),
        recordId: t.rec,
        subject: t.subject,
        body: t.body,
        channel: t.channel,
        priority: t.priority,
        status: t.status,
        assignee: t.assignee,
        dueAt: due,
        resolvedAt: done ? new Date(created.getTime() + 3 * H) : null,
        csat: t.csat ?? null,
        csatComment: t.comment ?? "",
        createdBy: team[0],
        createdAt: created,
      },
    });
    for (const [body, author, internal] of t.replies ?? []) await db.ticketMessage.create({ data: { ticketId: row.id, author, body, internal, createdAt: new Date(created.getTime() + H) } });
  }

  // Bảo hành: dùng sản phẩm có bảo hành nếu có, không thì tên tự do. Một phiếu hết hạn sau ~20 ngày.
  if (!(await db.warranty.count({ where: { workspaceId } }))) {
    const prods = await db.product.findMany({ where: { workspaceId, warrantyMonths: { gt: 0 } }, take: 3 });
    const names = ["Máy rửa mặt sóng âm", "Máy triệt lông mini", "Máy xông hơi mặt"];
    const plan = [
      { months: 12, startDaysAgo: 345, serial: "RM2025-00871" },
      { months: 6, startDaysAgo: 30, serial: "TL-55K2091" },
      { months: 24, startDaysAgo: 400, serial: "XH-7712" },
    ];
    const data = plan.map((p, i) => {
      const rec = contacts[i];
      const d = parseJson<Record<string, unknown>>(rec?.dataJson, {});
      const start = new Date(now - p.startDaysAgo * D);
      const prod = prods[i];
      const months = prod?.warrantyMonths ?? p.months;
      // Phiếu đầu đặt đúng ~20 ngày nữa hết hạn để thấy cảnh báo "sắp hết hạn".
      const end = i === 0 ? new Date(now + 20 * D) : addMonths(start, months);
      return {
        workspaceId,
        recordId: rec?.id ?? null,
        productId: prod?.id ?? null,
        productName: prod?.name ?? names[i],
        serial: p.serial,
        customerName: rec?.title ?? "Khách lẻ",
        phone: normPhone(phoneKey ? String(d[phoneKey] ?? "") : ""),
        startAt: start,
        endAt: end,
        status: i === 2 ? "claimed" : "active",
        note: i === 2 ? "Khách báo máy không lên nguồn, đã nhận máy gửi hãng." : "",
      };
    });
    await db.warranty.createMany({ data });
  }

  // Nhóm khách: dùng đúng khoá trường của bảng Khách trong cấu hình.
  if (obj && !(await db.segment.count({ where: { workspaceId } }))) {
    const tierField = obj.fields.find((f) => f.type === "select" && /hang|hạng|tier|thanh_vien/i.test(f.key + f.label));
    const top = tierField?.options.at(-1)?.label;
    const vipStatus = obj.statuses.find((s) => /vip/i.test(s.key + s.label));
    const vip = tierField && top ? { field: `f:${tierField.key}`, op: "is", value: top } : vipStatus ? { field: "status", op: "is", value: vipStatus.key } : { field: "score", op: "gte", value: "70" };
    const dateField = obj.fields.find((f) => f.type === "date");
    // Dữ liệu mẫu chỉ trải vài tuần nên lấy mốc 10 ngày để nhóm có thành viên.
    const cutoff = new Date(now - 10 * D);
    const ymd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    const lapsed = dateField ? { field: `f:${dateField.key}`, op: "before", value: ymd } : { field: "createdAt", op: "before", value: ymd };
    await db.segment.createMany({
      data: [
        { workspaceId, objectKey: "contacts", name: "Khách VIP", filtersJson: JSON.stringify([{ id: "vip", ...vip }]), mode: "and", createdBy: team[0] },
        { workspaceId, objectKey: "contacts", name: "Khách chưa quay lại 10 ngày", filtersJson: JSON.stringify([{ id: "lapsed", ...lapsed }]), mode: "and", createdBy: team[0] },
      ],
    });
  }
}
