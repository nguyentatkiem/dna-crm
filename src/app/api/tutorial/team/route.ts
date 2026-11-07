import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow, getAccess } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { buildTours } from "@/lib/tutorial/tours";
import { checklistFor, loadSettings } from "@/lib/tutorial/server";

export const dynamic = "force-dynamic";

type Ctx = Parameters<typeof accessOf>[0];
/** Xem tiến độ của đội: chủ, người mời thành viên hoặc người xem hiệu suất của đội. */
const canView = async (ctx: Ctx) => {
  const acc = await accessOf(ctx);
  return acc.isOwner || allow(acc, "members_manage") || allow(acc, "perf_view_team");
};

/** Tiến độ hướng dẫn của từng thành viên. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canView(a.ctx))) return fail("Bạn chưa có quyền xem tiến độ của đội", 403);
  const wid = a.ctx.workspace.id;
  const term = a.ctx.config.terminology;
  const tours = buildTours(term);
  const ms = await db.membership.findMany({ where: { workspaceId: wid }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, take: 200 });
  const rows = await Promise.all(
    ms.map(async (m) => {
      const access = await getAccess(m.userId, wid);
      const { checklist, progress } = await checklistFor({ workspaceId: wid, user: m.user, term, access });
      const done = tours.filter((t) => progress.tours[t.id] === "done").map((t) => t.id);
      return {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        roleName: access.roleName,
        roleColor: access.color,
        joinedAt: m.user.createdAt.toISOString(),
        pct: checklist.pct,
        done: checklist.done,
        total: checklist.total,
        toursDone: done,
        welcomeSeen: progress.welcomeSeen,
        completedAt: progress.completedAt,
        me: m.userId === a.ctx.user.id,
      };
    }),
  );
  rows.sort((x, y) => x.pct - y.pct || x.name.localeCompare(y.name, "vi"));
  const [settings, me] = await Promise.all([loadSettings(wid), accessOf(a.ctx)]);
  return ok({ members: rows, tours: tours.map((t) => ({ id: t.id, title: t.title })), settings, canEdit: me.isOwner });
}

const REMIND_HREF = "/w?tutorial=checklist";
const Remind = z.object({ userId: z.string().min(1).max(60) }).strict();

/** "Gửi nhắc": thông báo cho một thành viên hoàn thành phần làm quen. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canView(a.ctx))) return fail("Bạn chưa có quyền nhắc thành viên", 403);
  const p = Remind.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Chọn người cần nhắc");
  if (p.data.userId === a.ctx.user.id) return fail("Không cần tự nhắc mình");
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId: p.data.userId, workspaceId: a.ctx.workspace.id } }, include: { user: { select: { name: true } } } });
  if (!m) return fail("Không tìm thấy thành viên này", 404);
  // Không nhắc dồn: lời nhắc trước (trong 24 giờ) chưa được mở thì không gửi thêm.
  const recent = await db.notification.findFirst({ where: { workspaceId: a.ctx.workspace.id, userId: m.userId, href: REMIND_HREF, readAt: null, createdAt: { gte: new Date(Date.now() - 864e5) } }, select: { id: true } });
  if (recent) return fail(`Đã nhắc ${m.user.name} rồi — đợi họ mở thông báo nhé`, 429);
  await notify(a.ctx.workspace.id, { userId: m.userId, kind: "system", text: `${a.ctx.user.name} nhắc bạn hoàn thành phần “Bắt đầu với DNA CRM” — chỉ vài phút thôi!`, href: REMIND_HREF });
  return ok({ sent: true, name: m.user.name });
}
