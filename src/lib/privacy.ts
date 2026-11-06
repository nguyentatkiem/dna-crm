import { db, parseJson } from "./db";
import { getPref } from "./prefs";
import { notify } from "./notify";
import type { Role } from "./permissions";
import type { RecordDTO } from "./records";

/** Cấu hình bảo mật dữ liệu (Pref "privacy"). */
export type Privacy = {
  /** Che số điện thoại với nhân viên. */
  maskPhone: boolean;
  /** Che email với nhân viên. */
  maskEmail: boolean;
  /** Số dòng mỗi người (trừ chủ) được xuất mỗi ngày. 0 = không giới hạn. */
  exportDailyLimit: number;
  /** Báo chủ khi một lần xuất từ chừng này dòng trở lên. 0 = không báo. */
  alertExportRows: number;
};
export const PRIVACY_DEFAULT: Privacy = { maskPhone: false, maskEmail: false, exportDailyLimit: 0, alertExportRows: 500 };

export const getPrivacy = (workspaceId: string) => getPref<Privacy>(workspaceId, "privacy", PRIVACY_DEFAULT);

export const DOT = "•";

/** "0912345678" → "0912•••678". Số ngắn chỉ giữ 2 chữ số đầu. */
export function maskPhone(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return s;
  const plus = s.startsWith("+") ? "+" : "";
  const d = s.replace(/\D/g, "");
  if (d.length < 7) return d.length <= 2 ? `${plus}${DOT.repeat(3)}` : `${plus}${d.slice(0, 2)}${DOT.repeat(3)}`;
  return `${plus}${d.slice(0, 4)}${DOT.repeat(3)}${d.slice(-3)}`;
}

/** "an@email.vn" → "a•@email.vn", "nguyenvan@x.vn" → "n•••@x.vn". */
export function maskEmail(v: string) {
  const s = String(v ?? "").trim();
  const at = s.lastIndexOf("@");
  if (at < 1) return s ? `${s[0]}${DOT.repeat(3)}` : s;
  const local = s.slice(0, at);
  return `${local[0]}${DOT.repeat(Math.max(1, Math.min(3, local.length - 1)))}${s.slice(at)}`;
}

/** Đoán khoá dữ liệu là số điện thoại / email khi bảng không khai báo kiểu (vd. _sdt, so_dien_thoai, email_phu). */
const PHONE_KEY = /^_?(sdt|so_?dien_?thoai|dien_?thoai|phone|mobile|zalo_?phone|hotline)\d*(_|$)/i;
const EMAIL_KEY = /^_?(e_?mail)\d*(_|$)/i;

type FieldsOf = { fields: { key: string; type: string }[] } | null | undefined;

/** Các khoá cần che của một bảng theo cấu hình hiện tại. */
export function maskedKeys(obj: FieldsOf, data: Record<string, unknown>, prefs: Pick<Privacy, "maskPhone" | "maskEmail">) {
  const phone = new Set<string>();
  const email = new Set<string>();
  for (const f of obj?.fields ?? []) {
    if (prefs.maskPhone && f.type === "phone") phone.add(f.key);
    if (prefs.maskEmail && f.type === "email") email.add(f.key);
  }
  for (const k of Object.keys(data)) {
    if (prefs.maskPhone && PHONE_KEY.test(k)) phone.add(k);
    if (prefs.maskEmail && EMAIL_KEY.test(k)) email.add(k);
  }
  return { phone, email };
}

/** Có nên che cho vai trò này không: chỉ nhân viên bị che. */
export const shouldMask = (role: Role, prefs: Pick<Privacy, "maskPhone" | "maskEmail">) => role === "member" && (prefs.maskPhone || prefs.maskEmail);

/** Che SĐT/email trong một bản ghi (chỉ với vai trò nhân viên). Không đổi bản gốc. */
export function maskRecord<T extends Pick<RecordDTO, "data">>(dto: T, obj: FieldsOf, role: Role, prefs: Pick<Privacy, "maskPhone" | "maskEmail">): T {
  if (!shouldMask(role, prefs)) return dto;
  const { phone, email } = maskedKeys(obj, dto.data, prefs);
  if (!phone.size && !email.size) return dto;
  const data = { ...dto.data };
  for (const k of phone) if (typeof data[k] === "string" && data[k]) data[k] = maskPhone(data[k] as string);
  for (const k of email) if (typeof data[k] === "string" && data[k]) data[k] = maskEmail(data[k] as string);
  return { ...dto, data };
}

