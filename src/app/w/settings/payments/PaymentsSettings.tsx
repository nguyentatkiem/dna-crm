"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Tabs, toast } from "@/components/ui";
import { QrSvg } from "@/components/pay/PaymentQr";
import type { Bank } from "@/lib/pay/banks";
import { buildVietQR } from "@/lib/pay/vietqr";

type Pay = { bankBin: string; accountNo: string; accountName: string; payCodePrefix: string; cassoSecret: string; sepayKey: string; tolerance: number; publicPage: boolean; hasCasso: boolean; hasSepay: boolean };
type Einv = { provider: string; templateNo: string; series: string; payMethod: string };
type Addr = { name: string; phone: string; address: string; province: string; district: string; ward: string };
type Ship = {
  defaultCarrier: string;
  autoDone: boolean;
  autoShipping: boolean;
  defaultWeight: number;
  from: Addr;
  webhookToken: string;
  hasWebhookToken: boolean;
  ghn: { token: string; shopId: string; env: string; serviceTypeId: number; requiredNote: string; paymentTypeId: number };
  ghtk: { token: string; env: string; transport: string; clientSource: string };
  vtp: { username: string; password: string; token: string; service: string; orderPayment: number; groupAddressId: string; cusId: string; createPath: string; pricePath: string };
};
type View = { pay: Pay; einvoice: Einv; ship: Ship; status: { lastWebhookAt?: string; lastProvider?: string; lastError?: string; lastErrorAt?: string; received?: number }; hooks: { casso: string; sepay: string; ship: Record<string, string> }; dryRun: boolean; revealed?: string | null };

const when = (s?: string) => (s ? new Date(s).toLocaleString("vi-VN") : "chưa có");

