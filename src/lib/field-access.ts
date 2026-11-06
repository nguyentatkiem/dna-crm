// Phân quyền theo trường (Pref "fieldAccess"): chủ luôn sửa được; quản lý / nhân viên có thể bị đặt "chỉ xem" hoặc "ẩn".
// Phần thuần dùng được cả trình duyệt lẫn server; getFieldRules đọc Pref (chỉ gọi ở server).
import { z } from "zod";
import type { Role } from "./permissions";

export const ACCESS = ["edit", "read", "hidden"] as const;
export type Access = (typeof ACCESS)[number];
export const ACCESS_LABEL: Record<Access, string> = { edit: "Sửa", read: "Chỉ xem", hidden: "Ẩn" };

export const FieldRule = z.object({ manager: z.enum(ACCESS).optional(), member: z.enum(ACCESS).optional() });
export type FieldRule = z.infer<typeof FieldRule>;
/** Luật của một bảng: { [key trường]: { manager?, member? } }. */
export const FieldRules = z.record(z.string().max(80), FieldRule);
export type FieldRules = z.infer<typeof FieldRules>;
/** Cả Pref: { [objectKey]: FieldRules }. */
export type FieldAccessPref = Record<string, FieldRules>;

/** Quyền của một vai trò với một trường. Chủ luôn "edit"; chưa đặt = "edit". */
export function accessOf(role: Role, rules: FieldRules | null | undefined, key: string): Access {
  if (role === "owner") return "edit";
  return rules?.[key]?.[role] ?? "edit";
}

/** Các trường bị ẩn với vai trò này. */
export function hiddenKeys(role: Role, rules: FieldRules | null | undefined): Set<string> {
  if (role === "owner" || !rules) return new Set();
  return new Set(Object.keys(rules).filter((k) => accessOf(role, rules, k) === "hidden"));
}

/** Các trường chỉ xem (không sửa được) với vai trò này. */
export function readonlyKeys(role: Role, rules: FieldRules | null | undefined): string[] {
  if (role === "owner" || !rules) return [];
  return Object.keys(rules).filter((k) => accessOf(role, rules, k) === "read");
}

/** Bỏ các trường bị ẩn khỏi data của bản ghi (không đổi bản gốc). */
export function applyFieldAccess<T extends { data: Record<string, unknown> }>(dto: T, role: Role, rules: FieldRules | null | undefined): T {
  const hide = hiddenKeys(role, rules);
  if (!hide.size) return dto;
  return { ...dto, data: Object.fromEntries(Object.entries(dto.data).filter(([k]) => !hide.has(k))) };
}

/** Bỏ các ô gửi lên mà vai trò này không được sửa (chỉ xem hoặc ẩn). */
export function dropReadonlyEdits<T extends Record<string, unknown>>(data: T | undefined, role: Role, rules: FieldRules | null | undefined): T | undefined {
  if (!data || role === "owner" || !rules) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => accessOf(role, rules, k) === "edit")) as T;
}

/** Bảng chỉ còn các trường được thấy (dùng cho cột bảng, xuất Excel, form hồ sơ). */
export function visibleObject<O extends { fields: { key: string }[] }>(obj: O, role: Role, rules: FieldRules | null | undefined): O {
  const hide = hiddenKeys(role, rules);
  return hide.size ? { ...obj, fields: obj.fields.filter((f) => !hide.has(f.key)) } : obj;
}

/** Làm sạch luật trước khi lưu: chỉ giữ trường có trong bảng và giá trị khác "edit". */
export function cleanRules(rules: FieldRules, fieldKeys: string[]): FieldRules {
  const out: FieldRules = {};
  for (const k of fieldKeys) {
    const r = rules[k];
    if (!r) continue;
    const x: FieldRule = {};
    if (r.manager && r.manager !== "edit") x.manager = r.manager;
    if (r.member && r.member !== "edit") x.member = r.member;
    // Quản lý không thể bị giới hạn chặt hơn nhân viên.
    const rank = { edit: 0, read: 1, hidden: 2 } as const;
    if (x.manager && rank[x.manager] > rank[x.member ?? "edit"]) x.member = x.manager;
    if (x.manager || x.member) out[k] = x;
  }
  return out;
}

/** Luật của một bảng trong workspace (server). */
export async function getFieldRules(workspaceId: string, objectKey: string): Promise<FieldRules> {
  const { getPref } = await import("./prefs");
  const all = await getPref<FieldAccessPref>(workspaceId, "fieldAccess", {});
  return all[objectKey] ?? {};
}
