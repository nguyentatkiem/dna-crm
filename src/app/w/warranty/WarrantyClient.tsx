"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Drawer, EmptyState } from "@/components/ui";
import { ContactPicker, type PickedContact } from "@/components/care/ContactPicker";
import { EXPIRING_DAYS, WARRANTY_STATUS_LABEL, WARRANTY_STATUS_TONE, addMonths, daysLeft } from "@/lib/care/shared";
import type { WarrantyDTO } from "@/lib/care/warranty";

type Product = { id: string; name: string; code: string; warrantyMonths: number };
type Counts = { all: number; active: number; claimed: number; expired: number; void: number; expiring: number };
const d = (s: string) => new Date(s).toLocaleDateString("vi-VN");
const today = () => {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export function WarrantyClient({ products, lookupPath, focusId }: { products: Product[]; lookupPath: string; focusId: string }) {
  const [items, setItems] = useState<WarrantyDTO[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [expiring, setExpiring] = useState(false);
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<{ w: WarrantyDTO; action: "claim" | "void" | "reactivate" } | null>(null);
  const [copied, setCopied] = useState(false);

  const seq = useRef(0);
  const load = useCallback(async () => {
    const sp = new URLSearchParams({ status });
    if (q.trim()) sp.set("q", q.trim());
    if (expiring) sp.set("expiring", "1");
    const n = ++seq.current;
    const r = await fetch(`/api/warranty?${sp}`).catch(() => null);
    // Bỏ kết quả về muộn của lần tìm/lọc cũ; lỗi mạng thì giữ danh sách đang hiện thay vì xoá trắng.
    if (n !== seq.current) return;
    if (!r?.ok) return setItems((x) => x ?? []);
    const j = await r.json();
    if (n !== seq.current) return;
    setItems(j.items);
    setCounts(j.counts);
  }, [q, status, expiring]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    if (focusId && items) document.getElementById(`w-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, items]);

  const chips: { key: string; label: string; n?: number }[] = [
    { key: "all", label: "Tất cả", n: counts?.all },
    { key: "active", label: "Còn hạn", n: counts?.active },
    { key: "claimed", label: "Đã yêu cầu", n: counts?.claimed },
    { key: "expired", label: "Hết hạn", n: counts?.expired },
    { key: "void", label: "Đã huỷ", n: counts?.void },
  ];

  return (
    <div className="mt-5 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative max-sm:w-full">
          <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SĐT, serial, tên khách, sản phẩm" aria-label="Tìm phiếu bảo hành" className="input h-8 w-72 pl-8 max-sm:w-full" />
        </label>
        <span className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            title="Link cho khách tự tra cứu bảo hành bằng số điện thoại"
            onClick={async () => {
              await navigator.clipboard?.writeText(`${location.origin}${lookupPath}`).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Icon name={copied ? "check" : "link"} size={15} /> {copied ? "Đã chép link" : "Link tra cứu cho khách"}
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> Phiếu bảo hành
          </button>
        </span>
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {chips.map((c) => (
          <button key={c.key} type="button" className={`chip flex-none ${status === c.key && !expiring ? "chip-on" : ""}`} onClick={() => { setStatus(c.key); setExpiring(false); }}>
            {c.label}
            {c.n != null && <span className="ml-1.5 text-ink-2 tnum">{c.n}</span>}
          </button>
        ))}
        <button type="button" className={`chip flex-none ${expiring ? "chip-on" : ""}`} onClick={() => { setExpiring(!expiring); setStatus("all"); }}>
          <Icon name="clock" size={13} className="mr-1" /> Sắp hết hạn ({EXPIRING_DAYS} ngày)
          {counts && <span className="ml-1.5 text-ink-2 tnum">{counts.expiring}</span>}
        </button>
      </div>

      <div className="card">
        {items === null ? (
          <div className="grid gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="shield" title={q || status !== "all" || expiring ? "Không có phiếu nào khớp" : "Chưa có phiếu bảo hành"} desc="Đặt số tháng bảo hành cho sản phẩm để đơn hàng hoàn tất tự tạo phiếu, hoặc tạo tay cho hàng đã bán." action={{ label: "Tạo phiếu bảo hành", onClick: () => setCreating(true) }} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((w) => {
              const left = daysLeft(w.endAt);
              const soon = w.status === "active" && left <= EXPIRING_DAYS && left >= 0;
              return (
                <li key={w.id} id={`w-${w.id}`} className={`flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 ${w.id === focusId ? "bg-primary-selected" : ""}`}>
                  <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-md bg-surface-2 text-ink-2">
                    <Icon name="shield" size={16} />
                  </span>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium">{w.productName}</span>
                      <Badge tone={WARRANTY_STATUS_TONE[w.status] ?? "neutral"}>{WARRANTY_STATUS_LABEL[w.status] ?? w.status}</Badge>
                      {soon && <Badge tone="warning">Còn {left} ngày</Badge>}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-2">
                      {w.recordId ? (
                        <Link href={`/w/b/contacts?open=${w.recordId}`} className="hover:underline">
                          {w.customerName || "Khách"}
                        </Link>
                      ) : (
                        w.customerName || "Khách lẻ"
                      )}
                      {w.phone && <span className="tnum"> · {w.phone}</span>}
                      {w.serial && <span className="tnum"> · SN {w.serial}</span>}
                    </p>
                    <p className="text-[12.5px] text-ink-2 tnum">
                      {d(w.startAt)} → {d(w.endAt)}
                    </p>
                    {w.note && <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-ink-2">{w.note}</p>}
                  </div>
                  <div className="flex flex-none gap-1.5 max-sm:w-full max-sm:pl-11">
                    {w.status === "active" && (
                      <button type="button" className="btn-outline h-7 text-[13px]" onClick={() => setActing({ w, action: "claim" })}>
                        Ghi nhận bảo hành
                      </button>
                    )}
                    {(w.status === "claimed" || w.status === "void") && (
                      <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setActing({ w, action: "reactivate" })}>
                        Mở lại
                      </button>
                    )}
                    {w.status !== "void" && (
                      <button type="button" className="btn-ghost h-7 text-[13px] text-danger" onClick={() => setActing({ w, action: "void" })}>
                        Huỷ
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CreateDrawer open={creating} products={products} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
      <ActionDrawer acting={acting} onClose={() => setActing(null)} onDone={() => { setActing(null); load(); }} />
    </div>
  );
}

function ActionDrawer({ acting, onClose, onDone }: { acting: { w: WarrantyDTO; action: "claim" | "void" | "reactivate" } | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote("");
    setErr("");
  }, [acting]);
  const title = acting?.action === "claim" ? "Ghi nhận yêu cầu bảo hành" : acting?.action === "void" ? "Huỷ phiếu bảo hành" : "Mở lại phiếu";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!acting) return;
    setBusy(true);
    const r = await fetch(`/api/warranty/${acting.w.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: acting.action, note }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    onDone();
  }
  return (
    <Drawer open={!!acting} onClose={onClose} title={title} subtitle={acting?.w.productName} width={420}>
      <form onSubmit={submit} className="grid gap-3 px-5 py-4">
        <label className="grid gap-1">
          <span className="label">{acting?.action === "claim" ? "Tình trạng lỗi khách báo" : "Ghi chú"}</span>
          <textarea className="textarea min-h-[100px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} required={acting?.action === "claim"} autoFocus />
        </label>
        {err && (
          <p role="alert" className="text-[13px] text-danger">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Đóng
          </button>
          <button type="submit" className={acting?.action === "void" ? "btn bg-danger text-white hover:brightness-95" : "btn-primary"} disabled={busy}>
            {acting?.action === "void" ? "Huỷ phiếu" : "Lưu"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

function CreateDrawer({ open, products, onClose, onCreated }: { open: boolean; products: Product[]; onClose: () => void; onCreated: () => void }) {
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [serial, setSerial] = useState("");
  const [startAt, setStartAt] = useState(today());
  const [months, setMonths] = useState(12);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContact(null);
    setCustomerName("");
    setPhone("");
    setProductId("");
    setProductName("");
    setSerial("");
    setStartAt(today());
    setMonths(12);
    setNote("");
    setErr("");
  }, [open]);

  const end = (() => {
    const [y, m, dd] = startAt.split("-").map(Number);
    return y && months > 0 ? addMonths(new Date(y, m - 1, dd), months).toLocaleDateString("vi-VN") : "";
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/warranty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId: contact?.id ?? null, customerName, phone, productId: productId || null, productName, serial, startAt, months, note }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không tạo được phiếu");
    onCreated();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Phiếu bảo hành mới" width={480}>
      <form onSubmit={submit} className="grid gap-3.5 px-5 py-4">
        <div className="grid gap-1">
          <span className="label">Khách trong CRM</span>
          <ContactPicker value={contact} onChange={(c) => { setContact(c); if (c) { setCustomerName(c.title); setPhone(c.phone); } }} />
        </div>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <label className="grid gap-1">
            <span className="label">Tên khách</span>
            <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} placeholder="Hoặc nhập tay" />
          </label>
          <label className="grid gap-1">
            <span className="label">Số điện thoại</span>
            <input className="input tnum" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="label">Sản phẩm</span>
          {products.length > 0 && (
            <select
              className="input"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                if (p) {
                  setProductName(p.name);
                  if (p.warrantyMonths > 0) setMonths(p.warrantyMonths);
                }
              }}
            >
              <option value="">Nhập tên sản phẩm bên dưới</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ` : ""}
                  {p.name}
                  {p.warrantyMonths ? ` (${p.warrantyMonths} tháng)` : ""}
                </option>
              ))}
            </select>
          )}
          {!productId && <input className="input" value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={200} placeholder="Tên sản phẩm" required />}
        </label>
        <label className="grid gap-1">
          <span className="label">Số serial / IMEI</span>
          <input className="input tnum" value={serial} onChange={(e) => setSerial(e.target.value)} maxLength={80} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="label">Ngày bắt đầu</span>
            <input type="date" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </label>
          <label className="grid gap-1">
            <span className="label">Số tháng</span>
            <input type="number" min={1} max={240} className="input tnum" value={months} onChange={(e) => setMonths(Number(e.target.value))} required />
          </label>
        </div>
        {end && <p className="text-[13px] text-ink-2">Hết hạn ngày {end}</p>}
        <label className="grid gap-1">
          <span className="label">Ghi chú</span>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </label>
        {err && (
          <p role="alert" className="text-[13px] text-danger">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Tạo phiếu
          </button>
        </div>
      </form>
    </Drawer>
  );
}
