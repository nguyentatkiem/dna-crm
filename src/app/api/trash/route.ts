import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getObject } from "@/lib/config/schema";
import { dbRaw } from "@/lib/db";
import { TRASH_DAYS, listTrash, purge, restoreFromTrash } from "@/lib/trash";

/** Thùng rác: chỉ người có quyền xoá (chủ, quản lý) được xem và thao tác. */
async function guard() {
  const a = await appApi();
  if ("error" in a) return { error: a.error } as const;
  const acc = await accessOf(a.ctx);
  if (!allow(acc, "trash_restore") && !allow(acc, "trash_purge")) return { error: fail("Bạn chưa có quyền xem thùng rác.", 403) } as const;
  return { ctx: a.ctx, acc } as const;
}

export async function GET(req: Request) {
  const g = await guard();
  if ("error" in g) return g.error;
  const object = new URL(req.url).searchParams.get("object") ?? undefined;
  const rows = await listTrash(g.ctx.workspace.id, object);
  return ok({ days: TRASH_DAYS, items: rows.map((r) => ({ ...r, deletedAt: r.deletedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() })) });
}

const Body = z.object({ action: z.enum(["restore", "purge", "empty"]), ids: z.array(z.string()).max(1000).default([]) });

/** { action: "restore" | "purge", ids } hoặc { action: "empty" } để dọn sạch thùng rác. */
export async function POST(req: Request) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { ctx } = g;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Yêu cầu không hợp lệ");
  const wid = ctx.workspace.id;
  const who = { workspaceId: wid, user: ctx.user };

  if (p.data.action === "restore") {
    if (!allow(g.acc, "trash_restore")) return fail("Bạn chưa có quyền khôi phục từ thùng rác", 403);
    const rows = await dbRaw.record.findMany({ where: { workspaceId: wid, id: { in: p.data.ids }, deletedAt: { not: null } }, select: { id: true, title: true, objectKey: true } });
    for (const r of rows) {
      if (await restoreFromTrash(wid, r.id)) await audit(who, "record.restore", r.objectKey, r.id, `Khôi phục ${getObject(ctx.config, r.objectKey)?.itemLabel.toLowerCase() ?? "mục"} “${r.title}” từ thùng rác`);
    }
    return ok({ restored: rows.length });
  }

  if (!allow(g.acc, "trash_purge")) return fail("Bạn chưa có quyền xoá vĩnh viễn", 403);
  const ids = p.data.action === "empty" ? (await listTrash(wid)).map((r) => r.id) : p.data.ids;
  const n = await purge(wid, ids);
  if (n) await audit(who, "record.purge", "record", "", `Xoá vĩnh viễn ${n} mục khỏi thùng rác`);
  return ok({ purged: n });
}
