import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { conversationWhere } from "@/lib/chat/visibility";
import { getInboxTags } from "@/lib/inbox-list";
import { accessOf, allow } from "@/lib/permissions";
import { parseTags } from "@/lib/quick-replies";

const Body = z.object({
  ids: z.array(z.string().max(60)).min(1).max(500),
  action: z.enum(["read", "unread", "done", "open", "tag_add", "tag_remove", "assign"]),
  tag: z.string().max(40).optional(),
  assignee: z.string().max(120).optional(),
});

const LABEL = { read: "đánh dấu đã đọc", unread: "đánh dấu chưa đọc", done: "đánh dấu đã xong", open: "mở lại", tag_add: "gắn thẻ", tag_remove: "gỡ thẻ", assign: "phân công" } as const;

/** Thao tác hàng loạt trên các hội thoại đã chọn (chỉ áp cho hội thoại người dùng được thấy). Phân công cần quyền inbox_assign. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const { ids, action, tag, assignee } = p.data;
  const wid = a.ctx.workspace.id;
  const where = { AND: [await conversationWhere(a.ctx), { id: { in: ids } }] };

  if (action === "assign") {
    if (!allow(await accessOf(a.ctx), "inbox_assign")) return fail("Bạn chưa có quyền phân công hội thoại", 403);
    const who = assignee ?? "";
    if (who && !a.ctx.config.team.includes(who) && who !== a.ctx.user.name) return fail("Người này không có trong đội ngũ");
  }
  if ((action === "tag_add" || action === "tag_remove") && !tag) return fail("Chưa chọn thẻ");
  if (action === "tag_add" && !(await getInboxTags(wid)).some((t) => t.key === tag)) return fail("Thẻ không có trong danh mục");

  let count = 0;
  if (action === "tag_add" || action === "tag_remove") {
    const rows = await db.conversation.findMany({ where, select: { id: true, tagsJson: true } });
    for (const r of rows) {
      const cur = parseTags(r.tagsJson);
      const next = action === "tag_add" ? [...new Set([...cur, tag!])] : cur.filter((t) => t !== tag);
      if (next.length === cur.length && next.every((t, i) => t === cur[i])) continue;
      await db.conversation.update({ where: { id: r.id }, data: { tagsJson: JSON.stringify(next) } });
      count++;
    }
  } else {
    const data =
      action === "read"
        ? { unread: 0, readAt: new Date() }
        : action === "unread"
          ? { unread: 1, readAt: null }
          : action === "done"
            ? { status: "done", unread: 0 }
            : action === "open"
              ? { status: "open" }
              : { assignee: assignee ?? "" };
    count = (await db.conversation.updateMany({ where, data })).count;
  }
  if (action !== "read" && action !== "unread")
    await audit({ workspaceId: wid, user: a.ctx.user }, "update", "conversation", "", `Hàng loạt: ${LABEL[action]}${action === "assign" ? ` cho ${assignee || "(bỏ giao)"}` : tag ? ` “${tag}”` : ""} · ${count} hội thoại`);
  return ok({ ok: true, count });
}
