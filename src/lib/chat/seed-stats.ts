// Dữ liệu mẫu cho Thống kê hộp thư: hội thoại tin nhắn + bình luận rải 30 ngày, nhiều nhân viên, nhiều khung giờ.
// Idempotent: hội thoại mẫu có externalId "seedstats-<n>", đã có thì bỏ qua. Không tạo trang (dùng trang có sẵn nếu có).
import { db } from "../db";

const NAMES = ["Nguyễn Thu Hằng", "Trần Bảo Anh", "Lê Mỹ Duyên", "Phạm Quốc Huy", "Hoàng Lan Chi", "Vũ Minh Thư", "Đỗ Hải Yến", "Bùi Ngọc Ánh", "Phan Thanh Tâm", "Đặng Kim Ngân", "Ngô Gia Hân", "Võ Thảo My", "Trịnh Hồng Nhung", "Lý Khánh Linh", "Mai Phương Thảo", "Cao Bích Ngọc"];
const ASK = ["Shop ơi giá liệu trình này bao nhiêu ạ?", "Còn lịch chiều nay không shop?", "Cho mình hỏi gói chăm sóc da mụn giá sao?", "Shop ở đâu vậy ạ?", "Có ưu đãi cho khách mới không?", "Liệu trình mấy buổi vậy?", "Mình muốn đặt lịch cuối tuần", "Da nhạy cảm làm được không shop?"];
const PHONE = ["Sđt mình 0912 345 6{n}{n} nhé", "Gọi mình số 098765{n}{n}21", "0903.111.2{n}{n} nha shop"];
const NEG = ["Đợi mãi không ai trả lời, thất vọng quá", "Làm xong da bị đỏ, tôi không hài lòng, muốn hoàn tiền", "Nhân viên thái độ tệ quá"];
const POS = ["Cảm ơn shop nhiều, mình rất hài lòng", "Tuyệt vời, lần sau mình quay lại"];
const REPLY = ["Dạ chào chị {name}, liệu trình bên em 450k/buổi ạ", "Dạ em chào chị, chiều nay còn lịch 15h và 17h ạ", "Dạ bên em ở 12 Cầu Giấy ạ, chị ghé nhé", "Dạ có ạ, khách mới giảm 20% buổi đầu", "Dạ em ghi nhận rồi ạ, em gọi lại xác nhận lịch cho chị nhé", "Dạ em rất xin lỗi chị, em báo quản lý xử lý ngay ạ"];
const CLOSE = ["Cảm ơn chị {name} ạ, hẹn gặp chị", "Dạ vâng ạ, chúc chị một ngày vui", "ok"];
const TAGS = ["hoi-gia", "chot-don", "khach-vip", "khieu-nai"];

