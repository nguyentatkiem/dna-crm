import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { notify, userIdByName } from "@/lib/notify";

type P = { params: Promise<{ token: string }> };
const Body = z.object({ score: z.number().int().min(1).max(5), comment: z.string().max(2000).default("") });

/** Khách chấm điểm hài lòng (công khai, không đăng nhập). Mỗi phiếu chỉ nhận một lần. */
export async function POST(req: Request, { params }: P) {
  const { token } = await params;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Chọn số sao từ 1 đến 5");
  const t = await db.ticket.findUnique({ where: { csatToken: token } });
  if (!t || (t.status !== "resolved" && t.status !== "closed")) return fail("Liên kết khảo sát không còn hiệu lực", 404);
  // Điều kiện csat: null trong cùng câu lệnh để hai lần gửi cùng lúc chỉ một lần được ghi.
  const r = await db.ticket.updateMany({ where: { id: t.id, csat: null }, data: { csat: p.data.score, csatComment: p.data.comment.trim() } });
  if (!r.count) return fail("Bạn đã gửi đánh giá cho yêu cầu này rồi. Cảm ơn bạn!", 409);
  if (t.recordId) await db.activity.create({ data: { recordId: t.recordId, kind: "update", body: `Khách chấm ${p.data.score}/5 sao cho phiếu ${t.number}${p.data.comment.trim() ? `: “${p.data.comment.trim().slice(0, 300)}”` : ""}`, author: "Khảo sát hài lòng" } });
  if (p.data.score <= 3) {
    const userId = await userIdByName(t.workspaceId, t.assignee);
    await notify(t.workspaceId, { userId, kind: "ticket", text: `Khách chấm ${p.data.score}/5 sao cho phiếu ${t.number} “${t.subject}”`, href: `/w/tickets/${t.id}` });
  }
  return ok({ ok: true });
}
