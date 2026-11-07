"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Drawer, EmptyState, Segmented, Stat, Tabs, toast } from "@/components/ui";
import { INV_STATUS } from "@/components/einvoice/EInvoicePanel";
import { ShipBadge } from "@/components/ship/ShipPanel";

type OrderRef = { id: string; number: string; customerName: string };
type Txn = { id: string; provider: string; externalId: string; amount: number; content: string; accountNo: string; at: string; status: string; orderId: string | null; order: OrderRef | null; note: string };
type Inv = { id: string; orderId: string; order: OrderRef; provider: string; providerLabel: string; status: string; series: string; number: string; total: number; issuedAt: string | null; createdAt: string; buyer: { name: string; company: string; taxCode: string } };
type Ship = { id: string; orderId: string; order: OrderRef; carrier: string; trackingCode: string; status: string; fee: number; cod: number; updatedAt: string };
type OpenOrder = { id: string; number: string; customerName: string; customerPhone: string; payCode: string; total: number; paid: number; remaining: number };

const vnd = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const TXN_STATUS: Record<string, { label: string; cls: string }> = { matched: { label: "Đã ghép", cls: "badge-success" }, unmatched: { label: "Chờ ghép", cls: "badge-warning" }, ignored: { label: "Bỏ qua", cls: "badge" } };

