import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { generateLanding } from "@/lib/marketing/landing";

/** AI dựng lại các khối theo DNA, chưa lưu: trình sửa cho người dùng xem rồi mới bấm Lưu. */
export async function POST(req: Request) {
  const a = await marketingApi("landing_manage");
  if ("error" in a) return a.error;
  const p = z.object({ goal: z.string().max(500).default("") }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  return ok(await generateLanding(a.ctx.workspace.id, a.ctx.config, p.data.goal));
}
