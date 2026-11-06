import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackOnce } from "@/lib/marketing/broadcast";
import { fireRecordEvent } from "@/lib/automation";
import { isAllowedClick, verify } from "@/lib/marketing/tokens";

/**
 * Link theo dõi nhấp: chỉ chuyển hướng khi chữ ký đúng VÀ link http(s) có trong nội dung gốc của đợt gửi,
 * nên không ai dùng được đường này để chuyển người khác sang trang lạ.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const b = q.get("b") ?? "";
  const r = q.get("r") ?? "";
  const u = q.get("u") ?? "";
  const bad = () => new Response("Link không hợp lệ hoặc đã hết hạn.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!b || !r || !u || !verify("click", `${b}|${r}|${u}`, q.get("s") ?? "")) return bad();
  const bc = await db.broadcast.findUnique({ where: { id: b }, select: { body: true } });
  if (!bc || !isAllowedClick(bc.body, u)) return bad();
  if (await trackOnce("click", b, r).catch(() => false)) {
    const count = await db.activity.count({ where: { recordId: r, kind: "email_click" } });
    await fireRecordEvent(r, { kind: "email_engaged", value: "click", count });
  }
  return NextResponse.redirect(u, 302);
}
