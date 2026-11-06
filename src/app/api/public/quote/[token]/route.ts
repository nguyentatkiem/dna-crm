import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { notify, userIdByName } from "@/lib/notify";
import { acceptQuote } from "@/lib/sales/service";
import { PUBLIC_QUOTE_STATUSES, quoteExpired } from "@/lib/sales/shared";

type Ctx = { params: Promise<{ token: string }> };

const Body = z.object({ action: z.enum(["accept", "reject"]), name: z.string().trim().max(120).optional(), reason: z.string().trim().max(1000).optional() });

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const q = await db.quote.findUnique({ where: { publicToken: token } });
  if (!q || !PUBLIC_QUOTE_STATUSES.includes(q.status)) return fail("Không tìm thấy báo giá", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  if (q.status === "accepted") return fail("Báo giá đã được chấp nhận trước đó", 409);
  if (q.status === "rejected") return fail("Báo giá đã bị từ chối trước đó", 409);
  if (quoteExpired(q) || q.status === "expired") return fail("Báo giá đã hết hạn. Vui lòng liên hệ để nhận báo giá mới.", 409);

  if (p.data.action === "accept") {
    const name = p.data.name ?? "";
    if (name.length < 2) return fail("Vui lòng nhập họ tên người xác nhận");
    await acceptQuote(q, name, null);
    return ok({ status: "accepted" });
  }
  const reason = p.data.reason ?? "";
  await db.quote.update({ where: { id: q.id }, data: { status: "rejected", rejectReason: reason } });
  await audit({ workspaceId: q.workspaceId }, "quote.reject", "quote", q.id, `Khách từ chối báo giá ${q.number}${reason ? `: ${reason}` : ""}`);
  await notify(q.workspaceId, { userId: await userIdByName(q.workspaceId, q.createdBy), kind: "quote", text: `${q.customerName} từ chối báo giá ${q.number}${reason ? `: ${reason}` : ""}`, href: `/w/quotes/${q.id}` });
  return ok({ status: "rejected" });
}
