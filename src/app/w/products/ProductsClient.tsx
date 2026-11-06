"use client";

import { useMemo, useState } from "react";
import type { Product } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { Drawer, EmptyState } from "@/components/ui";
import { fold, money, type Ser } from "@/lib/sales/shared";
import { toast } from "@/components/ui/Toast";

type Item = Ser<Product>;
type Form = { code: string; name: string; unit: string; category: string; price: string; vat: string; warrantyMonths: string; description: string; active: boolean };
const EMPTY: Form = { code: "", name: "", unit: "cái", category: "", price: "", vat: "0", warrantyMonths: "0", description: "", active: true };

export function ProductsClient({ initial, canEdit, canDelete }: { initial: Item[]; canEdit: boolean; canDelete: boolean }) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [show, setShow] = useState<"all" | "active" | "inactive">("active");
  const [edit, setEdit] = useState<{ id?: string; f: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")), [items]);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return items.filter((p) => (!cat || p.category === cat) && (show === "all" || (show === "active") === p.active) && (!f || fold(`${p.code} ${p.name} ${p.category}`).includes(f)));
  }, [items, q, cat, show]);

  const open = (p?: Item) => {
    setErr("");
    setConfirmDel(false);
    setEdit(p ? { id: p.id, f: { code: p.code, name: p.name, unit: p.unit, category: p.category, price: String(p.price), vat: String(p.vat), warrantyMonths: String(p.warrantyMonths), description: p.description, active: p.active } } : { f: { ...EMPTY } });
  };
  const setF = (k: keyof Form, v: string | boolean) => setEdit((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));

  async function save() {
    if (!edit) return;
    setBusy(true);
    setErr("");
    const f = edit.f;
    const body = { ...f, price: Number(f.price.replace(/\D/g, "")) || 0, vat: Number(f.vat) || 0, warrantyMonths: Number(f.warrantyMonths) || 0 };
    const res = await fetch(edit.id ? `/api/products/${edit.id}` : "/api/products", { method: edit.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Không lưu được");
    setItems((xs) => (edit.id ? xs.map((x) => (x.id === j.id ? j : x)) : [j, ...xs]));
    setEdit(null);
  }

  async function toggle(p: Item) {
    setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    const res = await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) }).catch(() => null);
    if (res?.ok) {
      const j = await res.json();
      setItems((xs) => xs.map((x) => (x.id === j.id ? j : x)));
    } else {
      setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, active: p.active } : x)));
      toast((await res?.json().catch(() => ({})))?.error ?? "Không đổi được trạng thái sản phẩm", "error");
    }
  }

  async function remove() {
    if (!edit?.id) return;
    setBusy(true);
    const res = await fetch(`/api/products/${edit.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Không xoá được");
    setItems((xs) => xs.filter((x) => x.id !== edit.id));
    setEdit(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">Sản phẩm & dịch vụ</h1>
          <p className="mt-1 text-ink-2">Danh mục dùng khi lập báo giá và đơn hàng.</p>
        </div>
        {canEdit && (
          <button type="button" className="btn-primary" onClick={() => open()}>
            <Icon name="plus" size={16} /> Thêm sản phẩm
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="relative w-56 max-sm:w-full">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, nhóm" aria-label="Tìm sản phẩm" className="input h-8 pl-8" />
        </label>
        <label className="btn-ghost">
          <Icon name="filter" size={16} />
          <select aria-label="Lọc theo nhóm" value={cat} onChange={(e) => setCat(e.target.value)} className="max-w-[160px] bg-transparent outline-none">
            <option value="">Mọi nhóm</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Trạng thái bán">
          {(
            [
              ["active", "Đang bán"],
              ["inactive", "Ngừng bán"],
              ["all", "Tất cả"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-ink-2">{shown.length} mục</span>
      </div>

      {shown.length === 0 ? (
        <div className="card mt-4">
          <EmptyState icon="box" title={items.length ? "Không có sản phẩm nào khớp" : "Chưa có sản phẩm"} desc={canEdit ? "Thêm sản phẩm để chọn nhanh khi lập báo giá." : "Nhờ chủ hoặc quản lý thêm danh mục sản phẩm."} action={canEdit && !items.length ? { label: "Thêm sản phẩm", onClick: () => open() } : undefined} />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[13px] text-ink-2">
                <th className="px-3 py-2.5 font-normal">Sản phẩm</th>
                <th className="px-2 py-2.5 font-normal">Nhóm</th>
                <th className="px-2 py-2.5 text-right font-normal">Giá</th>
                <th className="px-2 py-2.5 text-right font-normal">VAT</th>
                <th className="px-2 py-2.5 text-right font-normal">Bảo hành</th>
                <th className="px-3 py-2.5 text-right font-normal">Đang bán</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={`border-b border-line-soft last:border-0 hover:bg-[var(--row-hover)] ${p.active ? "" : "text-ink-2"}`}>
                  <td className="max-w-[300px] px-3 py-2.5">
                    <button type="button" className="block max-w-full truncate text-left font-medium hover:underline disabled:no-underline" disabled={!canEdit} onClick={() => open(p)}>
                      {p.name}
                    </button>
                    <p className="text-[12.5px] text-ink-2">{[p.code, p.unit].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">{p.category || "–"}</td>
                  <td className="px-2 py-2.5 text-right tnum">{money(p.price)}</td>
                  <td className="px-2 py-2.5 text-right tnum">{p.vat}%</td>
                  <td className="px-2 py-2.5 text-right text-ink-2 tnum">{p.warrantyMonths ? `${p.warrantyMonths} tháng` : "–"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <input type="checkbox" role="switch" aria-label={`Đang bán ${p.name}`} checked={p.active} disabled={!canEdit} onChange={() => toggle(p)} className="h-4 w-4 accent-[var(--primary)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Sửa sản phẩm" : "Thêm sản phẩm"}
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
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>
              Lưu
            </button>
          </>
        }
      >
        {edit && (
          <div className="grid gap-3 p-5">
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
              <label className="grid gap-1">
                <span className="label">Mã</span>
                <input className="input" value={edit.f.code} onChange={(e) => setF("code", e.target.value)} maxLength={60} />
              </label>
              <label className="grid gap-1">
                <span className="label">Tên *</span>
                <input className="input" value={edit.f.name} onChange={(e) => setF("name", e.target.value)} maxLength={200} autoFocus />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="label">Đơn vị</span>
                <input className="input" value={edit.f.unit} onChange={(e) => setF("unit", e.target.value)} maxLength={40} />
              </label>
              <label className="grid gap-1">
                <span className="label">Nhóm</span>
                <input className="input" list="product-cats" value={edit.f.category} onChange={(e) => setF("category", e.target.value)} maxLength={80} />
                <datalist id="product-cats">
                  {cats.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1">
                <span className="label">Giá bán (₫)</span>
                <input className="input tnum" inputMode="numeric" value={edit.f.price ? Number(edit.f.price.replace(/\D/g, "")).toLocaleString("vi-VN") : ""} onChange={(e) => setF("price", e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="grid gap-1">
                <span className="label">VAT %</span>
                <select className="input" value={edit.f.vat} onChange={(e) => setF("vat", e.target.value)}>
                  {["0", "5", "8", "10"].includes(edit.f.vat) ? null : <option value={edit.f.vat}>{edit.f.vat}%</option>}
                  {["0", "5", "8", "10"].map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="label">Bảo hành (tháng)</span>
                <input className="input tnum" inputMode="numeric" value={edit.f.warrantyMonths} onChange={(e) => setF("warrantyMonths", e.target.value.replace(/\D/g, ""))} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="label">Mô tả</span>
              <textarea className="textarea min-h-[90px]" value={edit.f.description} onChange={(e) => setF("description", e.target.value)} maxLength={2000} />
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={edit.f.active} onChange={(e) => setF("active", e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              Đang bán (hiện khi lập báo giá)
            </label>
            {err && (
              <p role="alert" className="text-[13.5px] text-danger">
                {err}
              </p>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
