// Phần dùng chung phía server của Chân dung 360°.
import type { Record as DbRecord } from "@prisma/client";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";

export type C360Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string }; config: WorkspaceConfig };

/** Khoá trường SĐT, email và kiểu từng trường của bảng Khách. */
export function contactKeys(cfg: WorkspaceConfig) {
  const obj = getObject(cfg, "contacts");
  const fields = obj?.fields ?? [];
  return {
    obj,
    phoneKey: fields.find((f) => f.type === "phone")?.key ?? "",
    emailKey: fields.find((f) => f.type === "email")?.key ?? "",
    types: Object.fromEntries(fields.map((f) => [f.key, f.type])) as Record<string, string>,
  };
}

export const dataOf = (r: Pick<DbRecord, "dataJson">) => parseJson<Record<string, unknown>>(r.dataJson, {});

/** Các workspace đang có cấu hình (dùng cho job chạy nền). */
export async function activeWorkspaces() {
  const rows = await db.workspaceConfig.findMany({ where: { isActive: true }, select: { workspaceId: true, configJson: true } });
  return rows.map((r) => ({ workspaceId: r.workspaceId, cfg: parseJson<WorkspaceConfig | null>(r.configJson, null) })).filter((x): x is { workspaceId: string; cfg: WorkspaceConfig } => !!x.cfg);
}

/** Cập nhật Record mà không đổi updatedAt (dữ liệu tính tự động, không phải người sửa). */
export function quietUpdate(r: Pick<DbRecord, "id" | "updatedAt">, data: { score?: number; dataJson?: string }) {
  return db.record.update({ where: { id: r.id }, data: { ...data, updatedAt: r.updatedAt } });
}

export const chunk = <T>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
