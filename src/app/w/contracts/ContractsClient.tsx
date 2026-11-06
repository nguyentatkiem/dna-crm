"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Contract } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { Drawer, EmptyState } from "@/components/ui";
import { ContactPicker, DealPicker } from "@/components/sales/Pickers";
import { ContractBadge, DueBadge } from "@/components/sales/Status";
import { CONTRACT_STATUS, CONTRACT_STATUSES, daysLeft, dmy, fold, money, ymd, type ContractStatus, type Ser } from "@/lib/sales/shared";

type C = Ser<Contract>;
type Rec = { id: string; title: string; objectKey: string };
type Ord = { id: string; number: string; customerName: string; total: number; contactId: string | null; recordId: string | null };
type Form = { title: string; contactId: string | null; recordId: string | null; orderId: string | null; customerName: string; value: string; status: ContractStatus; signedAt: string; startAt: string; endAt: string; remindDays: string; fileUrl: string; note: string };

const EMPTY: Form = { title: "", contactId: null, recordId: null, orderId: null, customerName: "", value: "", status: "draft", signedAt: "", startAt: "", endAt: "", remindDays: "30", fileUrl: "", note: "" };
const rank = (c: C) => (c.status === "active" ? (c.endAt ? 0 : 1) : c.status === "draft" ? 2 : 3);
const sortC = (xs: C[]) => [...xs].sort((a, b) => rank(a) - rank(b) || (a.endAt ? Date.parse(a.endAt) : 0) - (b.endAt ? Date.parse(b.endAt) : 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt));

