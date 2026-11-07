import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { ai } from "@/lib/ai";
import { canManageKb } from "@/lib/kb/api";
import { extractPairs, learnCandidates } from "@/lib/kb/learn";

/** Hội thoại có kết quả tốt để học (?q= tên khách, ?all=1 gồm cả hội thoại chưa xong). */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  const sp = new URL(req.url).searchParams;
  return ok({ items: await learnCandidates(a.ctx.workspace.id, { q: sp.get("q") ?? "", all: sp.get("all") === "1" }), aiAvailable: !!ai() });
}

const Body = z.object({ ids: z.array(z.string()).min(1, "Chọn ít nhất một hội thoại").max(20, "Tối đa 20 hội thoại mỗi lần") });

/** Rút cặp hỏi–đáp để duyệt (chưa lưu). Lưu bằng POST /api/kb/bulk. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  return ok(await extractPairs(a.ctx.workspace.id, p.data.ids));
}
