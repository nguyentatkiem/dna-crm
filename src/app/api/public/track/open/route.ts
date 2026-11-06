import { db } from "@/lib/db";
import { trackOnce } from "@/lib/marketing/broadcast";
import { fireRecordEvent } from "@/lib/automation";
import { verify } from "@/lib/marketing/tokens";

// Ảnh GIF trong suốt 1x1.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Pixel mở email: chữ ký đúng thì ghi nhận một lần cho mỗi người nhận. Luôn trả ảnh, không lộ lỗi. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const b = q.get("b") ?? "";
  const r = q.get("r") ?? "";
  if (b && r && verify("open", `${b}|${r}`, q.get("s") ?? "")) {
    // Lần mở đầu tiên của đợt này → tự động hoá "khách mở email" (count = tổng số lần mở mọi đợt).
    if (await trackOnce("open", b, r).catch(() => false)) {
      const count = await db.activity.count({ where: { recordId: r, kind: "email_open" } });
      await fireRecordEvent(r, { kind: "email_engaged", value: "open", count });
    }
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