/** Che một số điện thoại đơn lẻ (vd. ô "phone" trong kết quả tìm kiếm). */
export const maskPhoneFor = (role: Role, prefs: Pick<Privacy, "maskPhone">, phone: string) => (role === "member" && prefs.maskPhone ? maskPhone(phone) : phone);

/**
 * Bỏ các giá trị còn dấu che (•) khỏi dữ liệu gửi lên khi sửa, để nhân viên lưu bản ghi
 * không ghi đè số thật bằng số đã che.
 */
export function dropMaskedEdits<T extends Record<string, unknown>>(data: T | undefined): T | undefined {
  if (!data) return data;
  return Object.fromEntries(Object.entries(data).filter(([, v]) => !(typeof v === "string" && v.includes(DOT)))) as T;
}

// ---------- Giới hạn xuất dữ liệu ----------

type ExportCtx = { workspace: { id: string }; user: { id: string; name: string } };

/** Đầu ngày hôm nay theo giờ Việt Nam. */
export function startOfDayVN(now = new Date()) {
  const VN = 7 * 3600e3;
  const d = new Date(now.getTime() + VN);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - VN);
}

/** Số dòng của một dòng nhật ký xuất: ưu tiên diffJson { rows }, không có thì đọc "Xuất N mục" trong summary. */
export function exportRowsOf(a: { summary: string; diffJson: string }) {
  const d = parseJson<{ rows?: unknown }>(a.diffJson, {});
  if (typeof d.rows === "number" && isFinite(d.rows)) return d.rows;
  const m = /Xuất\s+(\d+)/.exec(a.summary);
  return m ? Number(m[1]) : 0;
}

/** Kết quả kiểm tra hạn mức (thuần, có kiểm thử). */
export function quotaResult(used: number, rows: number, limit: number) {
  if (!(limit > 0)) return { ok: true, remaining: Infinity, message: "" };
  const remaining = Math.max(0, limit - used);
  if (rows <= remaining) return { ok: true, remaining: remaining - rows, message: "" };
  return {
    ok: false,
    remaining,
    message: remaining
      ? `Hôm nay bạn chỉ còn được xuất ${remaining} dòng (giới hạn ${limit} dòng/ngày), lần này có ${rows} dòng. Hãy lọc bớt hoặc nhờ chủ workspace.`
      : `Bạn đã xuất đủ ${limit} dòng hôm nay. Hãy thử lại vào ngày mai hoặc nhờ chủ workspace.`,
  };
}

/**
 * Kiểm tra hạn mức xuất trong ngày của người dùng (chủ không bị giới hạn).
 * Gọi trước khi tạo file, khi đã biết số dòng sắp xuất.
 */
export async function checkExportQuota(ctx: ExportCtx, rows: number, role?: Role) {
  const r = role ?? (await db.membership.findUnique({ where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } } }))?.role;
  if (r === "owner") return { ok: true, remaining: Infinity, message: "" };
  const prefs = await getPrivacy(ctx.workspace.id);
  if (!(prefs.exportDailyLimit > 0)) return { ok: true, remaining: Infinity, message: "" };
  const logs = await db.auditLog.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "export", createdAt: { gte: startOfDayVN() } }, select: { summary: true, diffJson: true } });
  const used = logs.reduce((s, a) => s + exportRowsOf(a), 0);
  return quotaResult(used, rows, prefs.exportDailyLimit);
}

/** Sau khi xuất: báo các chủ workspace khi số dòng ≥ ngưỡng cảnh báo. */
export async function afterExport(ctx: ExportCtx, rows: number, label = "") {
  const prefs = await getPrivacy(ctx.workspace.id);
  if (!(prefs.alertExportRows > 0) || rows < prefs.alertExportRows) return false;
  const owners = await db.membership.findMany({ where: { workspaceId: ctx.workspace.id, role: "owner" }, select: { userId: true } });
  for (const o of owners) {
    if (o.userId === ctx.user.id) continue;
    await notify(ctx.workspace.id, { userId: o.userId, kind: "security", text: `${ctx.user.name} vừa xuất ${rows} dòng dữ liệu${label ? ` (${label})` : ""}`, href: "/w/settings/audit?action=export" });
  }
  return true;
}
