import { randomBytes } from "node:crypto";
import type { Workspace } from "@prisma/client";
import { db, parseJson } from "./db";

/** Khoá kết nối của từng nguồn. Lưu trong Workspace.settingsJson, chỉ chủ workspace xem và sửa. */
export type Integrations = {
  facebook?: { verifyToken?: string; pageToken?: string; appSecret?: string };
  google?: { key?: string };
  tiktok?: { secret?: string; accessToken?: string };
  zalo?: { appId?: string; secretKey?: string; accessToken?: string; refreshToken?: string };
  shopify?: { secret?: string };
  haravan?: { secret?: string };
  sapo?: { secret?: string };
  woocommerce?: { secret?: string };
  shopee?: { partnerKey?: string };
  lazada?: { appSecret?: string };
  tiktokshop?: { appKey?: string; appSecret?: string };
  webhook?: { secret?: string };
  call?: { secret?: string };
};

export const getSettings = (ws: Pick<Workspace, "settingsJson">) => parseJson<Integrations>(ws.settingsJson, {});

export async function saveSettings(workspaceId: string, patch: Integrations) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const cur = getSettings(ws);
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) next[k] = { ...(cur as Record<string, object>)[k], ...v };
  await db.workspace.update({ where: { id: workspaceId }, data: { settingsJson: JSON.stringify(next) } });
  return next as Integrations;
}

/** Workspace tạo từ bản cũ chưa có hookKey: sinh khi cần, không bắt chạy lại migrate. */
export async function ensureHookKey(ws: Workspace) {
  if (ws.hookKey) return ws.hookKey;
  const key = randomBytes(12).toString("base64url");
  await db.workspace.update({ where: { id: ws.id }, data: { hookKey: key } });
  return key;
}

/** Che khoá khi trả về trình duyệt: chỉ cho biết đã điền hay chưa và 4 ký tự cuối. */
export function maskSettings(s: Integrations) {
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = {};
    for (const [f, val] of Object.entries(v ?? {})) if (val) out[k][f] = `••••${String(val).slice(-4)}`;
  }
  return out;
}
