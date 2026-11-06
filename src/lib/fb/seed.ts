// Dữ liệu mẫu fanpage: 2 trang (token mẫu → mọi thao tác Graph được giả lập), 6 bài viết (1 livestream, 1 video),
// ~40 bình luận (có SĐT, có trả lời của trang, có bình luận đã ẩn), vài hội thoại inbox đến từ quảng cáo và link m.me.
// Chạy lại không tạo trùng (bỏ qua nếu trang mẫu đã có).
import { db } from "../db";
import { detectContact } from "../chat/detect";
import { DEMO_PAGE_TOKEN } from "./graph";
import { mmeLinks, newCode, saveMmeLinks } from "./admin";

const P1 = "1000000000001";
const P2 = "1000000000002";

type C = { who: number; text: string; ago: number; reply?: string; replyAgo?: number; hidden?: boolean; liked?: boolean };
type PostSeed = { page: string; postId: string; kind: "post" | "photo" | "video" | "live"; message: string; image: string; ago: number; mergeKey?: string; settings?: object; comments: C[] };

const NAMES = [
  "Nguyễn Thị Lan", "Trần Thu Hà", "Lê Minh Anh", "Phạm Ngọc Mai", "Hoàng Thị Hương", "Vũ Thanh Tâm", "Đặng Mỹ Linh", "Bùi Phương Thảo", "Đỗ Khánh Vy", "Ngô Bảo Ngọc",
  "Dương Thuỳ Trang", "Lý Hải Yến", "Phan Kim Chi", "Trịnh Minh Thư", "Mai Anh Đào", "Cao Thị Nhung", "Tạ Quỳnh Như", "Hồ Ngọc Hân", "Lâm Gia Hân", "Chu Thanh Hằng",
];

const M = 60 * 1000;
const H = 60 * M;

