import { trackOnce } from "@/lib/marketing/broadcast";
import { verify } from "@/lib/marketing/tokens";

// Ảnh GIF trong suốt 1x1.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Pixel mở email: chữ ký đúng thì ghi nhận một lần cho mỗi người nhận. Luôn trả ảnh, không lộ lỗi. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const b = q.get("b") ?? "";
  const r = q.get("r") ?? "";
  if (b && r && verify("open", `${b}|${r}`, q.get("s") ?? "")) await trackOnce("open", b, r).catch(() => undefined);
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