export function ContractsClient({ initial, orders, recs: initialRecs, openId, dealLabel, canDelete, seeAll, me }: { initial: C[]; orders: Ord[]; recs: Rec[]; openId: string; dealLabel: string; canDelete: boolean; seeAll: boolean; me: string }) {
  const [items, setItems] = useState(() => sortC(initial));
  const [recs, setRecs] = useState(initialRecs);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState<{ id?: string; f: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const rec = (id: string | null) => (id ? recs.find((r) => r.id === id) : undefined);

  const shown = useMemo(() => {
    const f = fold(q.trim());
    return items.filter((c) => (!status || c.status === status) && (!f || fold(`${c.number} ${c.title} ${c.customerName}`).includes(f)));
  }, [items, q, status]);
  const soon = items.filter((c) => c.status === "active" && c.endAt && (daysLeft(c.endAt) ?? 99) <= c.remindDays).length;

  const open = (c?: C) => {
    setErr("");
    setConfirmDel(false);
    setEdit(
      c
        ? { id: c.id, f: { title: c.title, contactId: c.contactId, recordId: c.recordId, orderId: c.orderId, customerName: c.customerName, value: String(c.value || ""), status: c.status as ContractStatus, signedAt: ymd(c.signedAt), startAt: ymd(c.startAt), endAt: ymd(c.endAt), remindDays: String(c.remindDays), fileUrl: c.fileUrl, note: c.note } }
        : { f: { ...EMPTY } },
    );
  };
  useEffect(() => {
    const c = openId && initial.find((x) => x.id === openId);
    if (c) open(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setEdit((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));
  const editable = (c?: C) => !c || seeAll || c.createdBy === me;
  const cur = edit?.id ? items.find((x) => x.id === edit.id) : undefined;

  async function save() {
    if (!edit) return;
    setBusy(true);
    setErr("");
    const f = edit.f;
    const body = { ...f, value: Number(f.value.replace(/\D/g, "")) || 0, remindDays: Number(f.remindDays) || 0, signedAt: f.signedAt || null, startAt: f.startAt || null, endAt: f.endAt || null };
    const res = await fetch(edit.id ? `/api/contracts/${edit.id}` : "/api/contracts", { method: edit.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Không lưu được");
    setItems((xs) => sortC(edit.id ? xs.map((x) => (x.id === j.id ? j : x)) : [j, ...xs]));
    setEdit(null);
  }

  async function remove() {
    if (!edit?.id) return;
    setBusy(true);
    const res = await fetch(`/api/contracts/${edit.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Không xoá được");
    setItems((xs) => xs.filter((x) => x.id !== edit.id));
    setEdit(null);
  }

  const f = edit?.f;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">Hợp đồng</h1>
          <p className="mt-1 text-ink-2">{soon ? `${soon} hợp đồng sắp hết hạn cần gia hạn.` : "Theo dõi hiệu lực và nhắc gia hạn tự động."}</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => open()}>
          <Icon name="plus" size={16} /> Thêm hợp đồng
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="relative w-60 max-sm:w-full">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm số, tên, khách" aria-label="Tìm hợp đồng" className="input h-8 pl-8" />
        </label>
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Lọc trạng thái">
          <button type="button" className={`chip flex-none ${!status ? "chip-on" : ""}`} onClick={() => setStatus("")}>
            Tất cả
          </button>
          {CONTRACT_STATUSES.map((s) => (
            <button key={s} type="button" className={`chip flex-none ${status === s ? "chip-on" : ""}`} onClick={() => setStatus(status === s ? "" : s)}>
              {CONTRACT_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card mt-4">
          <EmptyState icon="contract" title={items.length ? "Không có hợp đồng nào khớp" : "Chưa có hợp đồng"} desc="Lưu hợp đồng với ngày hết hạn để CRM nhắc gia hạn trước." action={items.length ? undefined : { label: "Thêm hợp đồng", onClick: () => open() }} />
        </div>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[700px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[13px] text-ink-2">
                <th className="px-3 py-2.5 font-normal">Hợp đồng</th>
                <th className="px-2 py-2.5 font-normal">Khách</th>
                <th className="px-2 py-2.5 font-normal">Trạng thái</th>
                <th className="px-2 py-2.5 font-normal">Hiệu lực</th>
                <th className="px-3 py-2.5 text-right font-normal">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-[var(--row-hover)]">
                  <td className="max-w-[280px] px-3 py-2.5">
                    <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => open(c)}>
                      {c.title}
                    </button>
                    <p className="text-[12px] text-ink-2 tnum">{c.number}</p>
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-2.5">{c.customerName || rec(c.contactId)?.title || "–"}</td>
                  <td className="px-2 py-2.5">
                    <ContractBadge status={c.status} />
                  </td>
                  <td className="px-2 py-2.5 text-[13px]" suppressHydrationWarning>
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="text-ink-2 tnum">{c.startAt || c.endAt ? `${dmy(c.startAt) || "…"} – ${dmy(c.endAt) || "…"}` : "–"}</span>
                      {c.status === "active" && <DueBadge at={c.endAt} warnDays={c.remindDays} />}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tnum">{c.value ? money(c.value) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? cur?.number ?? "Sửa hợp đồng" : "Thêm hợp đồng"}
        subtitle={cur ? `Tạo bởi ${cur.createdBy || "–"}` : undefined}
        width={540}
        footer={
          <>
            {edit?.id && canDelete && (
              <span className="mr-auto">
                {confirmDel ? (
                  <span className="flex items-center gap-1 text-[13px]">
                    Xoá hẳn?
                    <button type="button" className="btn h-8 bg-[#df2f4a] text-white" disabled={busy} onClick={remove}>
                      Xoá
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn-ghost text-[#df2f4a]" onClick={() => setConfirmDel(true)}>
                    <Icon name="trash" size={15} /> Xoá
                  </button>
                )}
              </span>
            )}
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
              Huỷ
            </button>
            {editable(cur) && (
              <button type="button" className="btn-primary" disabled={busy} onClick={save}>
                Lưu
              </button>
            )}
          </>
        }
      >
        {f && (
          <fieldset disabled={!editable(cur)} className="grid gap-3 p-5">
            <label className="grid gap-1">
              <span className="label">Tên hợp đồng *</span>
              <input className="input" value={f.title} onChange={(e) => setF("title", e.target.value)} maxLength={200} placeholder="Ví dụ: Hợp đồng dịch vụ năm 2026" />
            </label>
            <div className="grid gap-1">
              <span className="label">Khách</span>
              {f.contactId ? (
                <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <span className="badge-info">
                    <Icon name="person" size={12} /> {rec(f.contactId)?.title ?? f.customerName}
                  </span>
                  <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setF("contactId", null)}>
                    Bỏ gắn
                  </button>
                </p>
              ) : (
                <ContactPicker
                  onPick={(c) => {
                    setRecs((r) => [...r, { id: c.id, title: c.title, objectKey: "contacts" }]);
                    setEdit((e) => (e ? { ...e, f: { ...e.f, contactId: c.id, customerName: c.title } } : e));
                  }}
                />
              )}
              <input className="input" value={f.customerName} onChange={(e) => setF("customerName", e.target.value)} maxLength={200} placeholder="Tên khách / bên ký" aria-label="Tên khách" />
            </div>
            <div className="grid gap-1">
              <span className="label">{dealLabel}</span>
              {f.recordId ? (
                <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <span className="badge-accent">{rec(f.recordId)?.title ?? "Đã gắn"}</span>
                  <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setF("recordId", null)}>
                    Bỏ gắn
                  </button>
                </p>
              ) : (
                <DealPicker
                  label={dealLabel}
                  onPick={(d) => {
                    setRecs((r) => [...r, { id: d.id, title: d.title, objectKey: "deals" }]);
                    setF("recordId", d.id);
                  }}
                />
              )}
            </div>
            <label className="grid gap-1">
              <span className="label">Đơn hàng</span>
              <select
                className="input"
                value={f.orderId ?? ""}
                onChange={(e) => {
                  const o = orders.find((x) => x.id === e.target.value);
                  setEdit((x) => (x ? { ...x, f: { ...x.f, orderId: o?.id ?? null, value: x.f.value || (o ? String(o.total) : ""), customerName: x.f.customerName || o?.customerName || "", contactId: x.f.contactId ?? o?.contactId ?? null, recordId: x.f.recordId ?? o?.recordId ?? null } } : x));
                }}
              >
                <option value="">Không gắn</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {o.customerName} · {money(o.total)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="label">Giá trị (₫)</span>
                <input className="input tnum" inputMode="numeric" value={f.value ? Number(f.value.replace(/\D/g, "")).toLocaleString("vi-VN") : ""} onChange={(e) => setF("value", e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="grid gap-1">
                <span className="label">Trạng thái</span>
                <select className="input" value={f.status} onChange={(e) => setF("status", e.target.value as ContractStatus)}>
                  {CONTRACT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONTRACT_STATUS[s].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="label">Ngày ký</span>
                <input className="input" type="date" value={f.signedAt} onChange={(e) => setF("signedAt", e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="label">Nhắc trước (ngày)</span>
                <input className="input tnum" inputMode="numeric" value={f.remindDays} onChange={(e) => setF("remindDays", e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="grid gap-1">
                <span className="label">Bắt đầu</span>
                <input className="input" type="date" value={f.startAt} onChange={(e) => setF("startAt", e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="label">Kết thúc</span>
                <input className="input" type="date" value={f.endAt} onChange={(e) => setF("endAt", e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="label">Link file hợp đồng</span>
              <span className="flex gap-2">
                <input className="input min-w-0 flex-1" type="url" value={f.fileUrl} onChange={(e) => setF("fileUrl", e.target.value)} placeholder="https://drive.google.com/…" maxLength={1000} />
                {/^https?:\/\//.test(f.fileUrl) && (
                  <a href={f.fileUrl} target="_blank" rel="noreferrer" className="btn-outline h-9 flex-none" aria-label="Mở file">
                    <Icon name="open" size={15} />
                  </a>
                )}
              </span>
            </label>
            <label className="grid gap-1">
              <span className="label">Ghi chú</span>
              <textarea className="textarea min-h-[70px]" value={f.note} onChange={(e) => setF("note", e.target.value)} maxLength={3000} />
            </label>
            {cur?.orderId && (
              <Link href={`/w/orders/${cur.orderId}`} className="text-[13px] text-primary hover:underline">
                Mở đơn hàng liên quan →
              </Link>
            )}
            {err && (
              <p role="alert" className="text-[13.5px] text-danger">
                {err}
              </p>
            )}
          </fieldset>
        )}
      </Drawer>
    </>
  );
}
