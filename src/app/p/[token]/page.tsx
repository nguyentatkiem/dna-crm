// Trang thanh toán công khai cho khách: mã VietQR + số tiền còn lại của một đơn. Link ký HMAC, không cần đăng nhập.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { qrDataFor } from "@/lib/pay/qrdata";
import { paySettings } from "@/lib/pay/settings";
import { verifyPayToken } from "@/lib/pay/token";
import { VietQrCard } from "@/components/pay/PaymentQr";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thanh toán đơn hàng", robots: { index: false, follow: false } };

const vnd = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;

export default async function PublicPayPage({ params }: { params: Promise<{ token: string }> }) {
  const id = verifyPayToken((await params).token);
  if (!id) notFound();
  const order = await db.order.findUnique({ where: { id } });
  if (!order) notFound();
  const s = await paySettings(order.workspaceId);
  if (!s.publicPage) notFound();
  const [company, ws, qr] = await Promise.all([getPref<Company>(order.workspaceId, "company", COMPANY_DEFAULT), db.workspace.findUnique({ where: { id: order.workspaceId }, select: { name: true } }), qrDataFor(order)]);
  const shop = company.name || ws?.name || "";
  return (
    <main className="grid min-h-screen place-items-start justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[420px] rounded-xl bg-surface p-6 text-center shadow-card">
        <p className="text-[13px] text-ink-2">{shop}</p>
        <h1 className="mt-1 text-[20px] font-semibold">Thanh toán đơn {order.number}</h1>
        {order.status === "cancelled" ? (
          <p className="mt-4 rounded bg-surface-2 px-3 py-2 text-[14px]">Đơn hàng đã huỷ.</p>
        ) : qr.paid ? (
          <p className="mt-4 rounded bg-success-soft px-3 py-2 text-[14.5px] text-success">Đơn đã được thanh toán đủ {vnd(order.total)}. Cảm ơn quý khách!</p>
        ) : (
          <>
            <p className="mt-2 text-[15px]">
              Số tiền cần thanh toán: <b className="tnum">{vnd(qr.amount)}</b>
            </p>
            <div className="mt-4 flex justify-center">
              <VietQrCard data={qr} size={240} />
            </div>
            <p className="mt-4 text-[13px] text-ink-2">Mở app ngân hàng, chọn quét mã QR. Vui lòng giữ nguyên nội dung chuyển khoản <b className="font-mono text-ink">{qr.payCode}</b> để đơn được xác nhận tự động.</p>
          </>
        )}
        {company.phone && <p className="mt-4 text-[12.5px] text-ink-2">Cần hỗ trợ: {company.phone}</p>}
      </div>
    </main>
  );
}
