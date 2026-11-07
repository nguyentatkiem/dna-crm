// Webhook công khai cập nhật trạng thái vận đơn: POST /api/hooks/ship/{ghn|ghtk|vtp|demo}/{hookKey}?token=<token vận chuyển>.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/pay/providers";
import { parseShipHook, hookToken } from "@/lib/ship/hooks";
import { applyStatus } from "@/lib/ship/service";
import { shipSettings } from "@/lib/ship/settings";

type P = { params: Promise<{ carrier: string; key: string }> };

export async function POST(req: Request, { params }: P) {
  const { carrier, key } = await params;
  const ws = key ? await db.workspace.findUnique({ where: { hookKey: key }, select: { id: true } }) : null;
  if (!ws) return NextResponse.json({ success: false, error: "Không tìm thấy" }, { status: 404 });
  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try {
    body = (req.headers.get("content-type") ?? "").includes("x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(raw)) : raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ success: false, error: "Body không hợp lệ" }, { status: 400 });
  }
  const s = await shipSettings(ws.id);
  if (!s.webhookToken || !safeEqual(hookToken(new URL(req.url), req.headers, body), s.webhookToken)) return NextResponse.json({ success: false, error: "Sai token" }, { status: 401 });
  const u = parseShipHook(carrier, body);
  if (!u) return NextResponse.json({ success: false, error: "Không đọc được trạng thái" }, { status: 400 });
  const sh = await db.shipment.findFirst({ where: { workspaceId: ws.id, trackingCode: u.trackingCode }, orderBy: { createdAt: "desc" } });
  // Vận đơn không có trong CRM: vẫn trả 200 để hãng không gửi lại mãi.
  if (!sh) return NextResponse.json({ success: true, ignored: true });
  const updated = await applyStatus(sh, u.status, u.text, u.at && !Number.isNaN(u.at.getTime()) ? u.at : new Date());
  return NextResponse.json({ success: true, status: updated.status });
}
