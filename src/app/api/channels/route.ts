import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db, parseJson } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { ensureHookKey } from "@/lib/settings";
import { originOf } from "@/lib/sales/service";
import { accountDTO, isDryRunCreds, PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/channels/accounts";
import { hookUrl } from "@/lib/channels/hook";
import { WaError, waPhoneInfo } from "@/lib/channels/whatsapp";

/** Tài khoản WhatsApp / Shopee / TikTok Shop (khoá đã che), số hội thoại / đơn, URL webhook cần đăng ký. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const acc = await accessOf(a.ctx);
  const rows = await db.channelAccount.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "asc" } });
  const [convs, orders] = await Promise.all([
    db.conversation.groupBy({ by: ["channel", "pageId"], where: { workspaceId: wid, channel: { in: ["whatsapp", "instagram"] } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["salesChannel"], where: { workspaceId: wid, salesChannel: { in: ["shopee", "tiktok"] } }, _count: { _all: true }, _sum: { total: true } }),
  ]);
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: wid } });
  const key = await ensureHookKey(ws);
  const origin = originOf(req.headers, new URL(req.url).origin);
  return ok({
    items: rows.map((r) => ({
      ...accountDTO(r),
      conversations: r.platform === "whatsapp" ? (convs.find((c) => c.channel === "whatsapp" && c.pageId === r.accountId)?._count._all ?? 0) : 0,
    })),
    orders: Object.fromEntries(orders.map((o) => [o.salesChannel, { count: o._count._all, total: o._sum.total ?? 0 }])),
    hooks: {
      instagram: hookUrl(origin, key, "instagram"),
      whatsapp: hookUrl(origin, key, "whatsapp"),
      shopee: hookUrl(origin, key, "shopee-shop"),
      tiktok: hookUrl(origin, key, "tiktok-shop"),
      shopeeRedirect: `${origin}/api/channels/oauth/shopee`,
      tiktokRedirect: `${origin}/api/channels/oauth/tiktok`,
    },
    canConnect: allow(acc, "integrations_manage"),
  });
}

const Str = z.string().trim().max(2000).optional();
const Body = z.object({
  /** Có id = cập nhật tài khoản đó (ô khoá để trống thì giữ khoá cũ). */
  id: z.string().max(60).optional(),
  platform: z.enum(PLATFORMS),
  name: z.string().trim().max(120).optional(),
  creds: z.record(z.string(), Str).default({}),
});

const REQUIRED: Record<Platform, [string, string][]> = {
  whatsapp: [
    ["phoneNumberId", "Phone number ID"],
    ["accessToken", "Access token"],
  ],
  shopee: [
    ["partnerId", "Partner ID"],
    ["partnerKey", "Partner Key"],
  ],
  tiktok: [
    ["appKey", "App Key"],
    ["appSecret", "App Secret"],
  ],
};
const ALLOWED: Record<Platform, string[]> = {
  whatsapp: ["phoneNumberId", "wabaId", "accessToken", "appSecret", "verifyToken"],
  shopee: ["partnerId", "partnerKey", "shopId", "accessToken", "refreshToken", "baseUrl"],
  tiktok: ["appKey", "appSecret", "serviceId", "shopId", "shopCipher", "accessToken", "refreshToken", "baseUrl", "authBaseUrl"],
};

/**
 * Kết nối / cập nhật tài khoản kênh. WhatsApp: kiểm tra token bằng GET /{phone-number-id} (token sai → từ chối,
 * mất mạng → lưu kèm cảnh báo). Shopee / TikTok: lưu khoá ứng dụng; uỷ quyền shop bằng nút “Kết nối qua sàn”.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return fail("Bạn không có quyền kết nối kênh", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const wid = a.ctx.workspace.id;
  const { platform } = p.data;
  const cur = p.data.id ? await db.channelAccount.findFirst({ where: { id: p.data.id, workspaceId: wid, platform } }) : null;
  if (p.data.id && !cur) return fail("Không tìm thấy tài khoản", 404);
  const old = parseJson<Record<string, string>>(cur?.credentialsJson, {});
  const creds: Record<string, string> = { ...old };
  for (const k of ALLOWED[platform]) {
    const v = p.data.creds[k];
    if (v) creds[k] = v;
  }
  for (const [k, label] of REQUIRED[platform]) if (!creds[k]) return fail(`Cần điền ${label}`);
  if (platform === "whatsapp" && !/^\d{6,25}$/.test(creds.phoneNumberId)) return fail("Phone number ID là dãy số (WhatsApp Manager → API Setup)");
  if (platform !== "whatsapp" && creds.shopId && !/^[\w-]{3,40}$/.test(creds.shopId)) return fail("Shop ID không hợp lệ");

  const accountId = platform === "whatsapp" ? creds.phoneNumberId : creds.shopId || cur?.accountId || `pending_${randomBytes(6).toString("hex")}`;
  const clash = await db.channelAccount.findUnique({ where: { workspaceId_platform_accountId: { workspaceId: wid, platform, accountId } } });
  if (clash && clash.id !== cur?.id) return fail(`${PLATFORM_LABEL[platform]} ${accountId} đã kết nối rồi`, 409);

  let name = p.data.name ?? cur?.name ?? "";
  let warning = "";
  const draft = { credentialsJson: JSON.stringify(creds) };
  if (platform === "whatsapp") {
    try {
      const info = await waPhoneInfo({ ...(cur ?? { id: "", workspaceId: wid, platform, accountId, name, settingsJson: "{}", active: true, lastSyncAt: null, createdAt: new Date() }), ...draft });
      if (info.simulated) warning = "Đang chạy thử (token demo_ hoặc MESSAGING_DRY_RUN=1): chưa kiểm tra với WhatsApp.";
      if (!name) name = info.name ? `${info.name}${info.displayPhone ? ` · ${info.displayPhone}` : ""}` : "";
    } catch (e) {
      if (e instanceof WaError && e.code) return fail(`WhatsApp không chấp nhận: ${e.message}`);
      warning = `Chưa kiểm tra được với WhatsApp (${e instanceof Error ? e.message : e}). Đã lưu.`;
    }
  } else if (isDryRunCreds(platform, draft)) warning = "Đang chạy thử (khoá demo_): đồng bộ đơn dùng dữ liệu mẫu, không gọi sàn.";
  if (!name) name = `${PLATFORM_LABEL[platform]} ${accountId.startsWith("pending_") ? "(chờ uỷ quyền)" : accountId}`;

  const row = cur
    ? await db.channelAccount.update({ where: { id: cur.id }, data: { accountId, name, ...draft, active: true } })
    : await db.channelAccount.create({ data: { workspaceId: wid, platform, accountId, name, ...draft } });
  await audit({ workspaceId: wid, user: a.ctx.user }, cur ? "update" : "create", "channelAccount", row.id, `${cur ? "Cập nhật" : "Kết nối"} ${PLATFORM_LABEL[platform]} ${row.name}`);
  return ok({ item: accountDTO(row), warning });
}