const POSTS: PostSeed[] = [
  {
    page: P1,
    postId: `${P1}_9001`,
    kind: "live",
    message: "🔴 LIVE: Soi da miễn phí + giảm 30% liệu trình trị mụn trong phiên live tối nay!",
    image: "",
    ago: 3 * H,
    mergeKey: "Live trị mụn tháng 11",
    settings: { autoHidePhone: true, replyComment: "Dạ {ten} ơi, em đã nhắn tin riêng tư vấn cho mình rồi ạ, mình check inbox giúp em nhé!", replyInbox: "Chào {ten}, em là Hương Spa ạ. Mình để lại SĐT trong live, em gọi tư vấn liệu trình trị mụn ngay nhé!", replyOnlyPhone: true },
    comments: [
      { who: 0, text: "Chốt 1 liệu trình trị mụn 0912345678", ago: 170 * M, reply: "Dạ chị Lan ơi, em đã nhắn tin riêng tư vấn cho mình rồi ạ!", replyAgo: 169 * M, hidden: true },
      { who: 1, text: "Da dầu mụn ẩn có làm được không shop", ago: 165 * M, reply: "Dạ được ạ, chị inbox em soi da nhé", replyAgo: 160 * M },
      { who: 2, text: "0987 654 321 tư vấn em với", ago: 150 * M, hidden: true },
      { who: 3, text: "Giá bao nhiêu vậy ạ", ago: 140 * M },
      { who: 4, text: "Em ở Cầu Giấy, có chi nhánh gần không", ago: 120 * M, reply: "Dạ bên em có cơ sở ở 120 Trần Duy Hưng ạ", replyAgo: 118 * M },
      { who: 5, text: "Chốt đơn 2 suất cho em và bạn, sđt 0356.789.123", ago: 100 * M, hidden: true },
      { who: 6, text: "Live lag quá", ago: 95 * M },
      { who: 7, text: "Ib em giá combo nhé", ago: 80 * M },
      { who: 8, text: "Đã inbox ạ", ago: 60 * M },
      { who: 0, text: "Shop gọi em sau 7h tối nhé", ago: 30 * M },
    ],
  },
  {
    page: P1,
    postId: `${P1}_9002`,
    kind: "live",
    message: "🔴 LIVE phần 2: Hướng dẫn chăm sóc da sau trị mụn",
    image: "",
    ago: 26 * H,
    mergeKey: "Live trị mụn tháng 11",
    comments: [
      { who: 9, text: "Sau khi lấy nhân mụn bao lâu thì trang điểm được ạ", ago: 25 * H, reply: "Dạ sau 24–48 giờ ạ", replyAgo: 25 * H - 5 * M },
      { who: 10, text: "Cho em đặt lịch thứ 7, số em 0868111222", ago: 24 * H, hidden: true },
      { who: 11, text: "Hay quá chị ơi", ago: 23 * H, liked: true },
    ],
  },
  {
    page: P1,
    postId: `${P1}_9003`,
    kind: "video",
    message: "Video: Quy trình chăm sóc da chuẩn Hàn 10 bước tại Hương Spa",
    image: "",
    ago: 2 * 24 * H,
    comments: [
      { who: 12, text: "Bước 5 dùng sản phẩm gì vậy ạ", ago: 47 * H, reply: "Dạ là serum B5 phục hồi ạ", replyAgo: 46 * H },
      { who: 13, text: "Ship về 45 Lê Lợi, phường Bến Nghé, quận 1, TP.HCM được không shop, sđt 0901 234 567", ago: 40 * H, hidden: true },
      { who: 14, text: "Đẹp quá", ago: 30 * H, liked: true },
      { who: 15, text: "Giá liệu trình 10 buổi bao nhiêu ạ", ago: 20 * H },
      { who: 16, text: "Có trả góp không ạ", ago: 10 * H },
    ],
  },
  {
    page: P1,
    postId: `${P1}_9004`,
    kind: "photo",
    message: "Ưu đãi tháng 11: Tặng 1 buổi chăm sóc da mặt khi mua liệu trình bất kỳ 🎁",
    image: "",
    ago: 4 * 24 * H,
    comments: [
      { who: 17, text: "Áp dụng đến ngày nào vậy ạ", ago: 90 * H, reply: "Dạ đến hết 30/11 ạ", replyAgo: 89 * H },
      { who: 18, text: "Mình đăng ký 1 suất 0779 888 999", ago: 80 * H, hidden: true },
      { who: 19, text: "Tag bạn: Thu Hà ơi đi cùng không", ago: 70 * H },
      { who: 1, text: "Đi chứ, giữ cho mình 1 suất nha shop", ago: 69 * H },
      { who: 3, text: "Giá gốc bao nhiêu shop", ago: 50 * H },
    ],
  },
  {
    page: P2,
    postId: `${P2}_9101`,
    kind: "post",
    message: "Khai trương chi nhánh Cầu Giấy — giảm 50% gội đầu dưỡng sinh tuần đầu tiên!",
    image: "",
    ago: 3 * 24 * H,
    settings: { replyComment: "Dạ cảm ơn {ten} đã quan tâm, em inbox mình chi tiết ạ!" },
    comments: [
      { who: 4, text: "Địa chỉ cụ thể ở đâu vậy ạ", ago: 70 * H, reply: "Dạ số 12 ngõ 34 Trần Duy Hưng, Cầu Giấy ạ", replyAgo: 69 * H },
      { who: 5, text: "Mở cửa đến mấy giờ shop", ago: 60 * H, reply: "Dạ đến 21h ạ", replyAgo: 59 * H },
      { who: 6, text: "Đặt lịch giúp em 0345 678 912", ago: 40 * H },
      { who: 7, text: "Có chỗ gửi ô tô không", ago: 30 * H },
      { who: 8, text: "Gội đầu bao lâu ạ", ago: 12 * H },
      { who: 9, text: "Hôm nay còn slot không ạ", ago: 2 * H },
    ],
  },
  {
    page: P2,
    postId: `${P2}_9102`,
    kind: "photo",
    message: "Cảm ơn các chị đã ghé chi nhánh Cầu Giấy cuối tuần qua 💕",
    image: "",
    ago: 6 * 24 * H,
    comments: [
      { who: 10, text: "Nhân viên dễ thương lắm", ago: 140 * H, liked: true },
      { who: 11, text: "Lần sau em quay lại", ago: 130 * H, liked: true },
      { who: 12, text: "Cho em xin giá gói 5 buổi", ago: 100 * H },
      { who: 13, text: "Thôn Đông, xã Yên Phú, huyện Yên Mỹ, tỉnh Hưng Yên có ship sản phẩm không ạ", ago: 90 * H },
      { who: 14, text: "Em để số 0938 222 333 tư vấn em nhé", ago: 20 * H },
    ],
  },
];

