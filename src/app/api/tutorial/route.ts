import { appApi, fail, ok } from "@/lib/http";
import { accessOf } from "@/lib/permissions";
import { ProgressPatchSchema } from "@/lib/tutorial/schema";
import { CHECKLIST_IDS, VISIT_IDS } from "@/lib/tutorial/checklist";
import { buildTours } from "@/lib/tutorial/tours";
import { checklistFor, loadSettings, patchProgress } from "@/lib/tutorial/server";

export const dynamic = "force-dynamic";

/** Tiến độ hướng dẫn của chính mình + danh sách bắt đầu (tự phát hiện từ dữ liệu thật). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { workspace, user, config } = a.ctx;
  const [access, settings] = await Promise.all([accessOf(a.ctx), loadSettings(workspace.id)]);
  const { checklist, progress } = await checklistFor({ workspaceId: workspace.id, user, term: config.terminology, access });
  return ok({ progress, settings, checklist });
}

const TOUR_IDS = new Set(buildTours({ contact: "khách", deal: "giao dịch", appointment: "lịch hẹn" }).map((t) => t.id));

/** Cập nhật tiến độ của chính mình (không sửa được của người khác). */
export async function PATCH(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = ProgressPatchSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  if (p.data.tour && !TOUR_IDS.has(p.data.tour.id)) return fail("Không có hướng dẫn này");
  if (p.data.manual && !CHECKLIST_IDS.has(p.data.manual.id)) return fail("Không có mục này trong danh sách");
  if (p.data.hint && !TOUR_IDS.has(p.data.hint)) return fail("Không có hướng dẫn này");
  if (p.data.visit && !VISIT_IDS.has(p.data.visit)) return fail("Không theo dõi trang này");
  const progress = await patchProgress(a.ctx.workspace.id, a.ctx.user.id, p.data);
  return ok({ progress });
}

