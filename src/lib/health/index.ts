// Trang "Kiểm tra kết nối": gom các kiểm tra hệ thống + kết nối dịch vụ ngoài thành Check[].
// live=false: chỉ đọc cấu hình / máy chủ (nhanh, không gọi mạng). live=true: gọi thử thật tới dịch vụ.
// only: chỉ chạy kiểm tra có key này (nút "Thử ngay" của một dòng).
// Không bao giờ đưa khoá / token vào detail.
import { Prisma } from "@prisma/client";
import { dbRaw as db } from "../db";
import { getSettings, type Integrations } from "../settings";
import { BACKUP_DIR, dbProvider, listBackups, schemaVersion } from "../backup";
import { channelReady } from "../marketing/messaging";
import { pushConfigured } from "../push";
import { getRemote, remoteConfigured, testRemote } from "../backup-remote";
import { isDemoToken, GRAPH } from "../fb/graph";
import type { Check, CheckStatus } from "./types";
import { health as payHealth } from "../pay/health";
import { health as kbHealth } from "../kb/health";
import { health as channelsHealth } from "../channels/health";

export type { Check, CheckStatus };
export type HealthOpts = { live?: boolean; only?: string };

const SYS = "Hệ thống";
const CHAT = "Kênh chat";
const SEND = "Gửi tin";
const PUSH = "Thông báo đẩy";
const AI = "AI";
const SIP = "Tổng đài";

const PLACEHOLDERS = ["doi-chuoi-nay-thanh-chuoi-bi-mat-dai-it-nhat-32-ky-tu", "build-only-secret-khong-dung-khi-chay-0123456789", "test-secret-chi-dung-khi-chay-kiem-thu-0123456789"];
const H = 3600_000;
const ago = (ms: number) => (ms < H ? `${Math.max(1, Math.round(ms / 60_000))} phút trước` : ms < 48 * H ? `${Math.round(ms / H)} giờ trước` : `${Math.round(ms / (24 * H))} ngày trước`);
const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
const timeout = (ms = 8000) => AbortSignal.timeout(ms);
const errText = (e: unknown) => (e instanceof Error ? (e.name === "TimeoutError" ? "Hết thời gian chờ phản hồi" : e.message) : "Lỗi không rõ").slice(0, 200);

/** Chạy một nhóm kiểm tra; lỗi bất ngờ trong một nhóm không làm hỏng cả trang. */
async function safe(group: string, key: string, label: string, f: () => Promise<Check[]>): Promise<Check[]> {
  try {
    return await f();
  } catch (e) {
    return [{ key, group, label, status: "error", detail: `Không kiểm tra được: ${errText(e)}` }];
  }
}

// ======================= Hệ thống =======================

async function dbCheck(): Promise<Check> {
  const t = Date.now();
  await db.$queryRawUnsafe("SELECT 1");
  const ms = Date.now() - t;
  const p = dbProvider();
  const onInternet = /^https:\/\//.test(process.env.APP_URL ?? "") && !/localhost|127\.0\.0\.1/.test(process.env.APP_URL ?? "");
  const status: CheckStatus = ms > 1000 ? "warn" : p === "sqlite" && onInternet ? "warn" : "ok";
  const name = p === "sqlite" ? "SQLite" : "PostgreSQL";
  const extra = p === "sqlite" && onInternet ? ". Chạy thật nhiều người dùng nên chuyển sang PostgreSQL" : ms > 1000 ? ". Phản hồi chậm" : "";
  return { key: "sys.db", group: SYS, label: "Cơ sở dữ liệu", status, detail: `${name} kết nối được, phản hồi ${ms} ms${extra}`, fixHref: "/w/settings/health#trien-khai" };
}

