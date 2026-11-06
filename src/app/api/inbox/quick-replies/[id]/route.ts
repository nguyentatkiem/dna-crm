import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allowed } from "@/lib/permissions";
import { QuickInput, toQuickDTO } from "../shared";

type P = { params: Promise<{ id: string }> };

/** Đếm một lần dùng mẫu (ai dùng cũng được). */
export async function POST(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const r = await db.quickReply.updateMany({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id }, data: { uses: { increment: 1 } } });
  return r.count ? ok({ ok: true }) : fail("Không tìm thấy mẫu", 404);
}

export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "quick_reply_manage"))) return fail("Bạn chưa có quyền sửa mẫu trả lời nhanh", 403);
  const wid = a.ctx.workspace.id;
  const id = (await params).id;
  const cur = await db.quickReply.findFirst({ where: { id, workspaceId: wid } });
  if (!cur) return fail("Không tìm thấy mẫu", 404);
  const p = QuickInput.partial().safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  if (d.shortcut && d.shortcut !== cur.shortcut && (await db.quickReply.findFirst({ where: { workspaceId: wid, shortcut: d.shortcut, NOT: { id } }, select: { id: true } }))) return fail(`Phím tắt /${d.shortcut} đã có`, 409);
  const row = await db.quickReply.update({
    where: { id },
    data: { shortcut: d.shortcut, topic: d.topic, content: d.content, attachmentsJson: d.attachments ? JSON.stringify(d.attachments) : undefined },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "update", "quick_reply", id, `Sửa mẫu trả lời nhanh${row.shortcut ? ` /${row.shortcut}` : ""}`);
  return ok(toQuickDTO(row));
}

export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "quick_reply_manage"))) return fail("Bạn chưa có quyền xoá mẫu trả lời nhanh", 403);
  const wid = a.ctx.workspace.id;
  const id = (await params).id;
  const r = await db.quickReply.deleteMany({ where: { id, workspaceId: wid } });
  if (!r.count) return fail("Không tìm thấy mẫu", 404);
  await audit({ workspaceId: wid, user: a.ctx.user }, "delete", "quick_reply", id, "Xoá mẫu trả lời nhanh");
  return ok({ ok: true });
}
