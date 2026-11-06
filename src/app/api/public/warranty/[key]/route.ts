import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { WARRANTY_STATUS_LABEL, maskSerial, normPhone } from "@/lib/care/shared";

type P = { params: Promise<{ key: string }> };
const Body = z.object({ phone: z.string().max(30) });

// Giới hạn nhẹ theo IP: 10 lần tra mỗi 10 phút, tránh dò số điện thoại hàng loạt.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60e3);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 10;
}

/** Tra cứu bảo hành công khai: phải nhập đúng đủ số điện thoại; serial được che bớt. */
export async function POST(req: Request, { params }: P) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (limited(ip)) return fail("Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau ít phút.", 429);
  const ws = await db.workspace.findUnique({ where: { formKey: (await params).key }, select: { id: true } });
  if (!ws) return fail("Không tìm thấy cửa hàng", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  const phone = normPhone(p.success ? p.data.phone : "");
  if (!/^0\d{9,10}$/.test(phone)) return fail("Nhập đủ số điện thoại (10 số)");
  const rows = await db.warranty.findMany({ where: { workspaceId: ws.id, phone, status: { not: "void" } }, orderBy: { endAt: "desc" }, take: 50 });
  return ok({
    items: rows.map((w) => ({
      productName: w.productName,
      serial: maskSerial(w.serial),
      startAt: w.startAt.toISOString(),
      endAt: w.endAt.toISOString(),
      status: w.status === "active" && w.endAt < new Date() ? "expired" : w.status,
      statusLabel: WARRANTY_STATUS_LABEL[w.status === "active" && w.endAt < new Date() ? "expired" : w.status] ?? w.status,
    })),
  });
}
