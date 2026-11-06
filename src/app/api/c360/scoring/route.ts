import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { allow, getAccess } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { SCORE_EVENTS, SCORE_EVENT_LABEL, type ScoringRules } from "@/lib/c360/scoring";
import { recomputeScores, saveScoringRules, scoringRules } from "@/lib/c360/behavior";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await scoringRules(a.ctx.workspace.id));
}

/** Ô số trong khoảng [lo, hi], báo lỗi tiếng Việt kèm tên ô. */
const range = (label: string, lo: number, hi: number) =>
  z.number({ error: `${label}: hãy nhập một số` }).refine((n) => Number.isFinite(n) && n >= lo && n <= hi, { message: `${label} phải từ ${lo} đến ${hi}` });

const Rules = z.object({
  enabled: z.boolean({ error: "Thiếu trạng thái bật/tắt chấm điểm" }),
  profileWeight: range("Giữ % điểm hồ sơ", 0, 100),
  windowDays: range("Số ngày tính hành vi", 7, 365),
  decayPerIdleWeek: range("Điểm trừ mỗi tuần im lặng", 0, 20),
  events: z.object(Object.fromEntries(SCORE_EVENTS.map((k) => [k, range(`Điểm “${SCORE_EVENT_LABEL[k]}”`, -50, 50)]))),
});

/** Lưu luật chấm điểm (chủ workspace). */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await getAccess(a.ctx.user.id, a.ctx.workspace.id), "settings_manage")) return fail("Bạn chưa có quyền sửa luật chấm điểm", 403);
  const p = Rules.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const saved = await saveScoringRules(a.ctx.workspace.id, p.data as ScoringRules);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "settings.scoring", "pref", "scoring", "Sửa luật chấm điểm theo hành vi", saved);
  return ok(saved);
}

/** "Tính lại ngay" cho mọi khách. */
export async function POST() {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await getAccess(a.ctx.user.id, a.ctx.workspace.id), "settings_manage")) return fail("Bạn chưa có quyền tính lại điểm", 403);
  const r = await recomputeScores(a.ctx.workspace.id, a.ctx.config);
  return ok(r);
}