// Bộ sinh số giả ngẫu nhiên cố định để dữ liệu mẫu giống nhau mỗi lần chạy.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export async function seedInboxStats(workspaceId: string, opts: { count?: number; now?: number } = {}): Promise<{ created: number; skipped: number }> {
  const count = opts.count ?? 70;
  const now = opts.now ?? Date.now();
  let r = rng(1);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const [members, pages, existing] = await Promise.all([
    db.membership.findMany({ where: { workspaceId }, select: { user: { select: { name: true } } } }),
    db.fbPage.findMany({ where: { workspaceId }, select: { pageId: true } }),
    db.conversation.findMany({ where: { workspaceId, externalId: { startsWith: "seedstats-" } }, select: { externalId: true } }),
  ]);
  // Nhân viên: thành viên có tài khoản + người phụ trách đã có trong hộp thư (tên trong đội cấu hình).
  const team = (await db.conversation.groupBy({ by: ["assignee"], where: { workspaceId, assignee: { not: "" } } })).map((g) => g.assignee);
  const staff = [...new Set([...members.map((m) => m.user.name), ...team])].filter((n) => n && n !== "Bạn");
  if (!staff.length) return { created: 0, skipped: count };
  const have = new Set(existing.map((e) => e.externalId));
  let created = 0;

  for (let i = 0; i < count; i++) {
    const ext = `seedstats-${i}`;
    if (have.has(ext)) continue;
    r = rng(20261106 + i * 7919); // mỗi hội thoại một dãy số riêng → chạy lại vẫn ra cùng dữ liệu
    const dayBack = Math.floor(r() * 30);
    const hourPick = r();
    const hour = hourPick < 0.4 ? 9 + Math.floor(r() * 4) : hourPick < 0.8 ? 19 + Math.floor(r() * 4) : Math.floor(r() * 24);
    const minute = Math.floor(r() * 60);
    const isComment = r() < 0.3;
    const usePage = pages.length && r() < 0.85;
    const pageId = usePage ? pick(pages).pageId : "";
    const channel = usePage ? "messenger" : r() < 0.5 ? "zalo" : "messenger";
    const assignee = r() < 0.9 ? pick(staff) : "";
    const name = pick(NAMES);
    const turns = 1 + Math.floor(r() * 4);
    const mood = r();
    const withPhone = r() < 0.45;
    const unanswered = r() < 0.12;
    const done = r() < 0.55;
    const tag = r() < 0.7 ? [pick(TAGS)] : [];

    // Giờ VN = UTC+7.
    const start = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() - dayBack, hour - 7, minute);
    if (start > now) continue;
    const msgs: { direction: string; text: string; author: string; kind: string; createdAt: Date }[] = [];
    let t = start;
    const first = name.split(" ").pop()!;
    for (let k = 0; k < turns; k++) {
      let text = k === 0 ? pick(ASK) : withPhone && k === 1 ? pick(PHONE).replace(/\{n\}/g, String(i % 10)) : r() < 0.5 ? "Vâng ạ" : pick(ASK);
      if (k === turns - 1 && mood < 0.12) text = pick(NEG);
      else if (k === turns - 1 && mood > 0.85) text = pick(POS);
      msgs.push({ direction: "in", text, author: name, kind: isComment && k === 0 ? "comment" : "message", createdAt: new Date(t) });
      if (unanswered && k === turns - 1) break;
      // Thời gian phản hồi: phần lớn vài phút, đôi khi rất chậm.
      const wait = r() < 0.7 ? 1 + r() * 9 : r() < 0.8 ? 10 + r() * 50 : 60 + r() * 600;
      t += wait * 60e3;
      if (t > now) break;
      const author = assignee || pick(staff);
      const reply = k === turns - 1 ? pick(CLOSE) : pick(REPLY);
      msgs.push({ direction: "out", text: reply.replace("{name}", first), author, kind: isComment && k === 0 ? "comment" : "message", createdAt: new Date(t) });
      t += (2 + r() * 30) * 60e3;
    }
    const ins = msgs.filter((m) => m.direction === "in");
    const outs = msgs.filter((m) => m.direction === "out");
    const last = msgs[msgs.length - 1];
    const phones = withPhone ? (ins.map((m) => m.text.match(/(?:0)(?:[\s.]?\d){9}/)?.[0]?.replace(/\D/g, "")).find(Boolean) ?? "") : "";
    await db.conversation.create({
      data: {
        workspaceId,
        channel,
        externalId: ext,
        pageId,
        name,
        lastText: last.text,
        lastAt: last.createdAt,
        unread: last.direction === "in" ? ins.length : 0,
        assignee,
        status: done && last.direction === "out" ? "done" : "open",
        tagsJson: JSON.stringify(tag),
        kind: isComment ? "comment" : "inbox",
        phones,
        lastInAt: ins[ins.length - 1]?.createdAt ?? null,
        lastOutAt: outs[outs.length - 1]?.createdAt ?? null,
        firstReplyAt: outs[0]?.createdAt ?? null,
        readAt: outs.length ? outs[outs.length - 1].createdAt : null,
        createdAt: new Date(start),
        messages: { create: msgs },
      },
    });
    created++;
  }
  return { created, skipped: count - created };
}