/** Hội thoại inbox mẫu có nguồn: quảng cáo (ad), link m.me (ref). */
const INBOX: { page: string; psid: string; who: number; source: string; sourceRef: string; msgs: [dir: "in" | "out", text: string, ago: number][] }[] = [
  {
    page: P1,
    psid: "demo_psid_ad_1",
    who: 15,
    source: "ad",
    sourceRef: "120210000000001",
    msgs: [
      ["in", "Em thấy quảng cáo trị mụn, cho em hỏi giá ạ", 5 * H],
      ["out", "Dạ chào chị, liệu trình trị mụn bên em từ 1.200.000đ/buổi ạ. Chị cho em xin SĐT để tư vấn kỹ nhé.\n— Hương Spa ♥", 5 * H - 4 * M],
      ["in", "0912 777 888 nha em", 4 * H],
    ],
  },
  {
    page: P1,
    psid: "demo_psid_ad_2",
    who: 16,
    source: "ad",
    sourceRef: "120210000000002",
    msgs: [["in", "Ưu đãi tháng 11 còn không shop?", 50 * M]],
  },
  {
    page: P1,
    psid: "demo_psid_ref_1",
    who: 17,
    source: "ref",
    sourceRef: "tet2027",
    msgs: [
      ["in", "Mình bấm link từ tờ rơi, muốn đặt lịch chăm sóc da", 26 * H],
      ["out", "Dạ chị muốn đặt ngày nào ạ?\n— Hương Spa ♥", 25 * H],
      ["in", "Thứ 7 tuần này 9h sáng nhé", 24 * H],
    ],
  },
  {
    page: P2,
    psid: "demo_psid_ref_2",
    who: 18,
    source: "ref",
    sourceRef: "kol_linh",
    msgs: [["in", "Chị Linh giới thiệu em qua đây ạ, gội đầu dưỡng sinh giá sao ạ", 3 * H]],
  },
];

