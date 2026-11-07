// Tiện ích cho route /api/kb/**: quyền, kiểm tra dữ liệu, ghi KbDoc.
import { z } from "zod";
import { db } from "../db";
import { allowed } from "../permissions";
import { invalidateKb } from "./store";
import { parseTags } from "./text";

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson?: string } };
export const canManageKb = (ctx: Ctx) => allowed(ctx, "kb_manage");

export const DocInput = z.object({
  kind: z.enum(["faq", "doc", "policy", "conversation"]).default("faq"),
  title: z.string().trim().min(1, "Cần nhập câu hỏi / tiêu đề").max(300),
  content: z.string().trim().min(1, "Cần nhập nội dung trả lời").max(100_000),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  source: z.string().max(120).optional(),
  active: z.boolean().optional(),
});
export type DocInputT = z.infer<typeof DocInput>;

export async function createDocs(ctx: Ctx, items: DocInputT[]) {
  if (!items.length) return 0;
  await db.kbDoc.createMany({
    data: items.map((d) => ({
      workspaceId: ctx.workspace.id,
      kind: d.kind,
      title: d.title,
      content: d.content,
      tagsJson: JSON.stringify(parseTags(d.tags)),
      source: d.source || "manual",
      active: d.active ?? true,
      createdBy: ctx.user.name,
    })),
  });
  invalidateKb(ctx.workspace.id);
  return items.length;
}
