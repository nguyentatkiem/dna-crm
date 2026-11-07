"use client";
// Khung "Thanh toán" trên trang đơn: mã VietQR, mã nội dung chuyển khoản, trạng thái tiền về, link gửi khách.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { VietQrCard, type QrCardData } from "./PaymentQr";

type Txn = { id: string; provider: string; externalId: string; amount: number; at: string; status: string };
type Data = QrCardData & { remaining: number; publicPath: string; txns: Txn[]; autoReconcile: boolean; canReconcile: boolean; canSimulate: boolean };

const vnd = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;
const dt = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function OrderPayPanel({ orderId, cancelled }: { orderId: string; cancelled?: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/pay/qr?orderId=${encodeURIComponent(orderId)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Không tải được");
    setD(j);
  }, [orderId]);
  useEffect(() => {
    void load();
  }, [load]);

  const link = d?.publicPath && typeof window !== "undefined" ? `${window.location.origin}${d.publicPath}` : "";
  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast("Không sao chép được", "error");
    }
  }
  async function simulate() {
    if (!d) return;
    setBusy(true);
    const r = await fetch("/api/pay/txns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "simulate", amount: d.remaining, content: `MBVCB.${Date.now() % 1e7}.${d.payCode}.CT tu khach` }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast(j.error ?? "Không giả lập được", "error");
    toast(j.status === "matched" ? "Đã giả lập tiền về và tự ghép vào đơn" : "Đã tạo giao dịch giả lập nhưng chưa ghép được");
    // Trang đơn giữ số đã thu trong state: tải lại để mọi khung cùng cập nhật.
    window.location.reload();
  }

  if (err) return <section className="card p-4 text-[13px] text-ink-2">{err}</section>;
  if (!d) return <section className="card h-40 animate-pulse p-4" aria-label="Đang tải thanh toán" />;
  const msg = `Anh/chị vui lòng chuyển khoản ${vnd(d.remaining)} tới ${d.bank} – STK ${d.accountNo}${d.accountName ? ` (${d.accountName})` : ""}, nội dung: ${d.payCode}${link ? `\nHoặc quét mã QR tại: ${link}` : ""}`;

  return (
    <section className="card grid gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">Thanh toán</h2>
        {d.paid ? <span className="badge-success">Đã thu đủ</span> : cancelled ? <span className="badge">Đơn huỷ</span> : <span className="badge-warning">Còn {vnd(d.remaining)}</span>}
      </div>
      {!d.configured ? (
        <p className="text-[13px] text-ink-2">
          Chưa cài tài khoản nhận tiền.{" "}
          <Link href="/w/settings/payments" className="text-primary hover:underline">
            Cài VietQR
          </Link>
        </p>
      ) : d.paid || cancelled ? (
        <p className="text-[13px] text-ink-2">
          Mã nội dung chuyển khoản: <b className="font-mono text-ink">{d.payCode}</b>
        </p>
      ) : (
        <>
          <div className="flex justify-center">
            <VietQrCard data={d} size={180} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline h-8 flex-1 justify-center text-[13px]" onClick={() => copy(msg, "Đã sao chép lời nhắn chuyển khoản")}>
              <Icon name="copy" size={14} /> Chép lời nhắn
            </button>
            {link && (
              <button type="button" className="btn-outline h-8 flex-1 justify-center text-[13px]" onClick={() => copy(link, "Đã sao chép link thanh toán")}>
                <Icon name="link" size={14} /> Link cho khách
              </button>
            )}
          </div>
          <p className="text-[12px] text-ink-2">
            {d.autoReconcile ? "Tiền về đúng nội dung sẽ tự ghi phiếu thu." : "Chưa bật tự đối soát (Casso/SePay): ghi phiếu thu tay khi tiền về."}
          </p>
          {d.canSimulate && (
            <button type="button" className="btn-ghost h-8 justify-center text-[12.5px] text-ink-2" disabled={busy} onClick={simulate} title="Chỉ có ở môi trường thử nghiệm">
              <Icon name="bolt" size={13} /> Giả lập khách chuyển khoản (thử nghiệm)
            </button>
          )}
        </>
      )}
      {d.txns.length > 0 && (
        <div className="grid gap-1 border-t border-line-soft pt-2">
          <p className="label">Giao dịch ngân hàng</p>
          {d.txns.map((t) => (
            <p key={t.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="font-semibold tnum">{vnd(t.amount)}</span>
              <span className="text-ink-2">
                {t.provider.toUpperCase()} · {dt(t.at)}
              </span>
            </p>
          ))}
          {d.canReconcile && (
            <Link href="/w/payments" className="text-[12.5px] text-primary hover:underline">
              Mở trang đối soát
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
