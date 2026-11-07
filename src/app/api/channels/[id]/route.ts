import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { accountDTO, PLATFORM_LABEL, type Platform } from "@/lib/channels/accounts";

type P = { params: Promise<{ id: string }> };

const Patch = z.object({ name: z.string().trim().min(1).max(120).optional(), active: z.boolean().optional() });

export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return fail("Bạn không có quyền sửa kết nối", 403);
  const row = await db.channelAccount.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!row) return fail("Không tìm thấy tài khoản", 404);
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const next = await db.channelAccount.update({ where: { id: row.id }, data: p.data });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "channelAccount", row.id, `${PLATFORM_LABEL[row.platform as Platform] ?? row.platform} ${next.name}: ${p.data.active === undefined ? "đổi tên" : p.data.active ? "bật" : "tắt"}`);
  return ok({ item: accountDTO(next) });
}

/** Ngắt kết nối: xoá khoá; giữ hội thoại và đơn đã đồng bộ. */
export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return fail("Bạn không có quyền ngắt kết nối", 403);
  const row = await db.channelAccount.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!row) return fail("Không tìm thấy tài khoản", 404);
  await db.channelAccount.delete({ where: { id: row.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "delete", "channelAccount", row.id, `Ngắt kết nối ${PLATFORM_LABEL[row.platform as Platform] ?? row.platform} ${row.name}`);
  return ok({ ok: true });
}
