// Gửi email báo cáo (HTML + file Excel đính kèm) qua SMTP đã cấu hình ở Marketing → Kênh gửi tin.
// Dùng nodemailer trực tiếp vì sendMessage() của marketing chỉ gửi chữ thuần, không có đính kèm.
import { db } from "../db";
import { getSettings } from "../settings";
import { dryRun } from "../marketing/messaging";

export const EMAIL_NOT_CONFIGURED = "Chưa cấu hình email SMTP nên chưa gửi được báo cáo. Vào Marketing → Kênh gửi tin → Email để nhập máy chủ SMTP, tài khoản và mật khẩu ứng dụng.";

export type MailInput = { to: string[]; subject: string; html: string; text: string; attachments?: { filename: string; content: Buffer; contentType: string }[] };

export async function emailReady(workspaceId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settingsJson: true } });
  const e = ws ? getSettings(ws).email : undefined;
  return !!(e?.host && e.user && e.pass);
}

export async function sendReportMail(workspaceId: string, m: MailInput): Promise<{ ok: true; dryRun?: boolean } | { ok: false; error: string }> {
  if (!m.to.length) return { ok: false, error: "Chưa có người nhận" };
  if (dryRun()) {
    console.log(`[reports] DRY_RUN email → ${m.to.join(", ")}: ${m.subject} (${m.attachments?.length ?? 0} tệp)`);
    return { ok: true, dryRun: true };
  }
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settingsJson: true } });
  const e = ws ? getSettings(ws).email : undefined;
  if (!e?.host || !e.user || !e.pass) return { ok: false, error: EMAIL_NOT_CONFIGURED };
  const port = Number(e.port) || 587;
  try {
    // Nạp lúc chạy giống messaging.ts (nodemailer dùng node:child_process).
    const nodemailer = (await import(/* webpackIgnore: true */ "nodemailer" as string)) as typeof import("nodemailer");
    const tr = (nodemailer.default ?? nodemailer).createTransport({ host: e.host, port, secure: port === 465, auth: { user: e.user, pass: e.pass } });
    await tr.sendMail({ from: e.from || e.user, to: m.to.join(", "), subject: m.subject, html: m.html, text: m.text, attachments: m.attachments });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Máy chủ email báo lỗi: ${msg.slice(0, 200)}` };
  }
}
