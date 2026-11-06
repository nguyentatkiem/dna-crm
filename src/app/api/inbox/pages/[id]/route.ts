import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { pageDTO } from "@/lib/fb/admin";
import { PageSettings, pageSettings } from "@/lib/fb/pages";

type P = { params: Promise<{ id: string }> };

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
  settings: PageSettings.partial().optional(),
});

/** Đổi tên, bật/tắt trang (cần integrations_manage); cài đặt tự động & chữ ký (integrations_manage hoặc inbox_settings). */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const page = await db.fbPage.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!page) return fail("Không tìm thấy trang", 404);
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.path.join(".") === "settings.signature" ? "Chữ ký tối đa 150 ký tự" : "Dữ liệu không hợp lệ");
  const acc = await accessOf(a.ctx);
  const connect = allow(acc, "integrations_manage");
  if ((p.data.name !== undefined || p.data.active !== undefined) && !connect) return fail("Bạn không có quyền sửa kết nối trang", 403);
  if (p.data.settings && !connect && !allow(acc, "inbox_settings")) return fail("Bạn không có quyền cài đặt trang", 403);
  const settings = p.data.settings ? { ...pageSettings(page), ...p.data.settings } : undefined;
  if (settings) settings.signature = settings.signature.trim();
  const next = await db.fbPage.update({
    where: { id: page.id },
    data: { ...(p.data.name !== undefined ? { name: p.data.name } : {}), ...(p.data.active !== undefined ? { active: p.data.active } : {}), ...(settings ? { settingsJson: JSON.stringify(settings) } : {}) },
  });
  const parts = [p.data.active !== undefined && (p.data.active ? "bật" : "tắt"), p.data.name && "đổi tên", settings && "cài đặt tự động"].filter(Boolean);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "fbPage", page.id, `Trang ${next.name}: ${parts.join(", ")}`);
  return ok({ item: pageDTO(next) });
}

/** Ngắt kết nối trang: xoá token và cài đặt, giữ hội thoại cũ. */
export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return fail("Bạn không có quyền ngắt kết nối trang", 403);
  const page = await db.fbPage.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!page) return fail("Không tìm thấy trang", 404);
  await db.fbPage.delete({ where: { id: page.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "delete", "fbPage", page.id, `Ngắt kết nối trang ${page.name}`);
  return ok({ ok: true });
}
