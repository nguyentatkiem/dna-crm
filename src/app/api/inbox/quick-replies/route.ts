import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getQuickTopics } from "@/lib/inbox-list";
import { allowed } from "@/lib/permissions";
import { QuickInput, toQuickDTO } from "./shared";

/** Mẫu trả lời nhanh + chủ đề. Mọi thành viên dùng được; canManage cho biết có được sửa không. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const [rows, topics, canManage] = await Promise.all([
    db.quickReply.findMany({ where: { workspaceId: wid }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }], take: 2000 }),
    getQuickTopics(wid),
    allowed(a.ctx, "quick_reply_manage"),
  ]);
  return ok({ items: rows.map(toQuickDTO), topics, canManage });
}

/** Tạo mẫu. Cần quyền quick_reply_manage. Phím tắt không được trùng. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "quick_reply_manage"))) return fail("Bạn chưa có quyền tạo mẫu trả lời nhanh", 403);
  const p = QuickInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const wid = a.ctx.workspace.id;
  if (p.data.shortcut && (await db.quickReply.findFirst({ where: { workspaceId: wid, shortcut: p.data.shortcut }, select: { id: true } }))) return fail(`Phím tắt /${p.data.shortcut} đã có`, 409);
  const last = await db.quickReply.findFirst({ where: { workspaceId: wid }, orderBy: { sort: "desc" }, select: { sort: true } });
  const row = await db.quickReply.create({
    data: { workspaceId: wid, shortcut: p.data.shortcut, topic: p.data.topic, content: p.data.content, attachmentsJson: JSON.stringify(p.data.attachments), sort: (last?.sort ?? 0) + 1, createdBy: a.ctx.user.name },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "create", "quick_reply", row.id, `Tạo mẫu trả lời nhanh${row.shortcut ? ` /${row.shortcut}` : ""}`);
  return ok(toQuickDTO(row), 201);
}
