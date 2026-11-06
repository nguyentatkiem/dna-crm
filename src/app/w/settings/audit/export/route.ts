import { db } from "@/lib/db";
import { apiContext } from "@/lib/auth";
import { allow, getAccess } from "@/lib/permissions";
import { actionLabel, auditWhere } from "../shared";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Xuất nhật ký thao tác ra CSV (mở được bằng Excel), theo đúng bộ lọc đang chọn. */
export async function GET(req: Request) {
  const ctx = await apiContext();
  if (!ctx) return new Response("Bạn cần đăng nhập lại", { status: 401 });
  if (!allow(await getAccess(ctx.user.id, ctx.workspace.id), "audit_view")) return new Response("Bạn không có quyền xem nhật ký", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await db.auditLog.findMany({ where: auditWhere(ctx.workspace.id, sp), orderBy: { createdAt: "desc" }, take: 20000 });
  const lines = [
    ["Thời gian", "Người", "Hành động", "Đối tượng", "Mã đối tượng", "Tóm tắt", "Chi tiết thay đổi"].join(","),
    ...rows.map((r) =>
      [r.createdAt.toLocaleString("vi-VN", { timeZone: process.env.TZ || "Asia/Ho_Chi_Minh" }), r.userName, actionLabel(r.action), r.entity, r.entityId, r.summary, r.diffJson].map(cell).join(","),
    ),
  ];
  const day = new Date().toISOString().slice(0, 10);
  // BOM để Excel đọc đúng tiếng Việt.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nhat-ky-${day}.csv"` },
  });
}
