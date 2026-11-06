import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { marketingApi } from "@/lib/marketing/guard";
import { generateLanding, uniqueSlug } from "@/lib/marketing/landing";
import { blankBlock, sanitizeBlocks, THEMES } from "@/app/lp/model";

export async function GET() {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const list = await db.landingPage.findMany({ where: { workspaceId: a.ctx.workspace.id }, orderBy: { createdAt: "desc" } });
  return ok({ pages: list.map(({ blocksJson: _b, ...p }) => p) });
}

const In = z.object({ title: z.string().trim().max(160).default(""), ai: z.boolean().default(false), goal: z.string().max(500).default(""), theme: z.string().max(20).default("blue"), blocks: z.unknown().optional() });

/** Tạo trang: trống (hero + form), từ khối gửi lên, hoặc để AI dựng theo DNA ({ ai: true }). Luôn tạo ở dạng nháp. */
export async function POST(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const p = In.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const wid = a.ctx.workspace.id;
  let title = p.data.title;
  let blocks = p.data.blocks !== undefined ? sanitizeBlocks(p.data.blocks) : [blankBlock("hero"), blankBlock("benefits"), blankBlock("form")];
  let source = "manual";
  if (p.data.ai) {
    const g = await generateLanding(wid, a.ctx.config, p.data.goal);
    title ||= g.title;
    blocks = g.blocks;
    source = g.source;
  }
  title ||= "Trang mới";
  const page = await db.landingPage.create({
    data: { workspaceId: wid, title, slug: await uniqueSlug(title), theme: p.data.theme in THEMES ? p.data.theme : "blue", blocksJson: JSON.stringify(blocks), createdBy: a.ctx.user.name },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "create", "landing", page.id, `Tạo landing page “${title}”${source === "ai" ? " bằng AI" : ""}`);
  return ok({ id: page.id, source }, 201);
}
