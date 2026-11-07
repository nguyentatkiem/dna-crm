// Hoàn tất uỷ quyền shop (callback OAuth). Dùng chung cho Shopee và TikTok Shop.
import type { ChannelAccount } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { patchCreds, PLATFORM_LABEL, settingsOf, type Platform } from "./accounts";
import { syncShop } from "./orders";

/** Tách state "<id>.<nonce>" và kiểm tra khớp tài khoản trong workspace. */
export async function accountFromState(workspaceId: string, platform: Platform, state: string): Promise<ChannelAccount | null> {
  const [id, nonce] = state.split(".");
  if (!id || !nonce) return null;
  const row = await db.channelAccount.findFirst({ where: { id, workspaceId, platform } });
  if (!row || settingsOf(row).oauthState !== nonce) return null;
  return row;
}

/** Lưu token mới, đổi accountId tạm (pending_…) thành shop id thật, xoá state, đồng bộ đơn lần đầu. */
export async function finishOAuth(row: ChannelAccount, patch: Record<string, string>, shopId: string, user: { id: string; name: string }, name?: string) {
  await patchCreds(row.id, patch);
  const s = settingsOf(row);
  delete s.oauthState;
  const clash = shopId && shopId !== row.accountId ? await db.channelAccount.findUnique({ where: { workspaceId_platform_accountId: { workspaceId: row.workspaceId, platform: row.platform, accountId: shopId } } }) : null;
  if (clash) throw new Error(`${PLATFORM_LABEL[row.platform as Platform]} ${shopId} đã được kết nối ở một tài khoản khác. Xoá tài khoản trùng rồi thử lại.`);
  const next = await db.channelAccount.update({
    where: { id: row.id },
    data: { ...(shopId ? { accountId: shopId } : {}), settingsJson: JSON.stringify(s), active: true, ...(name ? { name } : row.name.includes("chờ uỷ quyền") ? { name: `${PLATFORM_LABEL[row.platform as Platform]} ${shopId}` } : {}) },
  });
  await audit({ workspaceId: row.workspaceId, user }, "update", "channelAccount", row.id, `Uỷ quyền ${PLATFORM_LABEL[row.platform as Platform]} ${next.name}`);
  return syncShop(next).catch(() => null);
}
