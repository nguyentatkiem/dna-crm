// Dữ liệu mẫu kênh mới (khoá "demo_" → mọi lời gọi ra ngoài đều được giả lập):
// 1 tài khoản Instagram (2 hội thoại Direct + 3 hội thoại bình luận), 1 số WhatsApp (2 hội thoại, một đã quá 24 giờ),
// 1 shop Shopee + 1 shop TikTok Shop với 5 đơn mỗi sàn (đồng bộ qua đúng luồng thật, có SKU khớp sản phẩm).
// Chạy lại không tạo trùng.
import { db } from "../db";
import { syncShop } from "./orders";

export const DEMO_IG_ID = "17841400000000001";
export const DEMO_WA_PHONE_ID = "100000000000001";
export const DEMO_SHOPEE_SHOP = "220000001";
export const DEMO_TIKTOK_SHOP = "7000000000001";

const M = 60e3;
const H = 60 * M;

type Msg = [dir: "in" | "out", text: string, ago: number];

async function seedConv(workspaceId: string, d: { channel: string; externalId: string; pageId: string; name: string; kind?: "inbox" | "comment"; postId?: string; phones?: string; msgs: Msg[]; comment?: boolean; authorOut: string }) {
  const now = Date.now();
  const at = (ago: number) => new Date(now - ago);
  const msgs = d.msgs.map(([direction, text, ago], i) => {
    const id = `demo_${d.channel}_${d.externalId}_${i}`.replace(/[^\w.:-]/g, "_");
    return {
      direction,
      text,
      author: direction === "in" ? d.name : d.authorOut,
      externalId: id,
      kind: d.comment ? "comment" : "message",
      commentId: d.comment ? id : "",
      parentId: d.comment && direction === "out" ? `demo_${d.channel}_${d.externalId}_${i - 1}`.replace(/[^\w.:-]/g, "_") : "",
      status: "sent",
      createdAt: at(ago),
    };
  });
  const ins = msgs.filter((m) => m.direction === "in");
  const outs = msgs.filter((m) => m.direction === "out");
  const last = msgs[msgs.length - 1];
  let unread = 0;
  for (let i = msgs.length - 1; i >= 0 && msgs[i].direction === "in"; i--) unread++;
  await db.conversation.upsert({
    where: { workspaceId_channel_externalId: { workspaceId, channel: d.channel, externalId: d.externalId } },
    create: {
      workspaceId,
      channel: d.channel,
      externalId: d.externalId,
      pageId: d.pageId,
      kind: d.kind ?? "inbox",
      postId: d.postId ?? "",
      source: d.postId ? "post" : "",
      sourceRef: d.postId ?? "",
      name: d.name,
      phones: d.phones ?? "",
      lastText: (last.direction === "out" ? "Bạn: " : "") + last.text,
      lastAt: last.createdAt,
      lastInAt: ins[ins.length - 1]?.createdAt ?? null,
      lastOutAt: outs[outs.length - 1]?.createdAt ?? null,
      firstReplyAt: outs.find((o) => ins[0] && o.createdAt > ins[0].createdAt)?.createdAt ?? null,
      unread,
      createdAt: msgs[0].createdAt,
      messages: { create: msgs },
    },
    update: {},
  });
}