/** So cột trong DB với schema Prisma: thiếu cột/bảng = chưa chạy prisma db push / migrate sau khi cập nhật. */
async function schemaCheck(): Promise<Check> {
  const models = Prisma.dmmf.datamodel.models;
  const have = new Map<string, Set<string>>();
  if (dbProvider() === "sqlite") {
    const tables = await db.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of tables) {
      const cols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${t.name.replace(/"/g, "")}")`);
      have.set(t.name, new Set(cols.map((c) => c.name)));
    }
  } else {
    const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()");
    for (const r of rows) (have.get(r.table_name) ?? have.set(r.table_name, new Set()).get(r.table_name)!).add(r.column_name);
  }
  const missing: string[] = [];
  for (const m of models) {
    const t = m.dbName ?? m.name;
    const cols = have.get(t);
    if (!cols) {
      missing.push(`bảng ${t}`);
      continue;
    }
    for (const f of m.fields) if (f.kind === "scalar" || f.kind === "enum") if (!cols.has(f.dbName ?? f.name)) missing.push(`${t}.${f.dbName ?? f.name}`);
  }
  const v = schemaVersion();
  if (missing.length)
    return { key: "sys.schema", group: SYS, label: "Cấu trúc dữ liệu", status: "error", detail: `Database thiếu ${missing.length} cột/bảng (vd. ${missing.slice(0, 3).join(", ")}). Chạy "npx prisma db push" rồi khởi động lại`, fixHref: "/w/settings/health#trien-khai" };
  return { key: "sys.schema", group: SYS, label: "Cấu trúc dữ liệu", status: "ok", detail: `Khớp với phiên bản ứng dụng (mã schema ${v}, ${models.length} bảng)` };
}

function secretCheck(): Check {
  const s = process.env.SESSION_SECRET ?? "";
  const base = { key: "sys.secret", group: SYS, label: "Khoá ký phiên đăng nhập", fixHref: "/w/settings/health#trien-khai" };
  if (s.length < 32) return { ...base, status: "error", detail: "SESSION_SECRET ngắn hơn 32 ký tự" };
  if (PLACEHOLDERS.includes(s) || /^(.)\1+$/.test(s)) return { ...base, status: "error", detail: "SESSION_SECRET đang là giá trị mẫu. Ai cũng giả được phiên đăng nhập: hãy đổi (openssl rand -base64 32)" };
  if (new Set(s).size < 10) return { ...base, status: "warn", detail: "SESSION_SECRET ít ký tự khác nhau, nên dùng chuỗi ngẫu nhiên" };
  return { ...base, status: "ok", detail: `Đã đặt (${s.length} ký tự), không phải giá trị mẫu` };
}

function appUrlCheck(): Check {
  const u = (process.env.APP_URL ?? "").trim();
  const base = { key: "sys.appurl", group: SYS, label: "Địa chỉ công khai (APP_URL)", fixHref: "/w/settings/health#trien-khai" };
  if (!u) return { ...base, status: "warn", detail: "Chưa đặt APP_URL: link báo giá, khảo sát, webhook sẽ lấy theo địa chỉ đang mở" };
  if (/localhost|127\.0\.0\.1/.test(u)) return { ...base, status: "warn", detail: `${u} chỉ mở được trên máy này. Khách và Facebook/Zalo không gọi tới được` };
  if (!u.startsWith("https://")) return { ...base, status: "error", detail: `${u} chưa dùng HTTPS. Facebook, Zalo, thông báo đẩy yêu cầu HTTPS` };
  return { ...base, status: "ok", detail: u };
}

async function backupCheck(workspaceId: string, s: Integrations): Promise<Check> {
  const base = { key: "sys.backup", group: SYS, label: "Sao lưu tự động", fixHref: "/w/settings/backup" };
  const latest = (await listBackups(workspaceId))[0];
  const off = s.backup?.enabled === "0";
  if (!latest) return { ...base, status: off ? "error" : "warn", detail: off ? "Đang tắt sao lưu tự động và chưa có bản nào" : "Chưa có bản sao lưu nào (job sao lưu chạy mỗi giờ)" };
  const age = Date.now() - new Date(latest.createdAt).getTime();
  const status: CheckStatus = off ? "warn" : age > 72 * H ? "error" : age > 26 * H ? "warn" : "ok";
  return { ...base, status, detail: `Bản gần nhất ${ago(age)}${off ? ". Sao lưu tự động đang TẮT" : ""}` };
}

async function remoteCheck(workspaceId: string, live: boolean): Promise<Check> {
  const c = await getRemote(workspaceId);
  const base = { key: "sys.backup_remote", group: SYS, label: "Sao lưu ra ngoài máy chủ", fixHref: "/w/settings/backup#remote", testable: true };
  if (!remoteConfigured(c)) return { ...base, testable: false, status: "warn", detail: "Chưa cấu hình. Máy chủ hỏng ổ đĩa là mất cả dữ liệu lẫn bản sao lưu: nên đẩy sang S3 / R2 / B2" };
  if (live) {
    const err = await testRemote(c);
    return { ...base, status: err ? "error" : "ok", detail: err ?? `Ghi/xoá thử trên bucket ${c.bucket} thành công` };
  }
  if (c.lastAt && c.lastOk === false) return { ...base, status: "error", detail: `Lần đẩy gần nhất lỗi: ${c.lastError}` };
  if (!c.lastAt) return { ...base, status: "warn", detail: `Đã cấu hình bucket ${c.bucket}, chưa đẩy bản nào` };
  const age = Date.now() - new Date(c.lastAt).getTime();
  return { ...base, status: age > 72 * H ? "warn" : "ok", detail: `Đẩy lên ${c.bucket} ${ago(age)}` };
}

async function diskCheck(): Promise<Check> {
  const fs = process.getBuiltinModule("node:fs/promises");
  const dir = BACKUP_DIR();
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  const st = await fs.statfs(dir);
  const free = Number(st.bavail) * Number(st.bsize);
  const total = Number(st.blocks) * Number(st.bsize);
  const status: CheckStatus = free < 512 * 1024 ** 2 ? "error" : free < 2 * 1024 ** 3 || free / total < 0.05 ? "warn" : "ok";
  return { key: "sys.disk", group: SYS, label: "Dung lượng ổ đĩa", status, detail: `Còn trống ${gb(free)} / ${gb(total)}` };
}

function jobsCheck(): Check {
  const base = { key: "sys.jobs", group: SYS, label: "Việc chạy nền" };
  if (process.env.CRM_JOBS === "off") return { ...base, status: "warn", detail: "Đang tắt (CRM_JOBS=off): không sao lưu, nhắc việc, gửi kịch bản tự động" };
  const st = (globalThis as unknown as { crmJobs?: { started: boolean; last: Record<string, number> } }).crmJobs;
  if (!st?.started) return { ...base, status: "warn", detail: "Chưa khởi động (máy chủ vừa bật, job đầu chạy sau ~20 giây)" };
  const times = Object.values(st.last);
  if (!times.length) return { ...base, status: "ok", detail: "Đã khởi động, đang chờ lượt chạy đầu" };
  const lastTick = Math.max(...times);
  const age = Date.now() - lastTick;
  const bk = st.last["Sao lưu"];
  return { ...base, status: age > 10 * 60_000 ? "error" : "ok", detail: `${Object.keys(st.last).length} việc, lượt gần nhất ${ago(age)}${bk ? `; sao lưu chạy ${ago(Date.now() - bk)}` : ""}` };
}

async function errorsCheck(workspaceId: string): Promise<Check> {
  const since = new Date(Date.now() - 24 * H);
  const where = { lastAt: { gte: since }, resolved: false, level: "error", workspaceId: { in: [workspaceId, ""] } };
  const [n, total] = await Promise.all([db.errorLog.count({ where }), db.errorLog.aggregate({ where, _sum: { count: true } })]);
  const times = total._sum.count ?? 0;
  return { key: "sys.errors", group: SYS, label: "Lỗi máy chủ 24 giờ qua", status: n === 0 ? "ok" : n >= 10 || times >= 100 ? "error" : "warn", detail: n ? `${n} loại lỗi chưa xử lý (${times} lần)` : "Không có lỗi mới", fixHref: "/w/settings/health#errors" };
}

function dryRunCheck(): Check[] {
  if (process.env.MESSAGING_DRY_RUN !== "1") return [];
  return [{ key: "sys.dryrun", group: SYS, label: "Chế độ chạy thử gửi tin", status: "warn", detail: "MESSAGING_DRY_RUN=1: tin nhắn, SMS, email chỉ ghi nhật ký, không gửi thật. Tắt khi chạy thật" }];
}

// ======================= Kênh chat =======================

async function fbChecks(workspaceId: string, live: boolean, only?: string): Promise<Check[]> {
  // Instagram được kiểm ở nhóm "Kênh chat & sàn" (lib/channels/health) — không lặp lại ở đây.
  const pages = await db.fbPage.findMany({ where: { workspaceId, active: true, platform: { not: "instagram" } }, select: { pageId: true, name: true, platform: true, token: true } });
  if (!pages.length) return [{ key: "fb.none", group: CHAT, label: "Facebook", status: "off", detail: "Chưa kết nối fanpage nào", fixHref: "/w/inbox/pages" }];
  const out: Check[] = [];
  for (const p of pages) {
    const key = `fb.${p.pageId}`;
    const label = `${p.platform === "instagram" ? "Instagram" : "Fanpage"} ${p.name || p.pageId}`;
    const base = { key, group: CHAT, label, fixHref: "/w/inbox/pages", testable: !!p.token && !isDemoToken(p.token) };
    if (!p.token) {
      out.push({ ...base, status: "error", detail: "Thiếu token trang: hãy kết nối lại" });
      continue;
    }
    if (isDemoToken(p.token)) {
      out.push({ ...base, status: "warn", detail: "Đang dùng token mẫu (chạy thử), không nhận/gửi tin thật" });
      continue;
    }
    if (!live || (only && only !== key)) {
      out.push({ ...base, status: "ok", detail: "Đã có token. Bấm Thử ngay để kiểm tra token còn hạn" });
      continue;
    }
    try {
      const r = await fetch(`${GRAPH}/me?fields=id,name`, { headers: { Authorization: `Bearer ${p.token}` }, signal: timeout() });
      const j = (await r.json().catch(() => ({}))) as { id?: string; name?: string; error?: { message?: string; code?: number } };
      if (j.id) out.push({ ...base, status: "ok", detail: `Token còn hiệu lực (${j.name ?? j.id})` });
      else out.push({ ...base, status: "error", detail: j.error?.code === 190 ? "Token hết hạn hoặc bị thu hồi: hãy kết nối lại trang" : `Facebook trả lỗi ${j.error?.code ?? r.status}` });
    } catch (e) {
      out.push({ ...base, status: "error", detail: errText(e) });
    }
  }
  return out;
}

async function zaloCheck(s: Integrations, live: boolean): Promise<Check> {
  const z = s.zalo ?? {};
  const base = { key: "zalo.oa", group: CHAT, label: "Zalo OA", fixHref: "/w/sources" };
  if (!z.accessToken && !(z.refreshToken && z.appId && z.secretKey)) return { ...base, status: "off", detail: "Chưa kết nối Zalo Official Account" };
  if (!z.accessToken) return { ...base, status: "warn", detail: "Có refresh token, chưa có access token (sẽ tự làm mới khi gửi tin)" };
  if (!live) return { ...base, testable: true, status: "ok", detail: "Đã có access token. Bấm Thử ngay để kiểm tra còn hạn" };
  try {
    const r = await fetch("https://openapi.zalo.me/v2.0/oa/getoa", { headers: { access_token: z.accessToken }, signal: timeout() });
    const j = (await r.json().catch(() => ({}))) as { error?: number; message?: string; data?: { name?: string } };
    if (j.error === 0 && j.data) return { ...base, testable: true, status: "ok", detail: `Kết nối được OA ${j.data.name ?? ""}`.trim() };
    return { ...base, testable: true, status: "error", detail: j.error === -216 || j.error === -124 ? "Access token hết hạn: hệ thống sẽ thử làm mới bằng refresh token, nếu vẫn lỗi hãy kết nối lại" : `Zalo trả lỗi ${j.error ?? r.status}` };
  } catch (e) {
    return { ...base, testable: true, status: "error", detail: errText(e) };
  }
}

async function webhookCheck(workspaceId: string): Promise<Check> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { hookKey: true } });
  return ws?.hookKey
    ? { key: "hook.key", group: CHAT, label: "Địa chỉ nhận webhook", status: "ok", detail: "Đã có mã webhook riêng của workspace (xem địa chỉ ở Nguồn khách)", fixHref: "/w/sources" }
    : { key: "hook.key", group: CHAT, label: "Địa chỉ nhận webhook", status: "warn", detail: "Chưa sinh mã webhook: mở trang Nguồn khách một lần để tạo", fixHref: "/w/sources" };
}

// ======================= Gửi tin, đẩy, AI, tổng đài =======================

async function sendChecks(s: Integrations, live: boolean): Promise<Check[]> {
  const out: Check[] = [];
  const one = (key: string, label: string, ch: "sms" | "zns" | "email") => {
    const why = channelReady(s, ch);
    out.push({ key, group: SEND, label, status: why ? "off" : "ok", detail: why ?? (ch === "sms" ? `Nhà cung cấp ${s.sms?.provider}${s.sms?.brandname ? `, brandname ${s.sms.brandname}` : ""}` : ch === "email" ? `Máy chủ ${s.email?.host}:${s.email?.port || 587}` : "Đã có token OA và mã template"), fixHref: "/w/marketing", testable: ch === "email" && !why });
  };
  one("send.sms", "SMS", "sms");
  one("send.zns", "Zalo ZNS", "zns");
  one("send.email", "Email (SMTP)", "email");
  if (live) {
    const i = out.findIndex((c) => c.key === "send.email");
    if (out[i].testable) {
      const e = s.email!;
      try {
        const nodemailer = (await import(/* webpackIgnore: true */ "nodemailer" as string)) as typeof import("nodemailer");
        const port = Number(e.port) || 587;
        const tr = (nodemailer.default ?? nodemailer).createTransport({ host: e.host, port, secure: port === 465, auth: { user: e.user, pass: e.pass }, connectionTimeout: 8000, greetingTimeout: 8000 });
        await tr.verify();
        out[i] = { ...out[i], status: "ok", detail: `Đăng nhập SMTP ${e.host}:${port} thành công` };
      } catch (x) {
        const m = errText(x);
        out[i] = { ...out[i], status: "error", detail: /auth|535|534|Invalid login/i.test(m) ? "Sai tài khoản hoặc mật khẩu ứng dụng SMTP" : `Không kết nối được SMTP: ${m.replace(/\S+@\S+/g, "[email]")}` };
      }
    }
  }
  return out;
}

function pushCheck(): Check {
  return pushConfigured()
    ? { key: "push.vapid", group: PUSH, label: "Khoá VAPID", status: /^https:\/\//.test(process.env.APP_URL ?? "") || !process.env.APP_URL ? "ok" : "warn", detail: "Đã cấu hình. Trình duyệt chỉ cho đăng ký khi mở CRM qua HTTPS (hoặc localhost)" }
    : { key: "push.vapid", group: PUSH, label: "Khoá VAPID", status: "off", detail: "Chưa đặt VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: không có thông báo đẩy lên điện thoại", fixHref: "/w/settings/health#trien-khai" };
}

async function aiCheck(live: boolean): Promise<Check> {
  const base = { key: "ai.claude", group: AI, label: "Claude (ANTHROPIC_API_KEY)" };
  if (!process.env.ANTHROPIC_API_KEY) return { ...base, status: "off", detail: "Chưa đặt khoá: AI Agent chạy bằng luật và mẫu có sẵn", fixHref: "/w/settings/health#trien-khai" };
  const { ai, MODEL } = await import("../ai");
  if (!live) return { ...base, testable: true, status: "ok", detail: `Đã đặt khoá, model ${MODEL}` };
  const t = Date.now();
  try {
    await ai()!.messages.create({ model: MODEL, max_tokens: 5, messages: [{ role: "user", content: "ping" }] }, { timeout: 20_000 });
    return { ...base, testable: true, status: "ok", detail: `Gọi thử ${MODEL} thành công (${((Date.now() - t) / 1000).toFixed(1)} giây)` };
  } catch (e) {
    const st = (e as { status?: number }).status;
    const detail = st === 401 ? "Khoá API không hợp lệ" : st === 403 ? "Khoá không có quyền dùng model này" : st === 404 ? `Không tìm thấy model ${MODEL}` : st === 429 ? "Đang bị giới hạn tốc độ hoặc hết hạn mức" : st === 529 ? "Dịch vụ đang quá tải, thử lại sau" : `Không gọi được: ${errText(e)}`;
    return { ...base, testable: true, status: st === 429 || st === 529 ? "warn" : "error", detail };
  }
}

function sipCheck(s: Integrations): Check {
  const p = s.sip ?? {};
  const base = { key: "sip", group: SIP, label: "Tổng đài SIP (gọi trên trình duyệt)", fixHref: "/w/telesales" };
  if (!p.wsUri && !p.domain && !p.extension) return { ...base, status: "off", detail: "Chưa cấu hình tổng đài" };
  if (!(p.wsUri && p.domain && p.extension && p.password)) return { ...base, status: "warn", detail: "Cấu hình chưa đủ: cần WebSocket URI, tên miền SIP, máy nhánh và mật khẩu" };
  if (!/^wss:\/\//.test(p.wsUri)) return { ...base, status: "warn", detail: `WebSocket ${p.wsUri.split("/")[2] ?? ""} không dùng wss://: trình duyệt có thể chặn khi mở CRM qua HTTPS` };
  return { ...base, status: "ok", detail: `Máy nhánh ${p.extension} @ ${p.domain}` };
}

// ======================= Tổng hợp =======================

/** Mọi kiểm tra của workspace. */
export async function runChecks(workspaceId: string, opts: HealthOpts = {}): Promise<Check[]> {
  const live = !!opts.live;
  const only = opts.only;
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settingsJson: true } });
  const s = ws ? getSettings(ws) : ({} as Integrations);
  const L = (key: string) => live && (!only || only === key);
  const tasks: Promise<Check[]>[] = [
    safe(SYS, "sys.db", "Cơ sở dữ liệu", async () => [await dbCheck()]),
    safe(SYS, "sys.schema", "Cấu trúc dữ liệu", async () => [await schemaCheck()]),
    Promise.resolve([secretCheck(), appUrlCheck()]),
    safe(SYS, "sys.backup", "Sao lưu tự động", async () => [await backupCheck(workspaceId, s)]),
    safe(SYS, "sys.backup_remote", "Sao lưu ra ngoài máy chủ", async () => [await remoteCheck(workspaceId, L("sys.backup_remote"))]),
    safe(SYS, "sys.disk", "Dung lượng ổ đĩa", async () => [await diskCheck()]),
    Promise.resolve([jobsCheck(), ...dryRunCheck()]),
    safe(SYS, "sys.errors", "Lỗi máy chủ", async () => [await errorsCheck(workspaceId)]),
    safe(CHAT, "fb", "Facebook", () => fbChecks(workspaceId, live && (!only || only.startsWith("fb.")), only)),
    safe(CHAT, "zalo.oa", "Zalo OA", async () => [await zaloCheck(s, L("zalo.oa"))]),
    safe(CHAT, "hook.key", "Webhook", async () => [await webhookCheck(workspaceId)]),
    safe(SEND, "send", "Gửi tin", () => sendChecks(s, L("send.email"))),
    Promise.resolve([pushCheck()]),
    safe(AI, "ai.claude", "Claude", async () => [await aiCheck(L("ai.claude"))]),
    Promise.resolve([sipCheck(s)]),
    // Mô-đun khác tự hiện thực (thanh toán, kho kiến thức AI, kênh chat mới).
    safe("Thanh toán", "pay", "Thanh toán", () => payHealth(workspaceId, { live: live && (!only || !isOwnKey(only)) })),
    safe(AI, "kb", "Kho kiến thức", () => kbHealth(workspaceId, { live: live && (!only || !isOwnKey(only)) })),
    safe(CHAT, "channels", "Kênh chat", () => channelsHealth(workspaceId, { live: live && (!only || !isOwnKey(only)) })),
  ];
  const all = (await Promise.all(tasks)).flat();
  return only ? all.filter((c) => c.key === only) : all;
}

const OWN = ["sys.", "fb.", "zalo.", "hook.", "send.", "push.", "ai.claude", "sip"];
const isOwnKey = (k: string) => OWN.some((p) => k === p || k.startsWith(p));

export const GROUP_ORDER = [SYS, CHAT, SEND, "Thanh toán", PUSH, AI, SIP];

/** Tóm tắt nhanh (không gọi mạng), nhớ 5 phút mỗi workspace — dùng cho thẻ cảnh báo ở trang chủ. */
const g = globalThis as unknown as { crmHealthCache?: Map<string, { at: number; checks: Check[] }> };
export async function cachedChecks(workspaceId: string, maxAgeMs = 5 * 60_000) {
  const m = (g.crmHealthCache ??= new Map<string, { at: number; checks: Check[] }>());
  const hit = m.get(workspaceId);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.checks;
  const checks = await runChecks(workspaceId);
  m.set(workspaceId, { at: Date.now(), checks });
  return checks;
}
export const clearHealthCache = (workspaceId: string) => g.crmHealthCache?.delete(workspaceId);

