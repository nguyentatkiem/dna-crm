"use client";
// HỢP ĐỒNG (nhóm Thanh toán hiện thực): mã VietQR cho một đơn. Mẫu in và trang đơn dùng chung.
// <PaymentQr orderId amount? size? showInfo? />: tự gọi /api/pay/qr (cần đăng nhập). Trang công khai dùng <VietQrCard data/> với dữ liệu server.
import { useEffect, useMemo, useState } from "react";
import { encodeQr, qrPath } from "@/lib/pay/qr";

export type QrCardData = { configured: boolean; payload: string; bank: string; accountNo: string; accountName: string; amount: number; payCode: string; orderNumber: string; paid?: boolean };

/** Vẽ mã QR từ chuỗi payload (SVG thuần, sắc nét khi in). */
export function QrSvg({ payload, size = 200, title = "Mã QR chuyển khoản" }: { payload: string; size?: number; title?: string }) {
  const q = useMemo(() => {
    try {
      return encodeQr(payload);
    } catch {
      return null;
    }
  }, [payload]);
  if (!q) return null;
  const dim = q.size + 8;
  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={title} style={{ background: "#fff", borderRadius: 6 }}>
      <rect width={dim} height={dim} fill="#fff" />
      <path d={qrPath(q, 4)} fill="#000" />
    </svg>
  );
}

const vnd = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;

/** Thẻ QR + thông tin chuyển khoản. Dùng được cả nơi không đăng nhập (dữ liệu truyền vào). */
export function VietQrCard({ data, size = 200, showInfo = true }: { data: QrCardData; size?: number; showInfo?: boolean }) {
  if (!data.configured || !data.payload) {
    return <p className="text-[12.5px] text-ink-2">Chưa cài tài khoản nhận tiền để tạo mã QR.</p>;
  }
  return (
    <div className="pay-qr inline-grid justify-items-center gap-1.5 text-center" style={{ color: "inherit" }}>
      <QrSvg payload={data.payload} size={size} title={`Mã VietQR chuyển khoản ${data.payCode}`} />
      {showInfo && (
        <div className="grid gap-0.5 text-[12.5px] leading-snug">
          <span>
            <b>{data.bank}</b> · <span className="tnum">{data.accountNo}</span>
          </span>
          {data.accountName && <span className="uppercase">{data.accountName}</span>}
          {data.amount > 0 && (
            <span>
              Số tiền: <b className="tnum">{vnd(data.amount)}</b>
            </span>
          )}
          <span>
            Nội dung: <b className="font-mono tracking-wide">{data.payCode}</b>
          </span>
        </div>
      )}
    </div>
  );
}

export function PaymentQr({ orderId, amount, size = 200, showInfo = true }: { orderId: string; amount?: number; size?: number; showInfo?: boolean }) {
  const [data, setData] = useState<QrCardData | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ orderId, ...(amount ? { amount: String(Math.round(amount)) } : {}) });
    fetch(`/api/pay/qr?${q}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setErr(j.error ?? "Không tạo được mã QR");
        else setData(j);
      })
      .catch(() => live && setErr("Không tạo được mã QR"));
    return () => {
      live = false;
    };
  }, [orderId, amount]);
  if (err) return <p className="text-[12.5px] text-ink-2">{err}</p>;
  if (!data) return <div style={{ width: size, height: size }} className="animate-pulse rounded bg-surface-2" aria-label="Đang tạo mã QR" />;
  return <VietQrCard data={data} size={size} showInfo={showInfo} />;
}
