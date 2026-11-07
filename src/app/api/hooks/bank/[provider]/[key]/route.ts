// Webhook công khai nhận giao dịch ngân hàng: POST /api/hooks/bank/{casso|sepay}/{hookKey của workspace}.
// Xác thực bằng khoá bí mật riêng của workspace (Casso: Secure-Token / chữ ký V2; SePay: Authorization: Apikey).
import { handleBankWebhook } from "@/lib/pay/webhook";
import { ok } from "@/lib/http";

type P = { params: Promise<{ provider: string; key: string }> };

export async function POST(req: Request, { params }: P) {
  const { provider, key } = await params;
  return handleBankWebhook(req, provider, key);
}

export async function GET() {
  return ok({ ok: true, hint: "Webhook đối soát đang hoạt động. Nhà cung cấp gửi POST kèm khoá xác thực." });
}