export async function seedFanpage(workspaceId: string): Promise<{ created: boolean }> {
  if (await db.fbPage.count({ where: { workspaceId, pageId: { in: [P1, P2] } } })) return { created: false };
  const now = Date.now();
  const at = (ago: number) => new Date(now - ago);

  await db.fbPage.createMany({
    data: [
      { workspaceId, pageId: P1, name: "Hương Spa – Chăm sóc da", token: DEMO_PAGE_TOKEN, settingsJson: JSON.stringify({ autoHidePhone: true, autoHideAll: false, autoLike: false, autoMarkReadComments: false, signature: "— Hương Spa ♥" }) },
      { workspaceId, pageId: P2, name: "Hương Spa Cầu Giấy", token: DEMO_PAGE_TOKEN, settingsJson: JSON.stringify({ autoHidePhone: false, autoHideAll: false, autoLike: true, autoMarkReadComments: false, signature: "" }) },
    ],
  });
  const pageName: Record<string, string> = { [P1]: "Hương Spa – Chăm sóc da", [P2]: "Hương Spa Cầu Giấy" };

  let k = 0;
  for (const p of POSTS) {
    const phones = p.comments.filter((c) => detectContact(c.text).phones.length).length;
    await db.fbPost.upsert({
      where: { workspaceId_postId: { workspaceId, postId: p.postId } },
      create: {
        workspaceId,
        pageId: p.page,
        postId: p.postId,
        kind: p.kind,
        live: p.kind === "live",
        message: p.message,
        image: p.image,
        permalink: `https://www.facebook.com/${p.postId.replace("_", "/posts/")}`,
        postedAt: at(p.ago),
        commentsCount: p.comments.length + p.comments.filter((c) => c.reply).length,
        phonesCount: phones,
        mergeKey: p.mergeKey ?? "",
        settingsJson: JSON.stringify(p.settings ?? {}),
      },
      update: {},
    });
    // Gom bình luận theo người: mỗi người trên mỗi bài là một hội thoại.
    const byWho = new Map<number, C[]>();
    for (const c of p.comments) byWho.set(c.who, [...(byWho.get(c.who) ?? []), c]);
    for (const [who, list] of byWho) {
      const name = NAMES[who];
      const uid = `demo_user_${who + 1}`;
      const sorted = list.slice().sort((a, b) => b.ago - a.ago);
      const msgs: { direction: string; kind: string; text: string; commentId: string; parentId: string; externalId: string; author: string; hidden: boolean; liked: boolean; createdAt: Date }[] = [];
      for (const c of sorted) {
        const cid = `${p.postId.split("_")[1]}_${++k}`;
        msgs.push({ direction: "in", kind: "comment", text: c.text, commentId: cid, parentId: "", externalId: cid, author: name, hidden: !!c.hidden, liked: !!c.liked, createdAt: at(c.ago) });
        if (c.reply) {
          const rid = `${p.postId.split("_")[1]}_${++k}`;
          msgs.push({ direction: "out", kind: "comment", text: c.reply, commentId: rid, parentId: cid, externalId: rid, author: pageName[p.page], hidden: false, liked: false, createdAt: at(c.replyAgo ?? c.ago - M) });
        }
      }
      msgs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const last = msgs[msgs.length - 1];
      const ins = msgs.filter((m) => m.direction === "in");
      const outs = msgs.filter((m) => m.direction === "out");
      let unread = 0;
      for (let i = msgs.length - 1; i >= 0 && msgs[i].direction === "in"; i--) unread++;
      const phonesFound = [...new Set(ins.flatMap((m) => detectContact(m.text).phones))];
      const firstOutAfterIn = outs.find((o) => o.createdAt > ins[0].createdAt);
      await db.conversation.upsert({
        where: { workspaceId_channel_externalId: { workspaceId, channel: "messenger", externalId: `c:${p.postId}:${uid}` } },
        create: {
          workspaceId,
          channel: "messenger",
          externalId: `c:${p.postId}:${uid}`,
          pageId: p.page,
          kind: "comment",
          postId: p.postId,
          source: "post",
          sourceRef: p.postId,
          name,
          lastText: (last.direction === "out" ? "Bạn: " : "") + last.text,
          lastAt: last.createdAt,
          lastInAt: ins[ins.length - 1]?.createdAt,
          lastOutAt: outs[outs.length - 1]?.createdAt ?? null,
          firstReplyAt: firstOutAfterIn?.createdAt ?? null,
          unread,
          phones: phonesFound.join(","),
          orderMarked: /chốt|đăng ký|giữ cho/i.test(ins.map((m) => m.text).join(" ")),
          createdAt: msgs[0].createdAt,
          messages: { create: msgs },
        },
        update: {},
      });
    }
  }

  for (const t of INBOX) {
    const name = NAMES[t.who];
    const msgs = t.msgs.map(([direction, text, ago], i) => ({ direction, text, author: direction === "in" ? name : pageName[t.page], externalId: `demo_mid_${t.psid}_${i}`, createdAt: at(ago) }));
    const last = msgs[msgs.length - 1];
    const ins = msgs.filter((m) => m.direction === "in");
    const outs = msgs.filter((m) => m.direction === "out");
    let unread = 0;
    for (let i = msgs.length - 1; i >= 0 && msgs[i].direction === "in"; i--) unread++;
    await db.conversation.upsert({
      where: { workspaceId_channel_externalId: { workspaceId, channel: "messenger", externalId: t.psid } },
      create: {
        workspaceId,
        channel: "messenger",
        externalId: t.psid,
        pageId: t.page,
        kind: "inbox",
        source: t.source,
        sourceRef: t.sourceRef,
        name,
        lastText: (last.direction === "out" ? "Bạn: " : "") + last.text,
        lastAt: last.createdAt,
        lastInAt: ins[ins.length - 1]?.createdAt,
        lastOutAt: outs[outs.length - 1]?.createdAt ?? null,
        firstReplyAt: outs[0]?.createdAt ?? null,
        unread,
        phones: [...new Set(ins.flatMap((m) => detectContact(m.text).phones))].join(","),
        createdAt: msgs[0].createdAt,
        messages: { create: msgs },
      },
      update: {},
    });
  }

  const links = await mmeLinks(workspaceId);
  const add = [
    { pageId: P1, ref: "tet2027", label: "Tờ rơi Tết 2027", clicks: 37 },
    { pageId: P2, ref: "kol_linh", label: "KOL Linh giới thiệu", clicks: 12 },
  ].filter((x) => !links.some((l) => l.ref === x.ref));
  await saveMmeLinks(workspaceId, [...links, ...add.map((x) => ({ ...x, id: newCode(), code: newCode(), createdAt: new Date(now - 7 * 24 * H).toISOString(), createdBy: "Dữ liệu mẫu" }))]);
  return { created: true };
}
