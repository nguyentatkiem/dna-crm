// Báo cáo đã lưu: quyền xem/sửa, DTO, chạy, gửi email (thủ công & theo lịch).
import type { Report } from "@prisma/client";
import { db, parseJson } from "../db";
import { accessOf, allow } from "../permissions";
import { XLSX_MIME } from "../xlsx";
import { activeConfig, ctxForUser, runReport, type ReportCtx } from "./engine";
import { reportHtml, reportXlsx, fileName } from "./export";
import { EMAIL_NOT_CONFIGURED, sendReportMail } from "./mail";
import { signDownload } from "./token";
import { isDue, parseRecipients, parseSchedule, scheduleLabel, validateConfig, type ReportConfig, type Schedule } from "./shared";

export type ReportDTO = {
  id: string;
  name: string;
  config: ReportConfig | null;
  schedule: Schedule;
  scheduleLabel: string;
  recipients: string[];
  shared: boolean;
  lastSentAt: string | null;
  createdBy: string;
  createdByName: string;
  mine: boolean;
  canEdit: boolean;
  updatedAt: string;
};

/** Có quyền tạo / sửa báo cáo không. */
export const canManageReports = async (ctx: ReportCtx) => allow(await accessOf(ctx), "reports_manage");

/** Người xem thấy được báo cáo: của mình, hoặc đã chia sẻ. */
export const visibleReportsWhere = (ctx: ReportCtx) => ({ workspaceId: ctx.workspace.id, OR: [{ createdBy: ctx.user.id }, { shared: true }] });

export async function findVisibleReport(ctx: ReportCtx, id: string) {
  return db.report.findFirst({ where: { AND: [visibleReportsWhere(ctx), { id }] } });
}

/** Sửa được: có quyền reports_manage và (là người tạo hoặc là chủ). */
export async function canEditReport(ctx: ReportCtx, r: Pick<Report, "createdBy">) {
  const acc = await accessOf(ctx);
  return allow(acc, "reports_manage") && (r.createdBy === ctx.user.id || acc.isOwner);
}

export function parseConfig(r: Pick<Report, "configJson">, cfg: Parameters<typeof validateConfig>[1]): ReportConfig | null {
  const v = validateConfig(parseJson<unknown>(r.configJson, {}), cfg);
  return v.ok ? v.config : null;
}

export async function toDTO(ctx: ReportCtx, r: Report, cfg: Parameters<typeof validateConfig>[1], names?: Map<string, string>): Promise<ReportDTO> {
  const schedule = parseSchedule(r.scheduleJson);
  return {
    id: r.id,
    name: r.name,
    config: parseConfig(r, cfg),
    schedule,
    scheduleLabel: scheduleLabel(schedule),
    recipients: parseRecipients(r.recipientsJson),
    shared: r.shared,
    lastSentAt: r.lastSentAt?.toISOString() ?? null,
    createdBy: r.createdBy,
    createdByName: names?.get(r.createdBy) ?? "",
    mine: r.createdBy === ctx.user.id,
    canEdit: await canEditReport(ctx, r),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function memberNames(workspaceId: string) {
  const ms = await db.membership.findMany({ where: { workspaceId }, select: { userId: true, user: { select: { name: true, email: true } } } });
  return { names: new Map(ms.map((m) => [m.userId, m.user.name])), emails: new Map(ms.map((m) => [m.userId, m.user.email])) };
}

function appUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Gửi email một báo cáo. Dữ liệu chạy theo phạm vi quyền của NGƯỜI TẠO báo cáo (không phải người nhận).
 * Người nhận mặc định = email người tạo.
 */
export async function deliverReport(r: Report, opts: { origin?: string; to?: string[] } = {}): Promise<{ ok: true; to: string[]; dryRun?: boolean } | { ok: false; error: string }> {
  const ctx = await ctxForUser(r.workspaceId, r.createdBy);
  if (!ctx) return { ok: false, error: "Người tạo báo cáo không còn trong workspace" };
  const cfg = await activeConfig(r.workspaceId);
  const config = parseConfig(r, cfg);
  if (!config) return { ok: false, error: "Cấu hình báo cáo không hợp lệ" };
  let to = opts.to?.length ? opts.to : parseRecipients(r.recipientsJson);
  if (!to.length) {
    const u = await db.user.findUnique({ where: { id: r.createdBy }, select: { email: true } });
    to = u?.email ? [u.email] : [];
  }
  if (!to.length) return { ok: false, error: "Chưa có email người nhận" };
  const result = await runReport(ctx, cfg, config);
  const xlsx = await reportXlsx(r.name, result);
  const token = await signDownload({ rid: r.id, wid: r.workspaceId, uid: r.createdBy });
  const link = `${(opts.origin || appUrl()).replace(/\/$/, "")}/api/reports/dl/${token}`;
  const html = reportHtml(r.name, result, { link, note: `Số liệu theo phạm vi quyền của ${ctx.user.name}.` });
  const text = `${r.name}\n${result.rangeLabel}\n\n${result.columns.map((c) => c.label).join(" | ")}\n${result.rows.slice(0, 30).map((row) => row.map((v) => v ?? "").join(" | ")).join("\n")}\n\nTải Excel: ${link}`;
  const res = await sendReportMail(r.workspaceId, { to, subject: `[Báo cáo] ${r.name} — ${result.rangeLabel}`, html, text, attachments: [{ filename: fileName(r.name, "xlsx"), content: xlsx, contentType: XLSX_MIME }] });
  if (!res.ok) return res;
  return { ok: true, to, dryRun: res.dryRun };
}

/**
 * Job (15 phút): gửi các báo cáo tới hạn theo lịch. Mỗi kỳ đúng một lần: đánh dấu lastSentAt trước khi gửi
 * (updateMany có điều kiện → hai tiến trình chạy song song cũng chỉ một bên giành được), gửi lỗi thì trả lại.
 */
export async function tickReports(now = new Date()): Promise<{ sent: number; failed: number }> {
  const list = await db.report.findMany({ where: { NOT: { scheduleJson: { in: ["{}", ""] } } }, take: 500 });
  let sent = 0;
  let failed = 0;
  for (const r of list) {
    const s = parseSchedule(r.scheduleJson);
    const slot = isDue(s, r.lastSentAt, r.createdAt, now);
    if (!slot) continue;
    const claim = await db.report.updateMany({ where: { id: r.id, OR: [{ lastSentAt: null }, { lastSentAt: { lt: slot } }] }, data: { lastSentAt: now } });
    if (!claim.count) continue;
    const res = await deliverReport(r).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    if (res.ok) sent++;
    else {
      failed++;
      console.error(`[reports] gửi “${r.name}” lỗi: ${res.error}`);
      // Chưa cấu hình email: bỏ qua kỳ này (không thử lại mỗi 15 phút). Lỗi khác: trả lại để lần chạy sau thử tiếp.
      if (res.error !== EMAIL_NOT_CONFIGURED) await db.report.update({ where: { id: r.id }, data: { lastSentAt: r.lastSentAt } }).catch(() => undefined);
    }
  }
  return { sent, failed };
}