function Field({ label, hint, children, span }: { label: string; hint?: string; children: React.ReactNode; span?: boolean }) {
  return (
    <label className={`grid content-start gap-1 ${span ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-ink-2">{hint}</span>}
    </label>
  );
}

function CopyLine({ value }: { value: string }) {
  return (
    <div className="flex gap-1">
      <input className="input h-8 font-mono text-[12px]" readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn-outline h-8 flex-none px-2" aria-label="Sao chép" onClick={() => navigator.clipboard.writeText(value).then(() => toast("Đã sao chép"))}>
        <Icon name="copy" size={14} />
      </button>
    </div>
  );
}

export function PaymentsSettings({ banks }: { banks: Bank[] }) {
  const [v, setV] = useState<View | null>(null);
  const [tab, setTab] = useState("bank");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [revealed, setRevealed] = useState<{ what: string; value: string } | null>(null);

  useEffect(() => {
    fetch("/api/pay/settings")
      .then((r) => r.json().then((j) => (r.ok ? setV(j) : setErr(j.error ?? "Không tải được"))))
      .catch(() => setErr("Không tải được"));
  }, []);

  const preview = useMemo(() => {
    if (!v?.pay.bankBin || !v.pay.accountNo) return "";
    try {
      return buildVietQR({ bin: v.pay.bankBin, accountNo: v.pay.accountNo, amount: 100000, addInfo: `${v.pay.payCodePrefix}20260001` });
    } catch {
      return "";
    }
  }, [v?.pay.bankBin, v?.pay.accountNo, v?.pay.payCodePrefix]);

  async function save(body: Record<string, unknown>, done = "Đã lưu", what = "") {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/pay/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    setV(j);
    if (j.revealed) setRevealed({ what, value: j.revealed });
    toast(done);
  }

  if (err && !v) return <p className="mt-6 text-danger">{err}</p>;
  if (!v) return <div className="card mt-5 h-60 animate-pulse" />;
  const setPay = (p: Partial<Pay>) => setV({ ...v, pay: { ...v.pay, ...p } });
  const setInv = (p: Partial<Einv>) => setV({ ...v, einvoice: { ...v.einvoice, ...p } });
  const setShip = (p: Partial<Ship>) => setV({ ...v, ship: { ...v.ship, ...p } });
  const setFrom = (p: Partial<Addr>) => setShip({ from: { ...v.ship.from, ...p } });
  const sub = <K extends "ghn" | "ghtk" | "vtp">(k: K, p: Partial<Ship[K]>) => setShip({ [k]: { ...v.ship[k], ...p } } as Partial<Ship>);

  return (
    <div className="mt-5 grid max-w-4xl gap-4">
      {v.dryRun && <p className="rounded bg-warning-soft px-3 py-2 text-[13px] text-warning">Đang chạy khô (PAY_DRY_RUN=1): không gọi API thật của hãng vận chuyển.</p>}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "bank", label: "Tài khoản & VietQR" },
          { key: "recon", label: "Tự đối soát" },
          { key: "einvoice", label: "Hoá đơn điện tử" },
          { key: "ship", label: "Vận chuyển" },
        ]}
      />
      {revealed && (
        <div className="rounded border border-primary bg-surface p-3 text-[13px]">
          <p className="font-medium">Khoá {revealed.what} mới – chỉ hiện một lần, hãy dán vào nhà cung cấp ngay:</p>
          <div className="mt-1.5">
            <CopyLine value={revealed.value} />
          </div>
          <button type="button" className="btn-ghost mt-1 h-7 text-[12.5px]" onClick={() => setRevealed(null)}>
            Đã lưu khoá, ẩn đi
          </button>
        </div>
      )}

      {tab === "bank" && (
        <section className="card grid gap-4 p-5 sm:grid-cols-[1fr_200px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngân hàng" span>
              <select className="input" value={v.pay.bankBin} onChange={(e) => setPay({ bankBin: e.target.value })}>
                <option value="">— Chọn ngân hàng —</option>
                {banks.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.short} – {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số tài khoản">
              <input className="input tnum" value={v.pay.accountNo} onChange={(e) => setPay({ accountNo: e.target.value })} maxLength={19} />
            </Field>
            <Field label="Tên chủ tài khoản" hint="Viết hoa không dấu như trên app ngân hàng">
              <input className="input uppercase" value={v.pay.accountName} onChange={(e) => setPay({ accountName: e.target.value })} maxLength={60} />
            </Field>
            <Field label="Tiền tố mã nội dung" hint={`Mã chuyển khoản của đơn DH-2026-0004 sẽ là ${v.pay.payCodePrefix || "DH"}20260004`}>
              <input className="input uppercase" value={v.pay.payCodePrefix} onChange={(e) => setPay({ payCodePrefix: e.target.value })} maxLength={6} />
            </Field>
            <Field label="Lệch tiền chấp nhận (₫)" hint="Chuyển thừa trong mức này vẫn coi như đúng">
              <input className="input tnum" type="number" min={0} value={v.pay.tolerance} onChange={(e) => setPay({ tolerance: Number(e.target.value) || 0 })} />
            </Field>
            <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
              <input type="checkbox" checked={v.pay.publicPage} onChange={(e) => setPay({ publicPage: e.target.checked })} /> Cho phép gửi link trang thanh toán (QR) cho khách
            </label>
            <div className="sm:col-span-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => save({ pay: { bankBin: v.pay.bankBin, accountNo: v.pay.accountNo, accountName: v.pay.accountName, payCodePrefix: v.pay.payCodePrefix, tolerance: v.pay.tolerance, publicPage: v.pay.publicPage } })}>
                <Icon name="check" size={15} /> Lưu
              </button>
            </div>
          </div>
          <div className="grid content-start justify-items-center gap-1 text-center text-[12px] text-ink-2">
            {preview ? <QrSvg payload={preview} size={180} /> : <div className="grid h-[180px] w-[180px] place-items-center rounded bg-surface-2">Chưa có QR</div>}
            <span>Xem thử: 100.000 ₫</span>
          </div>
        </section>
      )}

      {tab === "recon" && (
        <section className="card grid gap-4 p-5">
          <p className="text-[13.5px] text-ink-2">
            Kết nối tài khoản ngân hàng với Casso hoặc SePay, rồi tạo webhook trỏ về CRM. Mỗi giao dịch tiền vào có nội dung chứa mã đơn (ví dụ {v.pay.payCodePrefix}20260004) sẽ tự ghi phiếu thu.
          </p>
          <div className="grid gap-2">
            <h3 className="font-semibold">Casso</h3>
            <Field label="URL webhook">
              <CopyLine value={v.hooks.casso} />
            </Field>
            <p className="text-[12.5px] text-ink-2">
              Khoá bí mật: {v.pay.hasCasso ? <b>{v.pay.cassoSecret}</b> : "chưa tạo"}. Dán khoá vào ô “Secure Token” (webhook cũ) hoặc “Khoá chữ ký” (webhook V2) của Casso.
            </p>
            <button type="button" className="btn-outline w-fit" disabled={busy} onClick={() => save({ regen: "casso" }, "Đã tạo khoá Casso", "Casso")}>
              <Icon name="refresh" size={14} /> {v.pay.hasCasso ? "Tạo khoá mới" : "Tạo khoá"}
            </button>
          </div>
          <div className="grid gap-2 border-t border-line-soft pt-4">
            <h3 className="font-semibold">SePay</h3>
            <Field label="URL webhook">
              <CopyLine value={v.hooks.sepay} />
            </Field>
            <p className="text-[12.5px] text-ink-2">
              API key: {v.pay.hasSepay ? <b>{v.pay.sepayKey}</b> : "chưa tạo"}. Khi tạo webhook trên SePay chọn kiểu chứng thực “API Key” và dán khoá này (SePay gửi “Authorization: Apikey …”).
            </p>
            <button type="button" className="btn-outline w-fit" disabled={busy} onClick={() => save({ regen: "sepay" }, "Đã tạo khoá SePay", "SePay")}>
              <Icon name="refresh" size={14} /> {v.pay.hasSepay ? "Tạo khoá mới" : "Tạo khoá"}
            </button>
          </div>
          <p className="border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
            Webhook nhận gần nhất: <b>{when(v.status.lastWebhookAt)}</b>
            {v.status.lastProvider ? ` (${v.status.lastProvider})` : ""} · tổng {v.status.received ?? 0} lần
            {v.status.lastError && (
              <>
                <br />
                <span className="text-danger">
                  Lỗi gần nhất: {v.status.lastError} lúc {when(v.status.lastErrorAt)}
                </span>
              </>
            )}
          </p>
        </section>
      )}

      {tab === "einvoice" && (
        <section className="card grid gap-3 p-5 sm:grid-cols-2">
          <Field label="Nhà cung cấp" span hint={v.einvoice.provider === "demo" ? "Demo: tạo hoá đơn mô phỏng để xem mẫu – không có giá trị pháp lý." : "CRM không gọi API của nhà cung cấp: tạo bản nháp + file Excel (cột phổ biến) để kế toán đối chiếu mẫu nhập của phần mềm, nhập vào, phát hành, rồi ghi lại số hoá đơn."}>
            <select className="input" value={v.einvoice.provider} onChange={(e) => setInv({ provider: e.target.value })}>
              <option value="demo">Demo (mô phỏng)</option>
              <option value="misa">MISA meInvoice – xuất file để nhập</option>
              <option value="viettel">Viettel S-Invoice – xuất file để nhập</option>
              <option value="vnpt">VNPT Invoice – xuất file để nhập</option>
            </select>
          </Field>
          <Field label="Mẫu số" hint="1 = Hoá đơn GTGT">
            <input className="input" value={v.einvoice.templateNo} onChange={(e) => setInv({ templateNo: e.target.value })} maxLength={12} />
          </Field>
          <Field label="Ký hiệu" hint="Theo TT78, ví dụ 1C26TAA (đúng ký hiệu đã đăng ký với cơ quan thuế)">
            <input className="input uppercase" value={v.einvoice.series} onChange={(e) => setInv({ series: e.target.value })} maxLength={10} />
          </Field>
          <Field label="Hình thức thanh toán">
            <input className="input" value={v.einvoice.payMethod} onChange={(e) => setInv({ payMethod: e.target.value })} maxLength={40} />
          </Field>
          <p className="text-[12.5px] text-ink-2 sm:col-span-2">Thông tin người bán (tên, MST, địa chỉ) lấy từ Cài đặt → Thông tin doanh nghiệp.</p>
          <div className="sm:col-span-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => save({ einvoice: v.einvoice })}>
              <Icon name="check" size={15} /> Lưu
            </button>
          </div>
        </section>
      )}

      {tab === "ship" && (
        <section className="card grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Hãng mặc định">
              <select className="input" value={v.ship.defaultCarrier} onChange={(e) => setShip({ defaultCarrier: e.target.value })}>
                <option value="demo">Demo (mô phỏng)</option>
                <option value="ghn">Giao Hàng Nhanh</option>
                <option value="ghtk">Giao Hàng Tiết Kiệm</option>
                <option value="vtp">Viettel Post</option>
              </select>
            </Field>
            <Field label="Khối lượng mặc định / sản phẩm (g)" hint="Dùng khi sản phẩm chưa khai báo khối lượng">
              <input className="input tnum" type="number" min={1} value={v.ship.defaultWeight} onChange={(e) => setShip({ defaultWeight: Number(e.target.value) || 1 })} />
            </Field>
            <div className="grid content-start gap-1.5 pt-5 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={v.ship.autoShipping} onChange={(e) => setShip({ autoShipping: e.target.checked })} /> Tạo vận đơn → đơn “Đang giao”
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={v.ship.autoDone} onChange={(e) => setShip({ autoDone: e.target.checked })} /> Hãng báo đã giao → đơn “Hoàn tất”
              </label>
            </div>
          </div>
          <div>
            <h3 className="font-semibold">Địa chỉ lấy hàng</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Field label="Tên người gửi">
                <input className="input" value={v.ship.from.name} onChange={(e) => setFrom({ name: e.target.value })} />
              </Field>
              <Field label="Điện thoại">
                <input className="input tnum" value={v.ship.from.phone} onChange={(e) => setFrom({ phone: e.target.value })} />
              </Field>
              <Field label="Số nhà, đường">
                <input className="input" value={v.ship.from.address} onChange={(e) => setFrom({ address: e.target.value })} />
              </Field>
              <Field label="Phường/Xã">
                <input className="input" value={v.ship.from.ward} onChange={(e) => setFrom({ ward: e.target.value })} />
              </Field>
              <Field label="Quận/Huyện">
                <input className="input" value={v.ship.from.district} onChange={(e) => setFrom({ district: e.target.value })} />
              </Field>
              <Field label="Tỉnh/Thành phố">
                <input className="input" value={v.ship.from.province} onChange={(e) => setFrom({ province: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="grid gap-2 border-t border-line-soft pt-3">
            <h3 className="font-semibold">Giao Hàng Nhanh (GHN)</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Token API">
                <input className="input font-mono" value={v.ship.ghn.token} onChange={(e) => sub("ghn", { token: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="ShopId">
                <input className="input tnum" value={v.ship.ghn.shopId} onChange={(e) => sub("ghn", { shopId: e.target.value })} />
              </Field>
              <Field label="Môi trường">
                <select className="input" value={v.ship.ghn.env} onChange={(e) => sub("ghn", { env: e.target.value })}>
                  <option value="prod">Thật</option>
                  <option value="dev">Thử nghiệm (dev)</option>
                </select>
              </Field>
              <Field label="Mã dịch vụ (service_type_id)" hint="2 = Hàng nhẹ (TMĐT)">
                <input className="input tnum" type="number" value={v.ship.ghn.serviceTypeId} onChange={(e) => sub("ghn", { serviceTypeId: Number(e.target.value) || 2 })} />
              </Field>
              <Field label="Ghi chú bắt buộc">
                <select className="input" value={v.ship.ghn.requiredNote} onChange={(e) => sub("ghn", { requiredNote: e.target.value })}>
                  <option value="KHONGCHOXEMHANG">Không cho xem hàng</option>
                  <option value="CHOXEMHANGKHONGTHU">Cho xem, không cho thử</option>
                  <option value="CHOTHUHANG">Cho thử hàng</option>
                </select>
              </Field>
              <Field label="Bên trả phí ship">
                <select className="input" value={v.ship.ghn.paymentTypeId} onChange={(e) => sub("ghn", { paymentTypeId: Number(e.target.value) })}>
                  <option value={1}>Shop trả</option>
                  <option value={2}>Người nhận trả</option>
                </select>
              </Field>
            </div>
          </div>
          <div className="grid gap-2 border-t border-line-soft pt-3">
            <h3 className="font-semibold">Giao Hàng Tiết Kiệm (GHTK)</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Token API">
                <input className="input font-mono" value={v.ship.ghtk.token} onChange={(e) => sub("ghtk", { token: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Môi trường">
                <select className="input" value={v.ship.ghtk.env} onChange={(e) => sub("ghtk", { env: e.target.value })}>
                  <option value="prod">Thật</option>
                  <option value="staging">Thử nghiệm (staging)</option>
                </select>
              </Field>
              <Field label="Vận chuyển">
                <select className="input" value={v.ship.ghtk.transport} onChange={(e) => sub("ghtk", { transport: e.target.value })}>
                  <option value="road">Đường bộ</option>
                  <option value="fly">Đường bay</option>
                </select>
              </Field>
              <Field label="X-Client-Source (mã đối tác, nếu có)">
                <input className="input" value={v.ship.ghtk.clientSource} onChange={(e) => sub("ghtk", { clientSource: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="grid gap-2 border-t border-line-soft pt-3">
            <h3 className="font-semibold">Viettel Post</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Tên đăng nhập">
                <input className="input" value={v.ship.vtp.username} onChange={(e) => sub("vtp", { username: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Mật khẩu">
                <input className="input" type="password" value={v.ship.vtp.password} onChange={(e) => sub("vtp", { password: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Hoặc token dài hạn">
                <input className="input font-mono" value={v.ship.vtp.token} onChange={(e) => sub("vtp", { token: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Mã dịch vụ" hint="VD: VCN (chuyển phát nhanh)">
                <input className="input" value={v.ship.vtp.service} onChange={(e) => sub("vtp", { service: e.target.value })} />
              </Field>
              <Field label="ORDER_PAYMENT" hint="3 = thu hộ tiền hàng (theo tài liệu VTP của bạn)">
                <input className="input tnum" type="number" value={v.ship.vtp.orderPayment} onChange={(e) => sub("vtp", { orderPayment: Number(e.target.value) || 3 })} />
              </Field>
              <Field label="GROUPADDRESS_ID / CUS_ID">
                <div className="flex gap-1">
                  <input className="input tnum" value={v.ship.vtp.groupAddressId} onChange={(e) => sub("vtp", { groupAddressId: e.target.value })} aria-label="GROUPADDRESS_ID" />
                  <input className="input tnum" value={v.ship.vtp.cusId} onChange={(e) => sub("vtp", { cusId: e.target.value })} aria-label="CUS_ID" />
                </div>
              </Field>
              <Field label="Đường dẫn tạo đơn">
                <input className="input font-mono text-[12px]" value={v.ship.vtp.createPath} onChange={(e) => sub("vtp", { createPath: e.target.value })} />
              </Field>
              <Field label="Đường dẫn báo phí">
                <input className="input font-mono text-[12px]" value={v.ship.vtp.pricePath} onChange={(e) => sub("vtp", { pricePath: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="grid gap-2 border-t border-line-soft pt-3">
            <h3 className="font-semibold">Webhook trạng thái vận đơn</h3>
            <p className="text-[12.5px] text-ink-2">
              Token: {v.ship.hasWebhookToken ? <b>{v.ship.webhookToken}</b> : "chưa tạo"}. Khai báo URL dưới đây (thay &lt;token&gt;) ở trang quản lý của hãng để trạng thái tự cập nhật.
            </p>
            {(["ghn", "ghtk", "vtp"] as const).map((k) => (
              <Field key={k} label={k === "ghn" ? "GHN" : k === "ghtk" ? "GHTK" : "Viettel Post"}>
                <CopyLine value={v.hooks.ship[k]} />
              </Field>
            ))}
            <button type="button" className="btn-outline w-fit" disabled={busy} onClick={() => save({ regen: "ship" }, "Đã tạo token webhook", "webhook vận chuyển")}>
              <Icon name="refresh" size={14} /> {v.ship.hasWebhookToken ? "Tạo token mới" : "Tạo token"}
            </button>
          </div>
          <div>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => save({ ship: v.ship }, "Đã lưu", "webhook vận chuyển")}>
              <Icon name="check" size={15} /> Lưu
            </button>
          </div>
        </section>
      )}
      {err && (
        <p role="alert" className="text-[13.5px] text-danger">
          {err}
        </p>
      )}
    </div>
  );
}