export async function seedChannels(workspaceId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw new Error("Không tìm thấy workspace");
  const biz = ws.name || "Shop";

  /* Instagram */
  const igName = `${biz} · Instagram`;
  await db.fbPage.upsert({
    where: { workspaceId_pageId: { workspaceId, pageId: DEMO_IG_ID } },
    create: { workspaceId, pageId: DEMO_IG_ID, platform: "instagram", name: igName, token: "demo_ig_page_token", settingsJson: JSON.stringify({ autoHidePhone: true }) },
    update: {},
  });
  const media = [
    { postId: "18000000000000101", kind: "video", message: "Reel: 3 bước skincare buổi sáng cho da dầu ✨", ago: 30 * H },
    { postId: "18000000000000102", kind: "post", message: "Ưu đãi tháng 11: giảm 20% liệu trình chăm sóc da cho khách đặt lịch qua Instagram 💆‍♀️", ago: 6 * H },
  ];
  for (const m of media)
    await db.fbPost.upsert({
      where: { workspaceId_postId: { workspaceId, postId: m.postId } },
      create: { workspaceId, pageId: DEMO_IG_ID, postId: m.postId, kind: m.kind, message: m.message, permalink: `https://www.instagram.com/p/demo${m.postId.slice(-3)}/`, postedAt: new Date(Date.now() - m.ago), commentsCount: m.postId.endsWith("101") ? 1 : 2 },
      update: {},
    });
  await seedConv(workspaceId, { channel: "instagram", externalId: "demo_igsid_1", pageId: DEMO_IG_ID, name: "@thuy.trang.beauty", authorOut: igName, msgs: [["in", "Chào shop, liệu trình trị mụn 8 buổi giá bao nhiêu ạ?", 3 * H], ["out", "Dạ chào chị, liệu trình 8 buổi bên em 4.200.000đ, đang giảm 20% cho khách Instagram ạ.", 3 * H - 10 * M], ["in", "Ok em, cho chị đặt lịch thứ 7 nhé, sđt chị 0935 111 222", 40 * M]] });
  await seedConv(workspaceId, { channel: "instagram", externalId: "demo_igsid_2", pageId: DEMO_IG_ID, name: "@minh.khoa", authorOut: igName, msgs: [["in", "Shop có ship serum vitamin C ra Đà Nẵng không ạ?", 12 * M]] });
  await seedConv(workspaceId, { channel: "instagram", externalId: `c:${media[0].postId}:demo_igu_1`, pageId: DEMO_IG_ID, kind: "comment", postId: media[0].postId, comment: true, name: "@lananh.ng", authorOut: igName, msgs: [["in", "Da dầu dùng serum nào hợp shop ơi?", 20 * H], ["out", "Dạ chị check Direct giúp em nhé, em tư vấn chi tiết ạ!", 20 * H - 15 * M]] });
  await seedConv(workspaceId, { channel: "instagram", externalId: `c:${media[1].postId}:demo_igu_2`, pageId: DEMO_IG_ID, kind: "comment", postId: media[1].postId, comment: true, name: "@hoa.pham", phones: "0901888999", authorOut: igName, msgs: [["in", "Đăng ký giữ suất cho em, 0901 888 999", 2 * H]] });
  await seedConv(workspaceId, { channel: "instagram", externalId: `c:${media[1].postId}:demo_igu_3`, pageId: DEMO_IG_ID, kind: "comment", postId: media[1].postId, comment: true, name: "@quynh.tran", authorOut: igName, msgs: [["in", "Ưu đãi áp dụng đến ngày nào vậy ạ?", 25 * M]] });

  /* WhatsApp */
  await db.channelAccount.upsert({
    where: { workspaceId_platform_accountId: { workspaceId, platform: "whatsapp", accountId: DEMO_WA_PHONE_ID } },
    create: {
      workspaceId,
      platform: "whatsapp",
      accountId: DEMO_WA_PHONE_ID,
      name: `${biz} · WhatsApp`,
      credentialsJson: JSON.stringify({ phoneNumberId: DEMO_WA_PHONE_ID, wabaId: "200000000000001", accessToken: "demo_wa_token", appSecret: "", verifyToken: "demo_verify_wa" }),
      settingsJson: JSON.stringify({ displayPhone: "+84 901 234 567" }),
    },
    update: {},
  });
  await seedConv(workspaceId, { channel: "whatsapp", externalId: "84912000111", pageId: DEMO_WA_PHONE_ID, name: "Linh Nguyen", phones: "0912000111", authorOut: "WhatsApp", msgs: [["in", "Hi shop, mình muốn đặt lịch massage đá nóng tối nay được không?", 2 * H], ["out", "Dạ được ạ, 19h tối nay mình nhé?", 2 * H - 5 * M], ["in", "Ok 19h nhé, cảm ơn shop", 90 * M]] });
  await seedConv(workspaceId, { channel: "whatsapp", externalId: "84987000222", pageId: DEMO_WA_PHONE_ID, name: "David Tran", phones: "0987000222", authorOut: "WhatsApp", msgs: [["in", "Can I book a facial for Saturday?", 3 * 24 * H], ["out", "Sure! Saturday 10am works for you?", 3 * 24 * H - 20 * M], ["in", "Let me check and get back to you", 3 * 24 * H - 15 * M]] });

  /* Sàn: tạo shop rồi đồng bộ đơn mẫu qua đúng luồng thật */
  const shopee = await db.channelAccount.upsert({
    where: { workspaceId_platform_accountId: { workspaceId, platform: "shopee", accountId: DEMO_SHOPEE_SHOP } },
    create: {
      workspaceId,
      platform: "shopee",
      accountId: DEMO_SHOPEE_SHOP,
      name: `${biz} Official · Shopee`,
      credentialsJson: JSON.stringify({ partnerId: "demo_partner", partnerKey: "demo_shopee_key", shopId: DEMO_SHOPEE_SHOP, accessToken: "demo_shopee_access", refreshToken: "demo_shopee_refresh", expiresAt: new Date(Date.now() + 4 * H).toISOString() }),
    },
    update: {},
  });
  const tiktok = await db.channelAccount.upsert({
    where: { workspaceId_platform_accountId: { workspaceId, platform: "tiktok", accountId: DEMO_TIKTOK_SHOP } },
    create: {
      workspaceId,
      platform: "tiktok",
      accountId: DEMO_TIKTOK_SHOP,
      name: `${biz} · TikTok Shop`,
      credentialsJson: JSON.stringify({ appKey: "demo_app_key", appSecret: "demo_tts_secret", shopId: DEMO_TIKTOK_SHOP, shopCipher: "demo_cipher", accessToken: "demo_tts_access", refreshToken: "demo_tts_refresh", expiresAt: new Date(Date.now() + 7 * 24 * H).toISOString() }),
    },
    update: {},
  });
  const [s1, s2] = [await syncShop(shopee), await syncShop(tiktok)];
  return { instagram: DEMO_IG_ID, whatsapp: DEMO_WA_PHONE_ID, shopee: s1, tiktok: s2 };
}