function BankTab() {
  const [status, setStatus] = useState("unmatched");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ items: Txn[]; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Txn | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/pay/txns?${new URLSearchParams({ status, q })}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Không tải được");
    setData(j);
  }, [status, q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function act(body: object, done: string) {
    setBusy(true);
    const r = await fetch("/api/pay/txns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast(j.error ?? "Không thực hiện được", "error"), false;
    toast(done);
    await load();
    return true;
  }

  const c = data?.counts ?? {};
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Chờ ghép" value={String(c.unmatched ?? 0)} />
        <Stat label="Đã ghép" value={String(c.matched ?? 0)} />
        <Stat label="Bỏ qua" value={String(c.ignored ?? 0)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { key: "unmatched", label: "Chờ ghép" },
            { key: "matched", label: "Đã ghép" },
            { key: "ignored", label: "Bỏ qua" },
            { key: "", label: "Tất cả" },
          ]}
        />
        <input className="input h-9 w-full sm:w-64" placeholder="Tìm nội dung, mã GD, số tiền…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm giao dịch" />
        <Link href="/w/settings/payments" className="btn-ghost ml-auto text-[13px]">
          <Icon name="settings" size={14} /> Cài đặt
        </Link>
      </div>
      {err && <p className="text-danger">{err}</p>}
      {!data ? (
        <div className="card h-40 animate-pulse" />
      ) : data.items.length === 0 ? (
        <EmptyState icon="wallet" title={status === "unmatched" ? "Không có giao dịch chờ ghép" : "Chưa có giao dịch"} desc="Giao dịch tiền vào từ Casso / SePay hiện ở đây. Giao dịch có mã đơn trong nội dung được tự ghép." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
                <th className="px-3 py-2 font-medium">Thời gian</th>
                <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                <th className="px-3 py-2 font-medium">Nội dung</th>
                <th className="px-3 py-2 font-medium">Trạng thái</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id} className="border-b border-line-soft align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 tnum">
                    {dt(t.at)}
                    <div className="text-[11.5px] text-ink-2">
                      {t.provider.toUpperCase()} · {t.externalId}
                    </div>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tnum ${t.amount < 0 ? "text-danger" : ""}`}>{vnd(t.amount)}</td>
                  <td className="max-w-[340px] px-3 py-2">
                    <span className="break-words">{t.content || "—"}</span>
                    {t.note && <div className="text-[12px] text-warning">{t.note}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={TXN_STATUS[t.status]?.cls ?? "badge"}>{TXN_STATUS[t.status]?.label ?? t.status}</span>
                    {t.order && (
                      <Link href={`/w/orders/${t.order.id}`} className="mt-0.5 block text-[12.5px] text-primary hover:underline">
                        {t.order.number}
                      </Link>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {t.status !== "matched" && t.amount > 0 && (
                      <button type="button" className="btn-outline h-7 text-[12.5px]" onClick={() => setPick(t)}>
                        Ghép đơn
                      </button>
                    )}
                    {t.status === "unmatched" && (
                      <button type="button" className="btn-ghost h-7 text-[12.5px]" disabled={busy} onClick={() => act({ action: "ignore", txnId: t.id }, "Đã bỏ qua")}>
                        Bỏ qua
                      </button>
                    )}
                    {t.status === "ignored" && (
                      <button type="button" className="btn-ghost h-7 text-[12.5px]" disabled={busy} onClick={() => act({ action: "restore", txnId: t.id }, "Đã khôi phục")}>
                        Khôi phục
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MatchDrawer txn={pick} onClose={() => setPick(null)} onMatch={async (orderId, amount) => (await act({ action: "match", txnId: pick!.id, orderId, amount }, "Đã ghép và ghi phiếu thu")) && setPick(null)} />
    </div>
  );
}

function MatchDrawer({ txn, onClose, onMatch }: { txn: Txn | null; onClose: () => void; onMatch: (orderId: string, amount?: number) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<OpenOrder[] | null>(null);
  const [sel, setSel] = useState<OpenOrder | null>(null);
  const [amount, setAmount] = useState(0);
  useEffect(() => {
    if (!txn) return;
    setSel(null);
    setQ("");
  }, [txn]);
  useEffect(() => {
    if (!txn) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/pay/orders?q=${encodeURIComponent(q)}`);
      const j = await r.json().catch(() => ({ items: [] }));
      setItems(j.items ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, txn]);
  useEffect(() => {
    if (sel && txn) setAmount(Math.min(txn.amount, sel.remaining));
  }, [sel, txn]);
  return (
    <Drawer
      open={!!txn}
      onClose={onClose}
      title="Ghép giao dịch với đơn"
      subtitle={txn ? `${vnd(txn.amount)} · ${txn.content.slice(0, 60)}` : ""}
      width={480}
      footer={
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[13px] text-ink-2">{sel ? `Ghi phiếu thu ${vnd(amount)} cho ${sel.number}` : "Chọn đơn"}</span>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="btn-primary" disabled={!sel || amount <= 0} onClick={() => sel && onMatch(sel.id, amount)}>
            Ghép
          </button>
        </div>
      }
    >
      <div className="grid gap-3 px-5 py-4">
        <input className="input" autoFocus placeholder="Tìm số đơn, mã chuyển khoản, tên, SĐT…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm đơn" />
        <ul className="grid max-h-[50vh] divide-y divide-line-soft overflow-y-auto rounded border border-line-soft">
          {items === null ? (
            <li className="px-3 py-2 text-[13px] text-ink-2">Đang tải…</li>
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-ink-2">Không có đơn còn nợ khớp.</li>
          ) : (
            items.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setSel(o)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-hover ${sel?.id === o.id ? "bg-primary-soft" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <b>{o.number}</b> · {o.customerName}
                    <span className="block text-[12px] text-ink-2">
                      {o.payCode || "—"} · {o.customerPhone}
                    </span>
                  </span>
                  <span className="text-right tnum">
                    còn {vnd(o.remaining)}
                    <span className="block text-[12px] text-ink-2">/ {vnd(o.total)}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        {sel && txn && (
          <label className="grid gap-1">
            <span className="label">Số tiền ghi vào đơn (₫)</span>
            <input className="input tnum" type="number" min={1} max={txn.amount} value={amount} onChange={(e) => setAmount(Math.min(txn.amount, Math.max(0, Number(e.target.value) || 0)))} />
            {txn.amount > sel.remaining && <span className="text-[12px] text-warning">Khách chuyển nhiều hơn số còn nợ {vnd(txn.amount - sel.remaining)}.</span>}
          </label>
        )}
      </div>
    </Drawer>
  );
}

function InvoicesTab({ invoices, canInvoice, provider }: { invoices: Inv[]; canInvoice: boolean; provider: string }) {
  const [status, setStatus] = useState("");
  const rows = useMemo(() => invoices.filter((i) => !status || i.status === status), [invoices, status]);
  const drafts = invoices.filter((i) => i.status === "draft" && i.provider !== "demo");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { key: "", label: "Tất cả" },
            { key: "issued", label: "Đã phát hành" },
            { key: "draft", label: "Chờ phát hành" },
            { key: "cancelled", label: "Đã huỷ" },
          ]}
        />
        {canInvoice && drafts.length > 0 && provider !== "demo" && (
          <a href={`/api/einvoice/export?provider=${provider}`} className="btn-outline ml-auto">
            <Icon name="download" size={14} /> Tải file nhập {drafts.length} hoá đơn chờ phát hành
          </a>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="receipt" title="Chưa có hoá đơn" desc="Xuất hoá đơn từ trang chi tiết đơn hàng (khung Hoá đơn điện tử)." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
                <th className="px-3 py-2 font-medium">Ký hiệu – Số</th>
                <th className="px-3 py-2 font-medium">Người mua</th>
                <th className="px-3 py-2 font-medium">Đơn</th>
                <th className="px-3 py-2 text-right font-medium">Tổng tiền</th>
                <th className="px-3 py-2 font-medium">Trạng thái</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-line-soft last:border-0">
                  <td className="px-3 py-2 font-mono">
                    {i.series}
                    {i.number ? `-${i.number}` : ""}
                    <div className="font-sans text-[11.5px] text-ink-2">
                      {i.providerLabel} · {dt(i.issuedAt ?? i.createdAt)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {i.buyer.company || i.buyer.name}
                    {i.buyer.taxCode && <div className="text-[12px] text-ink-2">MST {i.buyer.taxCode}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/w/orders/${i.orderId}`} className="text-primary hover:underline">
                      {i.order?.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tnum">{vnd(i.total)}</td>
                  <td className="px-3 py-2">
                    <span className={INV_STATUS[i.status]?.cls ?? "badge"}>{INV_STATUS[i.status]?.label ?? i.status}</span> {i.provider === "demo" && <span className="badge-accent">Demo</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <a href={`/api/einvoice/${i.id}/view`} target="_blank" rel="noreferrer" className="btn-ghost h-7 text-[12.5px]">
                      <Icon name="eye" size={13} /> Xem
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShipsTab({ shipments }: { shipments: Ship[] }) {
  if (!shipments.length) return <EmptyState icon="box" title="Chưa có vận đơn" desc="Tạo vận đơn từ trang chi tiết đơn hàng (khung Vận chuyển) hoặc ngay sau khi tạo đơn trong Hộp thư." />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13.5px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
            <th className="px-3 py-2 font-medium">Mã vận đơn</th>
            <th className="px-3 py-2 font-medium">Đơn</th>
            <th className="px-3 py-2 text-right font-medium">COD</th>
            <th className="px-3 py-2 text-right font-medium">Phí</th>
            <th className="px-3 py-2 font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id} className="border-b border-line-soft last:border-0">
              <td className="px-3 py-2 font-mono">
                {s.trackingCode}
                <div className="font-sans text-[11.5px] text-ink-2">
                  {s.carrier} · {dt(s.updatedAt)}
                </div>
              </td>
              <td className="px-3 py-2">
                <Link href={`/w/orders/${s.orderId}`} className="text-primary hover:underline">
                  {s.order?.number}
                </Link>
                <div className="text-[12px] text-ink-2">{s.order?.customerName}</div>
              </td>
              <td className="px-3 py-2 text-right tnum">{vnd(s.cod)}</td>
              <td className="px-3 py-2 text-right tnum">{vnd(s.fee)}</td>
              <td className="px-3 py-2">
                <ShipBadge status={s.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsClient({ initialTab, canReconcile, canInvoice, einvoiceProvider, invoices, shipments }: { initialTab: string; canReconcile: boolean; canInvoice: boolean; einvoiceProvider: string; invoices: Inv[]; shipments: Ship[] }) {
  const tabs = [...(canReconcile ? [{ key: "bank", label: "Chuyển khoản" }] : []), { key: "invoices", label: "Hoá đơn", count: invoices.length }, { key: "ships", label: "Vận đơn", count: shipments.length }];
  const [tab, setTab] = useState(tabs.some((t) => t.key === initialTab) ? initialTab : tabs[0].key);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-[26px] font-semibold">Đối soát & giao vận</h1>
        <p className="mt-1 text-ink-2">Tiền chuyển khoản về, hoá đơn điện tử đã xuất và vận đơn của các đơn hàng.</p>
      </div>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === "bank" && canReconcile && <BankTab />}
      {tab === "invoices" && <InvoicesTab invoices={invoices} canInvoice={canInvoice} provider={einvoiceProvider} />}
      {tab === "ships" && <ShipsTab shipments={shipments} />}
    </div>
  );
}
