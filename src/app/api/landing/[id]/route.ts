import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { marketingApi } from "@/lib/marketing/guard";
import { pageBlocks } from "@/lib/marketing/landing";
import { formBlock, sanitizeBlocks, slugError, THEMES } from "@/app/lp/model";

type P = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: P) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const p = await db.landingPage.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!p) return fail("Không tìm thấy trang", 404);
  return ok({ page: { ...p, blocks: pageBlocks(p) } });
}

const Patch = z.object({
  title: z.string().trim().min(1, "Hãy đặt tên trang").max(160).optional(),
  slug: z.string().trim().toLowerCase().max(60).optional(),
  theme: z.string().max(20).optional(),
  blocks: z.unknown().optional(),
  published: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: P) {
  const a = await marketingApi("landing_manage");
  if ("error" in a) return a.error;
  const page = await db.landingPage.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!page) return fail("Không tìm thấy trang", 404);
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  if (d.slug !== undefined && d.slug !== page.slug) {
    const e = slugError(d.slug);
    if (e) return fail(e);
    const hit = await db.landingPage.findUnique({ where: { slug: d.slug }, select: { id: true } });
    if (hit && hit.id !== page.id) return fail("Đường dẫn này đã có trang khác dùng, hãy chọn đường dẫn khác");
  }
  const blocks = d.blocks !== undefined ? sanitizeBlocks(d.blocks) : pageBlocks(page);
  if ((d.published ?? page.published) && !formBlock(blocks)) return fail("Trang cần ít nhất một khối Form đăng ký trước khi xuất bản");
  await db.landingPage.update({
    where: { id: page.id },
    data: {
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.slug !== undefined ? { slug: d.slug } : {}),
      ...(d.theme !== undefined && d.theme in THEMES ? { theme: d.theme } : {}),
      ...(d.blocks !== undefined ? { blocksJson: JSON.stringify(blocks) } : {}),
      ...(d.published !== undefined ? { published: d.published } : {}),
    },
  });
  if (d.published !== undefined && d.published !== page.published) {
    await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "landing", page.id, `${d.published ? "Xuất bản" : "Ngừng xuất bản"} landing page “${d.title ?? page.title}”`);
  }
  return ok({ ok: true, blocks });
}

export async function DELETE(_: Request, { params }: P) {
  const a = await marketingApi("landing_manage");
  if ("error" in a) return a.error;
  const page = await db.landingPage.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!page) return fail("Không tìm thấy trang", 404);
  await db.landingPage.delete({ where: { id: page.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "delete", "landing", page.id, `Xoá landing page “${page.title}”`);
  return ok({ ok: true });
}
