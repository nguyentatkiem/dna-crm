"use client";
// Khung "Hoá đơn điện tử" trên trang đơn: thông tin người mua, Xuất hoá đơn, xem/in, ghi số (chế độ xuất file), huỷ.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";

type Buyer = { name: string; company: string; taxCode: string; address: string; email: string; phone: string };
type Inv = { id: string; provider: string; providerLabel: string; status: string; series: string; number: string; lookupCode: string; pdfUrl: string; total: number; error: string; issuedAt: string | null; createdAt: string; createdBy: string; note: string };
type Data = { items: Inv[]; buyer: Buyer; provider: { key: string; label: string; mode: "simulated" | "export" | "api"; series: string }; canIssue: boolean };

export const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Chờ phát hành", cls: "badge-warning" },
  issued: { label: "Đã phát hành", cls: "badge-success" },
  failed: { label: "Lỗi", cls: "badge-danger" },
  cancelled: { label: "Đã huỷ", cls: "badge" },
};
const vnd = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;

const FIELDS: { key: keyof Buyer; label: string; span?: boolean; type?: string }[] = [
  { key: "name", label: "Người mua hàng" },
  { key: "taxCode", label: "Mã số thuế" },
  { key: "company", label: "Tên đơn vị", span: true },
  { key: "address", label: "Địa chỉ", span: true },
  { key: "email", label: "Email nhận hoá đơn", type: "email" },
  { key: "phone", label: "Điện thoại", type: "tel" },
];

