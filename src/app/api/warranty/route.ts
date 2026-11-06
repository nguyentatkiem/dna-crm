import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allowed } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { contactCard } from "@/lib/care/server";
import { addMonths, normPhone } from "@/lib/care/shared";
import { warrantyCounts, warrantyDTO, warrantyWhere } from "@/lib/care/warranty";

/** Danh sách phiếu bảo hành. ?q= (SĐT, serial, tên), status=, expiring=1. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const wid = a.ctx.workspace.id;
  const where = warrantyWhere(wid, { q: sp.get("q") ?? "", status: sp.get("status") ?? "all", expiring: sp.get("expiring") === "1" });
  const [rows, counts] = await Promise.all([db.warranty.findMany({ where, orderBy: { endAt: "asc" }, take: 500 }), warrantyCounts(wid)]);
  return ok({ items: rows.map(warrantyDTO), counts });
}

const Body = z.object({
  recordId: z.string().nullable().optional(),
  customerName: z.string().max(120).default(""),
  phone: z.string().max(30).default(""),
  productId: z.string().nullable().optional(),
  productName: z.string().max(200).default(""),
  serial: z.string().max(80).default(""),
  startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày bắt đầu không hợp lệ"),
  months: z.number().int().min(1).max(240),
  note: z.string().max(1000).default(""),
});

/** Tạo phiếu bảo hành tay. Chọn khách thì lấy tên/SĐT từ khách; chọn sản phẩm thì lấy tên sản phẩm. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!(await allowed(a.ctx, "warranty_manage"))) return fail("Bạn chưa có quyền quản lý bảo hành", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const b = p.data;
  let { customerName, phone, productName } = b;
  if (b.recordId) {
    const rec = await db.record.findFirst({ where: { id: b.recordId, workspaceId: wid } });
    if (!rec) return fail("Không tìm thấy khách", 404);
    const card = contactCard(a.ctx.config, rec);
    customerName ||= card.title;
    phone ||= card.phone;
  }
  if (b.productId) {
    const prod = await db.product.findFirst({ where: { id: b.productId, workspaceId: wid } });
    if (!prod) return fail("Không tìm thấy sản phẩm", 404);
    productName ||= prod.name;
  }
  if (!productName.trim()) return fail("Nhập tên sản phẩm");
  if (!customerName.trim() && !phone.trim()) return fail("Nhập tên hoặc số điện thoại khách");
  const [y, m, d] = b.startAt.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const w = await db.warranty.create({
    data: { workspaceId: wid, recordId: b.recordId || null, productId: b.productId || null, productName: productName.trim(), serial: b.serial.trim(), customerName: customerName.trim(), phone: normPhone(phone), startAt: start, endAt: addMonths(start, b.months), note: b.note.trim(), status: addMonths(start, b.months) < new Date() ? "expired" : "active" },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "warranty.create", "warranty", w.id, `Tạo phiếu bảo hành ${w.productName}${w.serial ? ` (${w.serial})` : ""} cho ${w.customerName || w.phone}`);
  if (w.recordId) await db.activity.create({ data: { recordId: w.recordId, kind: "update", body: `Kích hoạt bảo hành ${w.productName} ${b.months} tháng`, author: a.ctx.user.name } });
  return ok(warrantyDTO(w), 201);
}
