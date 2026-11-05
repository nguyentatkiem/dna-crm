import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { recordScope } from "@/lib/permissions";
import { DOC_TEMPLATES, EMPTY_DOC, listDocs, templateDoc, toDocDTO } from "@/lib/docs";

/** Danh sách tài liệu: ?recordId=... (của một mục), ?kind=record|general, ?q=tìm theo nội dung. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind");
  const docs = await listDocs(a.ctx, {
    recordId: sp.get("recordId"),
    kind: kind === "record" || kind === "general" ? kind : "all",
    q: sp.get("q") ?? undefined,
  });
  return ok({ docs, templates: DOC_TEMPLATES.map(({ key, title, hint }) => ({ key, title, hint })) });
}

const Body = z.object({
  title: z.string().max(200).optional(),
  recordId: z.string().nullish(),
  template: z.string().optional(),
});

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu chưa hợp lệ");
  const p = parsed.data;
  let rec: { id: string; title: string; objectKey: string } | null = null;
  if (p.recordId) {
    rec = await db.record.findFirst({ where: { AND: [await recordScope(a.ctx), { id: p.recordId }] }, select: { id: true, title: true, objectKey: true } });
    if (!rec) return fail("Không tìm thấy mục để gắn tài liệu", 404);
  }
  const tpl = p.template ? templateDoc(p.template) : null;
  if (p.template && !tpl) return fail("Không có mẫu này");
  const doc = tpl?.doc ?? EMPTY_DOC;
  const title = p.title?.trim() || (tpl ? (rec ? `${tpl.title} – ${rec.title}` : tpl.title) : "Tài liệu chưa đặt tên");
  const d = await db.doc.create({
    data: { workspaceId: a.ctx.workspace.id, recordId: rec?.id ?? null, title, contentJson: JSON.stringify(doc), contentText: tpl?.text ?? "", updatedBy: a.ctx.user.name },
  });
  if (rec) await db.activity.create({ data: { recordId: rec.id, kind: "system", body: `${a.ctx.user.name} đã tạo tài liệu “${title}”`, author: a.ctx.user.name } });
  return ok(toDocDTO(d, rec), 201);
}
