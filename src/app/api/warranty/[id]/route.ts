import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allowed } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { warrantyDTO } from "@/lib/care/warranty";

type P = { params: Promise<{ id: string }> };
const Body = z.object({ action: z.enum(["claim", "void", "reactivate"]), note: z.string().max(1000).default("") });

const stamp = () => new Date().toLocaleDateString("vi-VN", { timeZone: process.env.TZ || "Asia/Ho_Chi_Minh" });

/** Ghi nhận yêu cầu bảo hành, huỷ phiếu, hoặc mở lại phiếu đã yêu cầu/huỷ. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!(await allowed(a.ctx, "warranty_manage"))) return fail("Bạn chưa có quyền quản lý bảo hành", 403);
  const w = await db.warranty.findFirst({ where: { id: (await params).id, workspaceId: wid } });
  if (!w) return fail("Không tìm thấy phiếu bảo hành", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  const { action, note } = p.data;
  if (action === "claim" && w.status !== "active") return fail("Chỉ phiếu còn hạn mới ghi nhận bảo hành được");
  if (action === "claim" && !note.trim()) return fail("Ghi lại tình trạng lỗi khách báo");
  const status = action === "claim" ? "claimed" : action === "void" ? "void" : w.endAt < new Date() ? "expired" : "active";
  const label = action === "claim" ? "Yêu cầu bảo hành" : action === "void" ? "Huỷ phiếu" : "Mở lại phiếu";
  const line = `[${stamp()} · ${a.ctx.user.name}] ${label}${note.trim() ? `: ${note.trim()}` : ""}`;
  const u = await db.warranty.update({ where: { id: w.id }, data: { status, note: [w.note, line].filter(Boolean).join("\n").slice(-4000) } });
  await audit({ workspaceId: wid, user: a.ctx.user }, `warranty.${action}`, "warranty", w.id, `${label} ${w.productName}${w.serial ? ` (${w.serial})` : ""}`);
  if (w.recordId) await db.activity.create({ data: { recordId: w.recordId, kind: "update", body: `${label} ${w.productName}${note.trim() ? `: ${note.trim()}` : ""}`, author: a.ctx.user.name } });
  return ok(warrantyDTO(u));
}
