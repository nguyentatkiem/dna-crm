// Tiện ích dùng chung cho webhook kênh (Instagram, WhatsApp, Shopee, TikTok Shop).
import type { Workspace } from "@prisma/client";
import { db } from "../db";
import { originOf } from "../sales/service";

export const workspaceByHook = (key: string) => db.workspace.findUnique({ where: { hookKey: key } });

/** Đọc body gốc (để kiểm chữ ký) và JSON. */
export async function readBody(req: Request): Promise<{ raw: string; body: Record<string, any> | null }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const raw = await req.text();
  try {
    return { raw, body: raw ? JSON.parse(raw) : {} };
  } catch {
    return { raw, body: null };
  }
}

/** Ghi nhật ký sự kiện webhook ở trang Nguồn khách (không chặn luồng chính). */
export const logHook = (ws: Workspace, provider: string, channel: string, status: string, message: string, raw = "") =>
  db.leadEvent.create({ data: { workspaceId: ws.id, provider, channel, status, message: message.slice(0, 500), payloadJson: raw.slice(0, 20000) } }).catch(() => {});

/** Các URL công khai có thể của webhook (sau proxy, host thật có thể khác req.url) — để kiểm chữ ký có URL. */
export function publicUrls(req: Request) {
  const u = new URL(req.url);
  const origin = originOf(req.headers, u.origin);
  return [...new Set([`${origin}${u.pathname}`, `${u.origin}${u.pathname}`, req.url])];
}

/** URL webhook hiển thị cho người dùng. */
export const hookUrl = (origin: string, key: string, path: string) => `${origin}/api/hooks/${key}/${path}`;
