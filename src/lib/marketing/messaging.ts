// Gửi tin ra ngoài qua Zalo OA, Zalo ZNS, SMS, email. Mọi lần gửi đều ghi OutMessage và hoạt động trên record.
import { db } from "../db";
import { getSettings, type Integrations } from "../settings";
import { sendZaloText } from "../zalo";
import { contactInfo, loadCfg } from "./store";
import { CHANNEL_LABEL, fillVars, type VarValues } from "./shared";

export type Channel = "zalo" | "zns" | "sms" | "email" | "messenger";
export type SendInput = { channel: Channel; recordId?: string; sequenceId?: string; to?: string; subject?: string; body: string; templateId?: string; params?: Record<string, string> };
export type SendResult = { ok: boolean; error?: string; skipped?: boolean };

/** Đổi SĐT Việt Nam về dạng 84xxxxxxxxx (ZNS, nhà mạng yêu cầu). */
export function phone84(p: string) {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("84")) return d.length >= 11 ? d : "";
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 9 && d.length <= 10 ? "84" + d : "";
}

export const dryRun = () => process.env.MESSAGING_DRY_RUN === "1";

/** Kênh đã đủ khoá để gửi chưa. Trả lý do khi chưa đủ (không gọi mạng). */
export function channelReady(s: Integrations, ch: Channel, templateId?: string): string | null {
  if (ch === "messenger") return "Messenger nhắn qua Hộp thư, kịch bản chưa hỗ trợ";
  if (ch === "zalo") return s.zalo?.accessToken || (s.zalo?.refreshToken && s.zalo.appId && s.zalo.secretKey) ? null : "Chưa cấu hình Zalo OA (Nguồn khách → Zalo OA)";
  if (ch === "zns") {
    if (!s.zalo?.accessToken) return "Chưa cấu hình ZNS: cần Access Token Zalo OA";
    if (!(templateId || s.zns?.defaultTemplateId)) return "Chưa cấu hình ZNS: thiếu mã template";
    return null;
  }
  if (ch === "sms") {
    const p = s.sms?.provider;
    if (!p) return "Chưa cấu hình SMS";
    if (p === "esms" && !(s.sms?.apiKey && s.sms.secretKey)) return "Chưa cấu hình SMS: eSMS cần API Key và Secret Key";
    if (p === "speedsms" && !s.sms?.apiKey) return "Chưa cấu hình SMS: SpeedSMS cần Access Token";
    if (p === "http" && !s.sms?.url) return "Chưa cấu hình SMS: thiếu URL nhận tin";
    return null;
  }
  if (ch === "email") return s.email?.host && s.email.user && s.email.pass ? null : "Chưa cấu hình email SMTP";
  return "Kênh không hỗ trợ";
}

export async function sendMessage(workspaceId: string, input: SendInput): Promise<SendResult> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return { ok: false, error: "Không tìm thấy workspace" };
  const s = getSettings(ws);
  const cfg = await loadCfg(workspaceId);
  const record = input.recordId ? await db.record.findFirst({ where: { id: input.recordId, workspaceId } }) : null;
  const info = record && cfg ? await contactInfo(workspaceId, cfg, record) : null;

  const vars: VarValues = {
    ten: info?.name ?? "",
    ten_doanh_nghiep: cfg?.businessName ?? ws.name,
    so_dien_thoai: info?.phone ?? "",
    nguoi_phu_trach: info?.owner || cfg?.team[0] || "",
  };
  const body = fillVars(input.body, vars);
  const subject = fillVars(input.subject ?? "", vars);
  const templateId = input.templateId || s.zns?.defaultTemplateId || "";
  const to =
    input.to?.trim() ||
    (input.channel === "zalo" ? info?.zaloUid : input.channel === "email" ? info?.email : input.channel === "sms" || input.channel === "zns" ? info?.phone : "") ||
    "";

  const log = async (status: "sent" | "failed" | "skipped" | "dry_run", error = "", provider = "") => {
    await db.outMessage.create({
      data: { workspaceId, recordId: record?.id, sequenceId: input.sequenceId, channel: input.channel, to: to.slice(0, 200), subject: subject.slice(0, 300), body: body.slice(0, 5000), status, error: error.slice(0, 500), provider },
    });
    if (record) {
      const head = status === "sent" ? `Đã gửi ${CHANNEL_LABEL[input.channel]}` : status === "dry_run" ? `Chạy thử ${CHANNEL_LABEL[input.channel]} (không gửi thật)` : status === "skipped" ? `Bỏ qua tin ${CHANNEL_LABEL[input.channel]}: ${error}` : `Gửi ${CHANNEL_LABEL[input.channel]} lỗi: ${error}`;
      await db.activity.create({ data: { recordId: record.id, kind: "message", body: `${head}\n${body.slice(0, 1000)}`, author: input.sequenceId ? "Kịch bản chăm sóc" : "Marketing" } });
    }
  };

  const notReady = channelReady(s, input.channel, templateId);
  if (notReady) {
    await log("skipped", notReady);
    return { ok: false, skipped: true, error: notReady };
  }
  if (!to) {
    const why = input.channel === "zalo" ? "Khách chưa quan tâm OA (chưa có Zalo user id)" : input.channel === "email" ? "Khách chưa có email" : "Khách chưa có số điện thoại";
    await log("skipped", why);
    return { ok: false, skipped: true, error: why };
  }
  if (!body.trim() && input.channel !== "zns") {
    await log("skipped", "Nội dung trống");
    return { ok: false, skipped: true, error: "Nội dung trống" };
  }
  if (dryRun()) {
    console.log(`[messaging] DRY_RUN ${input.channel} → ${to}: ${body.slice(0, 120)}`);
    await log("dry_run", "MESSAGING_DRY_RUN=1: chỉ ghi nhật ký");
    return { ok: true, skipped: true, error: "Chế độ chạy thử: không gửi thật" };
  }

  try {
    let provider: string = input.channel;
    if (input.channel === "zalo") await sendZaloText(workspaceId, to, body);
    else if (input.channel === "zns") await sendZns(s, to, templateId, { ...vars, ...(input.params ?? {}) });
    else if (input.channel === "sms") provider = await sendSms(s, to, body);
    else if (input.channel === "email") await sendEmail(s, to, subject || `Thông tin từ ${vars.ten_doanh_nghiep}`, body);
    await log("sent", "", provider);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log("failed", msg);
    return { ok: false, error: msg };
  }
}

