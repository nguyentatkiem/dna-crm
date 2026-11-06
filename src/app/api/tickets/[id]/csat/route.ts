import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { sendMessage } from "@/lib/marketing/messaging";
import { findTicket } from "@/lib/care/server";
import { publicOrigin } from "@/lib/care/tickets";

type P = { params: Promise<{ id: string }> };
const Body = z.object({ channel: z.enum(["zalo", "email", "sms"]) });

/** Gửi link khảo sát hài lòng cho khách qua Zalo/email/SMS. */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = await findTicket(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy phiếu", 404);
  if (t.status !== "resolved" && t.status !== "closed") return fail("Chỉ gửi khảo sát khi phiếu đã xử lý");
  if (!t.recordId) return fail("Phiếu chưa gắn khách");
  if (t.csat != null) return fail("Khách đã đánh giá phiếu này");
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Chọn kênh gửi");
  const url = `${publicOrigin(req)}/csat/${t.csatToken}`;
  const r = await sendMessage(a.ctx.workspace.id, {
    channel: p.data.channel,
    recordId: t.recordId,
    subject: `Đánh giá hỗ trợ ${t.number}`,
    body: `Chào {ten}, yêu cầu “${t.subject}” của bạn đã được xử lý. Bạn dành 10 giây chấm điểm giúp {ten_doanh_nghiep} nhé: ${url}`,
  });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "ticket.csat_send", "ticket", t.id, `Phiếu ${t.number}: gửi khảo sát qua ${p.data.channel}${r.ok ? "" : " (lỗi)"}`);
  return ok({ send: r, url });
}
