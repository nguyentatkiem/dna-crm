import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { LeadIn, clientIp, rateLimit, submitLanding } from "@/lib/marketing/landing";
import { fireRecordEvent } from "@/lib/automation";

/** Form trên landing page: chống spam (bẫy bot + giới hạn theo IP), tạo khách qua Hub nguồn khách. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await db.landingPage.findFirst({ where: { slug, published: true } });
  if (!page) return fail("Trang không tồn tại hoặc đã ngừng", 404);
  if (!rateLimit(`${clientIp(req)}|${slug}`)) return fail("Bạn gửi quá nhiều lần, vui lòng thử lại sau ít phút", 429);
  const p = LeadIn.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Thông tin chưa hợp lệ");
  const started = new Date();
  const r = await submitLanding(page, p.data);
  if (!r.ok) return fail(r.error);
  // Tự động hoá "khách điền form": lấy khách vừa tạo/gộp từ nhật ký nguồn khách của lần gửi này (value = slug trang).
  const ev = await db.leadEvent.findFirst({ where: { workspaceId: page.workspaceId, provider: "landing", createdAt: { gte: started }, recordId: { not: null } }, orderBy: { createdAt: "desc" } });
  if (ev?.recordId) await fireRecordEvent(ev.recordId, { kind: "form_submitted", value: page.slug });
  return ok({ ok: true, thanks: r.thanks }, 201);
}