export function EInvoicePanel({ orderId, cancelled }: { orderId: string; cancelled?: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [num, setNum] = useState<{ id: string; series: string; number: string; lookupCode: string } | null>(null);
  const [cancelId, setCancelId] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/einvoice?orderId=${encodeURIComponent(orderId)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Không tải được");
    setD(j);
    setBuyer((b) => b ?? j.buyer);
  }, [orderId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, body: unknown, done: string) {
    setBusy(true);
    setErr("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Không thực hiện được");
      return false;
    }
    toast(done);
    await load();
    return true;
  }

  if (!d || !buyer) return <section className="card h-24 animate-pulse p-4" aria-label="Đang tải hoá đơn" />;
  const active = d.items.find((i) => i.status === "issued" || i.status === "draft");
  const demo = d.provider.mode === "simulated";

  return (
    <section className="card grid gap-3 p-4">
      <div>
        <h2 className="section-title">Hoá đơn điện tử</h2>
        <p className="mt-0.5 text-[12px] text-ink-2">{d.provider.label}</p>
      </div>
      {d.items.length > 0 && (
        <ul className="grid gap-2">
          {d.items.map((i) => (
            <li key={i.id} className="grid gap-1 rounded border border-line-soft p-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className={INV_STATUS[i.status]?.cls ?? "badge"}>{INV_STATUS[i.status]?.label ?? i.status}</span>
                <b className="font-mono">
                  {i.series}
                  {i.number ? `-${i.number}` : ""}
                </b>
                <span className="tnum text-ink-2">{vnd(i.total)}</span>
                {i.provider === "demo" && <span className="badge-accent">Demo</span>}
              </div>
              {i.lookupCode && <span className="text-[12px] text-ink-2">Mã tra cứu: {i.lookupCode}</span>}
              {i.note && <span className="text-[12px] text-ink-2">{i.note}</span>}
              {i.error && i.status !== "cancelled" && <span className="text-[12px] text-danger">{i.error}</span>}
              <div className="flex flex-wrap gap-1.5">
                <a className="btn-outline h-7 text-[12.5px]" href={`/api/einvoice/${i.id}/view`} target="_blank" rel="noreferrer">
                  <Icon name="eye" size={13} /> Xem / In
                </a>
                {i.provider !== "demo" && i.status !== "cancelled" && d.canIssue && (
                  <a className="btn-outline h-7 text-[12.5px]" href={`/api/einvoice/${i.id}/export`}>
                    <Icon name="download" size={13} /> File nhập {i.providerLabel}
                  </a>
                )}
                {i.status === "draft" && i.provider !== "demo" && d.canIssue && (
                  <button type="button" className="btn-outline h-7 text-[12.5px]" onClick={() => setNum({ id: i.id, series: i.series, number: "", lookupCode: "" })}>
                    <Icon name="edit" size={13} /> Ghi số đã phát hành
                  </button>
                )}
                {(i.status === "issued" || i.status === "draft") && d.canIssue && (
                  <button type="button" className="btn-ghost h-7 text-[12.5px] text-danger" onClick={() => setCancelId(i.id)}>
                    Huỷ
                  </button>
                )}
              </div>
              {num?.id === i.id && (
                <div className="grid grid-cols-3 gap-1.5">
                  <input className="input h-8" placeholder="Ký hiệu" value={num.series} onChange={(e) => setNum({ ...num, series: e.target.value.toUpperCase() })} aria-label="Ký hiệu" />
                  <input className="input h-8 tnum" placeholder="Số HĐ" inputMode="numeric" value={num.number} onChange={(e) => setNum({ ...num, number: e.target.value })} aria-label="Số hoá đơn" />
                  <input className="input h-8" placeholder="Mã tra cứu" value={num.lookupCode} onChange={(e) => setNum({ ...num, lookupCode: e.target.value })} aria-label="Mã tra cứu" />
                  <button type="button" className="btn-primary col-span-2 h-8 justify-center" disabled={busy || !num.number} onClick={async () => (await call(`/api/einvoice/${i.id}`, "PATCH", { action: "number", ...num }, "Đã ghi số hoá đơn")) && setNum(null)}>
                    Lưu
                  </button>
                  <button type="button" className="btn-ghost h-8" onClick={() => setNum(null)}>
                    Thôi
                  </button>
                </div>
              )}
              {cancelId === i.id && (
                <div className="grid gap-1.5">
                  <input className="input h-8" placeholder="Lý do huỷ" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lý do huỷ" maxLength={300} />
                  {i.provider !== "demo" && <p className="text-[12px] text-warning">CRM chỉ đánh dấu đã huỷ. Hoá đơn thật cần huỷ / lập biên bản trên phần mềm {i.providerLabel}.</p>}
                  <div className="flex gap-1.5">
                    <button type="button" className="btn h-8 bg-[#df2f4a] text-white" disabled={busy} onClick={async () => (await call(`/api/einvoice/${i.id}`, "PATCH", { action: "cancel", reason }, "Đã huỷ hoá đơn")) && setCancelId("")}>
                      Xác nhận huỷ
                    </button>
                    <button type="button" className="btn-ghost h-8" onClick={() => setCancelId("")}>
                      Thôi
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!active && !cancelled && d.canIssue && (
        <>
          {!open ? (
            <button type="button" className="btn-outline justify-center" onClick={() => setOpen(true)}>
              <Icon name="receipt" size={15} /> Xuất hoá đơn
            </button>
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className={`grid gap-0.5 ${f.span ? "col-span-2" : ""}`}>
                    <span className="label">{f.label}</span>
                    <input className="input h-8" type={f.type ?? "text"} value={buyer[f.key]} onChange={(e) => setBuyer({ ...buyer, [f.key]: e.target.value })} />
                  </label>
                ))}
              </div>
              <p className="text-[12px] text-ink-2">
                {demo ? "Chế độ Demo: tạo hoá đơn mô phỏng để xem mẫu, KHÔNG gửi cơ quan thuế." : `CRM chuẩn bị bản nháp và file Excel để nhập vào ${d.provider.label}; phát hành trên phần mềm đó rồi ghi lại số hoá đơn.`}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-primary flex-1 justify-center" disabled={busy} onClick={async () => (await call("/api/einvoice", "POST", { orderId, buyer }, demo ? "Đã tạo hoá đơn demo" : "Đã tạo bản nháp hoá đơn")) && setOpen(false)}>
                  {demo ? "Xuất hoá đơn demo" : "Tạo bản nháp & file nhập"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Thôi
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!d.items.length && !d.canIssue && <p className="text-[13px] text-ink-2">Chưa có hoá đơn.</p>}
      {err && (
        <p role="alert" className="rounded bg-danger-soft px-2 py-1.5 text-[12.5px] text-danger">
          {err}
        </p>
      )}
    </section>
  );
}
