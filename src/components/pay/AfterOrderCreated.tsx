"use client";
// Sau khi tạo đơn trong Hộp thư: gợi ý "Gửi mã QR cho khách" (nhắn thông tin chuyển khoản + link QR) và "Tạo vận đơn ngay".
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { VietQrCard, type QrCardData } from "./PaymentQr";

type Qr = QrCardData & { remaining: number; publicPath: string };
const vnd = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;

export function payMessage(d: Qr, origin: string) {
  const link = d.publicPath ? `${origin}${d.publicPath}` : "";
  return `Dạ đơn ${d.orderNumber} của anh/chị: ${vnd(d.amount)}.\nAnh/chị chuyển khoản giúp em tới ${d.bank} – STK ${d.accountNo}${d.accountName ? ` (${d.accountName})` : ""}\nNội dung: ${d.payCode}${link ? `\nQuét mã QR tại: ${link}` : ""}\nEm cảm ơn ạ!`;
}

export function AfterOrderCreated({ order, convId, canSend }: { order: { id: string; number: string; total: number }; convId: string; canSend: boolean }) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    fetch(`/api/pay/qr?orderId=${encodeURIComponent(order.id)}`)
      .then((r) => r.json())
      .then((j: Qr & { error?: string }) => {
        if (!j?.payCode) return setLoadError(j?.error || "Không tải được thông tin chuyển khoản. Mở đơn hàng để gửi mã QR.");
        setQr(j);
        setText(payMessage(j, window.location.origin));
      })
      .catch(() => setLoadError("Mất kết nối, chưa tải được thông tin chuyển khoản. Mở đơn hàng để gửi mã QR."));
  }, [order.id]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch(`/api/inbox/${convId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || j.ok === false) return toast(j.error ?? "Chưa gửi được tin", "error");
    setSent(true);
    toast("Đã gửi thông tin chuyển khoản cho khách");
  }

  return (
    <div className="grid gap-3 px-5 py-4">
      <p className="rounded bg-success-soft px-3 py-2 text-[13.5px] text-success">
        Đã tạo đơn <b>{order.number}</b> · {vnd(order.total)}
      </p>
      <div className="grid gap-2 rounded border border-line-soft p-3">
        <p className="flex items-center gap-2 font-medium">
          <Icon name="wallet" size={15} /> Gửi mã QR cho khách
        </p>
        {!qr ? (
          <p className={`text-[12.5px] ${loadError ? "text-danger" : "text-ink-2"}`}>{loadError || "Đang chuẩn bị…"}</p>
        ) : !qr.configured ? (
          <p className="text-[12.5px] text-ink-2">Chưa cài tài khoản nhận tiền (Cài đặt → Thanh toán & giao hàng).</p>
        ) : (
          <>
            <textarea className="textarea text-[13px]" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Tin nhắn thông tin chuyển khoản" maxLength={2000} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" disabled={busy || sent || !canSend} onClick={send}>
                <Icon name="send" size={14} /> {sent ? "Đã gửi" : "Gửi cho khách"}
              </button>
              <button type="button" className="btn-ghost text-[13px]" onClick={() => setShowQr((v) => !v)}>
                {showQr ? "Ẩn mã QR" : "Xem mã QR"}
              </button>
            </div>
            {!canSend && <p className="text-[12px] text-ink-2">Hội thoại bình luận: hãy dùng “Nhắn riêng” để gửi thông tin chuyển khoản.</p>}
            {showQr && (
              <div className="flex justify-center">
                <VietQrCard data={qr} size={180} />
              </div>
            )}
          </>
        )}
      </div>
      <a href={`/w/orders/${order.id}?ship=1`} target="_blank" rel="noreferrer" className="btn-outline justify-center">
        <Icon name="box" size={15} /> Tạo vận đơn ngay
      </a>
      <a href={`/w/orders/${order.id}`} target="_blank" rel="noreferrer" className="text-center text-[13px] text-primary hover:underline">
        Mở đơn hàng
      </a>
    </div>
  );
}
