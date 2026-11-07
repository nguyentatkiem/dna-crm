// Dữ liệu mẫu chat nội bộ + báo cáo: nhóm "Cả đội" vài tin, một DM giữa chủ và nhân viên đầu tiên, 3 báo cáo mẫu.
// Idempotent: nhóm/DM đã có tin thì bỏ qua.
import { db } from "../db";
import { seedReports } from "../reports/seed";
import { dmMembers, preview } from "./shared";

export async function seedTeamChat(workspaceId: string) {
  const ms = await db.membership.findMany({ where: { workspaceId }, select: { role: true, user: { select: { id: true, name: true } } } });
  if (!ms.length) return { group: false, dm: false, reports: 0 };
  const owner = (ms.find((m) => m.role === "owner") ?? ms[0]).user;
  const others = ms.map((m) => m.user).filter((u) => u.id !== owner.id);
  const mate = others[0];
  const contact = await db.record.findFirst({ where: { workspaceId, objectKey: "contacts", deletedAt: null }, orderBy: { score: "desc" }, select: { id: true, title: true } });
  const order = await db.order.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true, number: true } });
  const now = Date.now();
  const at = (minAgo: number) => new Date(now - minAgo * 60e3);
  let group = false;
  let dm = false;

  const existingGroup = await db.chatThread.findFirst({ where: { workspaceId, kind: "group", name: "Cả đội" } });
  if (!existingGroup || !(await db.chatMessage.count({ where: { threadId: existingGroup.id } }))) {
    const t =
      existingGroup ??
      (await db.chatThread.create({ data: { workspaceId, kind: "group", name: "Cả đội", membersJson: JSON.stringify(ms.map((m) => m.user.id)), createdBy: owner.id } }));
    const script: { u: { id: string; name: string }; body: string; ref?: { kind: string; id: string }; min: number }[] = [
      { u: owner, body: "Chào cả đội 👋 Từ hôm nay mình trao đổi việc ở đây nhé, đỡ lạc tin trên Zalo cá nhân.", min: 180 },
      ...(mate ? [{ u: mate, body: "Dạ vâng anh/chị. Em đã xem danh sách khách cần gọi lại hôm nay rồi ạ.", min: 172 }] : []),
      ...(contact ? [{ u: owner, body: `${mate ? `@${mate.name} ` : ""}nhờ em ưu tiên chăm sóc khách này trước 5h chiều nay nhé.`, ref: { kind: "record", id: contact.id }, min: 160 }] : []),
      ...(order ? [{ u: mate ?? owner, body: `Đơn ${order.number} khách vừa chuyển khoản xong, em cập nhật trạng thái rồi ạ.`, ref: { kind: "order", id: order.id }, min: 95 }] : []),
      { u: owner, body: "Báo cáo doanh thu theo tháng đã được hẹn gửi email sáng thứ hai hằng tuần, mọi người xem ở mục Báo cáo nhé.", min: 30 },
    ];
    for (const s of script) {
      await db.chatMessage.create({ data: { threadId: t.id, userId: s.u.id, body: s.body, refJson: JSON.stringify({ refs: s.ref ? [s.ref] : [] }), readByJson: JSON.stringify(s.min > 60 ? ms.map((m) => m.user.id) : [s.u.id]), createdAt: at(s.min) } });
    }
    const last = script[script.length - 1];
    await db.chatThread.update({ where: { id: t.id }, data: { lastText: preview(last.u.name, last.body, 0), lastAt: at(last.min) } });
    group = true;
  }

  if (mate) {
    const membersJson = JSON.stringify(dmMembers(owner.id, mate.id));
    const existing = await db.chatThread.findFirst({ where: { workspaceId, kind: "dm", membersJson } });
    if (!existing || !(await db.chatMessage.count({ where: { threadId: existing.id } }))) {
      const t = existing ?? (await db.chatThread.create({ data: { workspaceId, kind: "dm", membersJson, createdBy: owner.id } }));
      const script = [
        { u: mate, body: "Anh/chị ơi, khách hỏi có được giảm thêm 5% nếu thanh toán trước không ạ?", min: 50 },
        { u: owner, body: "Được em, áp dụng cho đơn trên 5 triệu thôi nhé. Nhớ ghi chú vào đơn.", min: 45 },
        { u: mate, body: "Dạ em cảm ơn ạ!", min: 44 },
      ];
      for (const s of script) await db.chatMessage.create({ data: { threadId: t.id, userId: s.u.id, body: s.body, readByJson: JSON.stringify(s.u.id === owner.id ? [owner.id, mate.id] : [mate.id]), createdAt: at(s.min) } });
      const last = script[script.length - 1];
      await db.chatThread.update({ where: { id: t.id }, data: { lastText: preview(last.u.name, last.body, 0), lastAt: at(last.min) } });
      dm = true;
    }
  }

  const reports = await seedReports(workspaceId, owner.id);
  return { group, dm, reports };
}
