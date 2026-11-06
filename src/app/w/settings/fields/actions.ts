"use server";

import { revalidatePath } from "next/cache";
import { apiContext } from "@/lib/auth";
import { getObject } from "@/lib/config/schema";
import { can, getRole } from "@/lib/permissions";
import { getPref, setPref } from "@/lib/prefs";
import { audit, diffOf } from "@/lib/audit";
import { ACCESS_LABEL, FieldRules, cleanRules, type FieldAccessPref } from "@/lib/field-access";
import { FormLayout, cleanLayout, type FormLayoutPref } from "@/lib/form-layout";

type Res = { ok: true } | { ok: false; error: string };

async function ownerCtx(objectKey: string) {
  const ctx = await apiContext();
  if (!ctx?.config) return { error: "Bạn cần đăng nhập lại" } as const;
  if (!can(await getRole(ctx.user.id, ctx.workspace.id), "manage_settings")) return { error: "Chỉ chủ workspace được đổi cài đặt này" } as const;
  const obj = getObject(ctx.config, objectKey);
  if (!obj) return { error: "Không có bảng này" } as const;
  return { ctx, obj } as const;
}

/** Lưu phân quyền trường của một bảng, ghi nhật ký những ô đổi. */
export async function saveFieldAccess(objectKey: string, raw: unknown): Promise<Res> {
  const x = await ownerCtx(objectKey);
  if ("error" in x) return { ok: false, error: x.error ?? "Lỗi" };
  const p = FieldRules.safeParse(raw);
  if (!p.success) return { ok: false, error: "Dữ liệu phân quyền chưa hợp lệ" };
  const wid = x.ctx.workspace.id;
  const all = await getPref<FieldAccessPref>(wid, "fieldAccess", {});
  const next = cleanRules(p.data, x.obj.fields.map((f) => f.key));
  const flat = (r: FieldRules) => Object.fromEntries(x.obj.fields.flatMap((f) => [[`${f.label} · Quản lý`, ACCESS_LABEL[r[f.key]?.manager ?? "edit"]], [`${f.label} · Nhân viên`, ACCESS_LABEL[r[f.key]?.member ?? "edit"]]]));
  const diff = diffOf(flat(all[objectKey] ?? {}), flat(next));
  await setPref(wid, "fieldAccess", { ...all, [objectKey]: next });
  if (Object.keys(diff).length) await audit({ workspaceId: wid, user: x.ctx.user }, "settings.field_access", "settings", objectKey, `Đổi phân quyền trường bảng “${x.obj.label}”: ${Object.keys(diff).join(", ")}`.slice(0, 500), diff);
  revalidatePath(`/w/b/${objectKey}`);
  return { ok: true };
}

/** Lưu bố cục form hồ sơ của một bảng. */
export async function saveFormLayout(objectKey: string, raw: unknown): Promise<Res> {
  const x = await ownerCtx(objectKey);
  if ("error" in x) return { ok: false, error: x.error ?? "Lỗi" };
  const p = FormLayout.safeParse(raw);
  if (!p.success) return { ok: false, error: "Bố cục chưa hợp lệ (tên phần tối đa 80 ký tự)" };
  const wid = x.ctx.workspace.id;
  const all = await getPref<FormLayoutPref>(wid, "formLayout", {});
  const next = cleanLayout(p.data, x.obj.fields.map((f) => f.key));
  const rest = { ...all };
  if (next.sections.length || next.hidden?.length) rest[objectKey] = next;
  else delete rest[objectKey];
  // Pref gộp với giá trị mặc định khi đọc, nên ghi lại toàn bộ object.
  await setPref(wid, "formLayout", rest);
  await audit({ workspaceId: wid, user: x.ctx.user }, "settings.form_layout", "settings", objectKey, `Sửa bố cục hồ sơ bảng “${x.obj.label}”: ${next.sections.length} phần${next.hidden?.length ? `, ẩn ${next.hidden.length} trường` : ""}`, { before: all[objectKey] ?? null, after: next });
  revalidatePath(`/w/b/${objectKey}`);
  return { ok: true };
}
