import { appApi, fail, ok } from "@/lib/http";
import { ai, MODEL, textOf } from "@/lib/ai";
import { perfAccess } from "@/lib/perf/access";
import { personBoard, rangeFromQuery } from "@/lib/perf/board";
import { coachPrompt } from "@/lib/perf/coach";

type Ctx = { params: Promise<{ name: string }> };

/**
 * Gợi ý huấn luyện bằng AI cho một người. Chỉ gửi số liệu tổng hợp (chỉ số, trung vị đội, điểm mạnh/yếu) —
 * không gửi tên/điện thoại/email khách hay nội dung cuộc gọi. Chưa cấu hình ANTHROPIC_API_KEY → 501.
 */
export async function POST(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const who = decodeURIComponent((await params).name).trim();
  const access = await perfAccess(a.ctx);
  if (!access.canSeePerson(who)) return fail("Bạn chỉ xem được hồ sơ hiệu suất của mình hoặc thành viên đội mình", 403);
  const c = ai();
  if (!c) return fail("Chưa bật AI nên chưa có gợi ý huấn luyện. Chủ workspace cần thêm ANTHROPIC_API_KEY vào cấu hình máy chủ. Bạn vẫn xem được điểm mạnh / cần cải thiện tự động ở trên.", 501);
  const b = await personBoard(a.ctx.workspace.id, a.ctx.config, access, who, rangeFromQuery(new URL(req.url).searchParams));
  if (!b) return fail(`Không có “${who}” trong danh sách nhân viên`, 404);
  const p = coachPrompt(b, a.ctx.config.industry);
  try {
    const msg = await c.messages.create({ model: MODEL, max_tokens: 1500, output_config: { effort: "low" }, system: p.system, messages: [{ role: "user", content: p.user }] });
    if (msg.stop_reason === "refusal") return fail("AI chưa đưa ra được gợi ý, thử lại sau", 502);
    const text = textOf(msg);
    if (!text) return fail("AI chưa đưa ra được gợi ý, thử lại sau", 502);
    return ok({ text, source: "ai" });
  } catch (e) {
    console.error("[perf coach]", e instanceof Error ? e.message : e);
    return fail("Không gọi được AI lúc này, thử lại sau ít phút", 502);
  }
}
