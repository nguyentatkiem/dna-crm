// Xử lý webhook giao dịch ngân hàng (Casso, SePay) dùng chung cho route công khai.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseCasso, parseSepay, verifyCasso, verifySepay } from "./providers";
import { receiveTxns } from "./reconcile";
import { markWebhook, paySettings } from "./settings";

export const BANK_PROVIDERS = ["casso", "sepay"] as const;
export type BankProvider = (typeof BANK_PROVIDERS)[number];

export async function handleBankWebhook(req: Request, provider: string, key: string) {
  if (!BANK_PROVIDERS.includes(provider as BankProvider)) return NextResponse.json({ success: false, error: "Không hỗ trợ" }, { status: 404 });
  const ws = key ? await db.workspace.findUnique({ where: { hookKey: key }, select: { id: true } }) : null;
  if (!ws) return NextResponse.json({ success: false, error: "Không tìm thấy" }, { status: 404 });
  const raw = await req.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ success: false, error: "Body không phải JSON" }, { status: 400 });
  }
  const s = await paySettings(ws.id);
  const okAuth = provider === "casso" ? verifyCasso(req.headers, body, s.cassoSecret) : verifySepay(req.headers, s.sepayKey);
  if (!okAuth) {
    await markWebhook(ws.id, provider, "sai khoá bí mật / chữ ký").catch(() => undefined);
    return NextResponse.json({ success: false, error: "Sai khoá xác thực" }, { status: 401 });
  }
  const list = provider === "casso" ? parseCasso(body) : parseSepay(body);
  try {
    const result = await receiveTxns(ws.id, list);
    await markWebhook(ws.id, provider);
    // SePay coi {success:true} + HTTP 200/201 là đã nhận; Casso chỉ cần HTTP 2xx.
    return NextResponse.json({ success: true, error: 0, received: result.length, result });
  } catch (e) {
    console.error("[pay] webhook", e instanceof Error ? e.message : e);
    await markWebhook(ws.id, provider, "lỗi xử lý").catch(() => undefined);
    return NextResponse.json({ success: false, error: "Lỗi xử lý, nhà cung cấp sẽ gửi lại" }, { status: 500 });
  }
}
