import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getRole } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { notifyMentions } from "@/lib/mentions";
import { KINDS, listChannels, listPosts, normChannel, postDTO } from "@/lib/feed";

/** Bảng tin: ?channel=tên kênh (bỏ trống = mọi kênh). */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const ch = new URL(req.url).searchParams.get("channel");
  const [posts, channels] = await Promise.all([listPosts(a.ctx.workspace.id, ch ? normChannel(ch) : undefined), listChannels(a.ctx.workspace.id)]);
  return ok({ posts, channels });
}

const Body = z.object({ body: z.string().trim().min(1, "Hãy viết nội dung").max(5000), kind: z.enum(KINDS).default("post"), channel: z.string().max(40).optional() });

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const manager = (await getRole(ctx.user.id, ctx.workspace.id)) !== "member";
  if (p.data.kind === "announcement" && !manager) return fail("Chỉ chủ và quản lý được đăng thông báo", 403);
  const post = await db.post.create({ data: { workspaceId: ctx.workspace.id, author: ctx.user.name, body: p.data.body, kind: p.data.kind, channel: normChannel(p.data.channel) } });
  const href = `/w/feed#post-${post.id}`;
  const snippet = post.body.length > 120 ? `${post.body.slice(0, 117)}…` : post.body;
  await notifyMentions(ctx.workspace.id, ctx.user, post.body, { title: "Bảng tin", href });
  // Thông báo chung gửi cả workspace.
  if (post.kind === "announcement") await notify(ctx.workspace.id, { kind: "feed", text: `📢 ${ctx.user.name}: ${snippet}`, href });
  return ok(postDTO({ ...post, comments: [] }), 201);
}