// ---------------- Từng kênh ----------------

/** Zalo ZNS: gửi tin theo template đã được Zalo duyệt. tracking_id để đối soát. */
async function sendZns(s: Integrations, phone: string, templateId: string, params: Record<string, string>) {
  const p = phone84(phone);
  if (!p) throw new Error("Số điện thoại không hợp lệ");
  const res = await fetch("https://business.openapi.zalo.me/message/template", {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: s.zalo?.accessToken ?? "" },
    body: JSON.stringify({ phone: p, template_id: templateId, template_data: params, tracking_id: `crm_${Date.now()}` }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: number; message?: string };
  if (j.error !== 0) throw new Error(`ZNS báo lỗi ${j.error ?? res.status}: ${j.message ?? ""}`);
}

// Lưu ý: tham số API SMS có thể thay đổi theo nhà cung cấp/nhà mạng, cần kiểm tra lại tài liệu eSMS, SpeedSMS trước khi chạy thật.
async function sendSms(s: Integrations, phone: string, text: string) {
  const c = s.sms ?? {};
  if (c.provider === "esms") {
    const res = await fetch("https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ApiKey: c.apiKey, SecretKey: c.secretKey, Brandname: c.brandname, SmsType: "2", Phone: phone.replace(/\D/g, ""), Content: text }),
    });
    const j = (await res.json().catch(() => ({}))) as { CodeResult?: string; ErrorMessage?: string };
    if (j.CodeResult !== "100") throw new Error(`eSMS báo lỗi ${j.CodeResult ?? res.status}: ${j.ErrorMessage ?? ""}`);
    return "esms";
  }
  if (c.provider === "speedsms") {
    const res = await fetch("https://api.speedsms.vn/index.php/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${c.apiKey}:x`).toString("base64")}` },
      body: JSON.stringify({ to: [phone84(phone) || phone], content: text, sms_type: 2, sender: c.brandname ?? "" }),
    });
    const j = (await res.json().catch(() => ({}))) as { status?: string; message?: string; code?: string };
    if (j.status !== "success") throw new Error(`SpeedSMS báo lỗi ${j.code ?? res.status}: ${j.message ?? ""}`);
    return "speedsms";
  }
  const res = await fetch(c.url!, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({ to: phone, text }),
  });
  if (!res.ok) throw new Error(`Máy chủ SMS trả mã ${res.status}`);
  return "http";
}

async function sendEmail(s: Integrations, to: string, subject: string, text: string) {
  const e = s.email!;
  const port = Number(e.port) || 587;
  // Nạp lúc chạy (không cho webpack đóng gói): nodemailer dùng node:child_process, làm hỏng bản build edge của instrumentation.
  const nodemailer = (await import(/* webpackIgnore: true */ "nodemailer" as string)) as typeof import("nodemailer");
  const tr = (nodemailer.default ?? nodemailer).createTransport({ host: e.host, port, secure: port === 465, auth: { user: e.user, pass: e.pass } });
  await tr.sendMail({ from: e.from || e.user, to, subject, text });
}
