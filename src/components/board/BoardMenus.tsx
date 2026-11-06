"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { usePopover } from "./cells";
import { OPS, type Column, type Filter, type FilterField } from "./model";

/** Lọc nâng cao: nhiều điều kiện (trường + điều kiện + giá trị), khớp tất cả hoặc bất kỳ. */
export function FilterMenu({ fields, filters, mode, onChange }: { fields: FilterField[]; filters: Filter[]; mode: "and" | "or"; onChange: (f: Filter[], mode: "and" | "or") => void }) {
  const p = usePopover();
  const active = filters.filter((f) => f.op === "empty" || f.op === "not_empty" || f.value !== "").length;
  const add = () => {
    const f = fields[0];
    onChange([...filters, { id: Math.random().toString(36).slice(2, 8), field: f.key, op: OPS[f.kind][0].op, value: "" }], mode);
  };
  const upd = (id: string, patch: Partial<Filter>) => onChange(filters.map((x) => (x.id === id ? { ...x, ...patch } : x)), mode);
  // Bảng lọc rộng 560px mở từ nút Lọc: nếu tràn mép phải màn hình thì dịch sang trái cho vừa (không bị cắt ô giá trị).
  const panel = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!p.open || !panel.current || window.innerWidth < 640) return setShift(0);
    const host = p.ref.current?.getBoundingClientRect();
    const w = panel.current.offsetWidth;
    if (!host) return;
    const over = host.left + w - (window.innerWidth - 16);
    setShift(over > 0 ? Math.min(over, Math.max(0, host.left - 16)) : 0);
  }, [p.open, p.ref]);
  return (
    <div ref={p.ref} className="relative">
      <button type="button" className={`btn-ghost ${active ? "bg-primary-selected" : ""}`} onClick={() => { p.setOpen(!p.open); if (!filters.length) add(); }} aria-expanded={p.open}>
        <Icon name="filter" size={16} /> Lọc{active ? ` · ${active}` : ""}
      </button>
      {p.open && (
        <div ref={panel} style={shift ? { left: -shift } : undefined} className="absolute left-0 top-full z-40 mt-1 w-[min(560px,calc(100vw-32px))] rounded-lg bg-surface p-3 shadow-panel max-sm:fixed max-sm:left-4 max-sm:top-24">
          <div className="mb-2 flex items-center justify-between gap-2">
            <b className="text-[14px]">Lọc nâng cao</b>
            {filters.length > 1 && (
              <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
                Khớp
                <select aria-label="Cách kết hợp điều kiện" value={mode} onChange={(e) => onChange(filters, e.target.value as "and" | "or")} className="h-7 rounded border border-line bg-surface px-1.5 text-ink">
                  <option value="and">tất cả điều kiện</option>
                  <option value="or">bất kỳ điều kiện nào</option>
                </select>
              </label>
            )}
          </div>
          <div className="grid gap-2">
            {filters.map((f, i) => {
              const ff = fields.find((x) => x.key === f.field) ?? fields[0];
              const needValue = f.op !== "empty" && f.op !== "not_empty";
              return (
                <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_32px] items-center gap-1.5 max-sm:grid-cols-2">
                  <select
                    aria-label={`Trường điều kiện ${i + 1}`}
                    value={f.field}
                    onChange={(e) => {
                      const nf = fields.find((x) => x.key === e.target.value)!;
                      upd(f.id, { field: nf.key, op: OPS[nf.kind][0].op, value: "" });
                    }}
                    className="h-8 min-w-0 rounded border border-line bg-surface px-1.5 text-[13px]"
                  >
                    {fields.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label={`Điều kiện ${i + 1}`} value={f.op} onChange={(e) => upd(f.id, { op: e.target.value as Filter["op"] })} className="h-8 min-w-0 rounded border border-line bg-surface px-1.5 text-[13px]">
                    {OPS[ff.kind].map((o) => (
                      <option key={o.op} value={o.op}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {needValue ? (
                    ff.kind === "option" ? (
                      <select aria-label={`Giá trị ${i + 1}`} value={f.value} onChange={(e) => upd(f.id, { value: e.target.value })} className="h-8 min-w-0 rounded border border-line bg-surface px-1.5 text-[13px]">
                        <option value="">Chọn...</option>
                        {ff.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={`Giá trị ${i + 1}`}
                        type={ff.kind === "number" ? "number" : ff.kind === "date" ? "date" : "text"}
                        value={f.value}
                        onChange={(e) => upd(f.id, { value: e.target.value })}
                        placeholder="Giá trị"
                        className="input h-8 min-w-0 px-2 text-[13px]"
                      />
                    )
                  ) : (
                    <span />
                  )}
                  <button type="button" aria-label="Bỏ điều kiện" className="btn-ghost h-8 w-8 justify-center p-0 text-ink-2" onClick={() => onChange(filters.filter((x) => x.id !== f.id), mode)}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" className="btn-ghost text-primary" onClick={add}>
              <Icon name="plus" size={15} /> Thêm điều kiện
            </button>
            {filters.length > 0 && (
              <button type="button" className="btn-ghost text-ink-2" onClick={() => onChange([], mode)}>
                Xoá hết
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ẩn/hiện cột (lưu theo bảng trên máy). */
export function ColumnsMenu({ cols, hidden, onChange }: { cols: Column[]; hidden: string[]; onChange: (h: string[]) => void }) {
  const p = usePopover();
  return (
    <div ref={p.ref} className="relative">
      <button type="button" className={`btn-ghost ${hidden.length ? "bg-primary-selected" : ""}`} onClick={() => p.setOpen(!p.open)} aria-expanded={p.open}>
        <Icon name="layout" size={16} /> Cột{hidden.length ? ` · ẩn ${hidden.length}` : ""}
      </button>
      {p.open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-[60vh] w-60 overflow-y-auto rounded-lg bg-surface p-2 shadow-panel max-sm:left-0 max-sm:right-auto">
          <p className="px-2 pb-1 text-[12px] text-ink-2">Hiện cột</p>
          {cols.map((c) => (
            <label key={c.id} className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13.5px] hover:bg-hover">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={!hidden.includes(c.id)} onChange={(e) => onChange(e.target.checked ? hidden.filter((x) => x !== c.id) : [...hidden, c.id])} />
              <span className="truncate">{c.label}</span>
            </label>
          ))}
          {hidden.length > 0 && (
            <button type="button" className="btn-ghost mt-1 w-full justify-center text-primary" onClick={() => onChange([])}>
              Hiện tất cả
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Thanh thao tác hàng loạt khi chọn nhiều dòng. */
export function BulkBar({ obj, team, count, canDelete, onStatus, onOwner, onDelete, onClear }: { obj: ObjectDef; team: string[]; count: number; canDelete: boolean; onStatus: (k: string) => void; onOwner: (n: string) => void; onDelete: () => void; onClear: () => void }) {
  const st = usePopover();
  const ow = usePopover();
  const [confirm, setConfirm] = useState(false);
  return (
    <div role="toolbar" aria-label="Thao tác hàng loạt" className="fixed bottom-5 left-1/2 z-[55] flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-xl border border-line-soft bg-surface p-1.5 shadow-panel">
      <span className="flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-[13.5px] font-medium text-white tnum">{count} đã chọn</span>
      <div ref={st.ref} className="relative">
        <button type="button" className="btn-ghost" onClick={() => st.setOpen(!st.open)}>
          <Icon name="check" size={15} /> Đổi {obj.statusLabel.toLowerCase()}
        </button>
        {st.open && (
          <div className="absolute bottom-full left-0 mb-1 grid w-48 gap-1.5 rounded-lg bg-surface p-2 shadow-panel">
            {obj.statuses.map((s) => (
              <button key={s.key} type="button" className="h-8 rounded text-[13.5px] hover:brightness-95" style={{ background: color(s.color).bg, color: color(s.color).fg }} onClick={() => { onStatus(s.key); st.setOpen(false); }}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={ow.ref} className="relative">
        <button type="button" className="btn-ghost" onClick={() => ow.setOpen(!ow.open)}>
          <Icon name="person" size={15} /> Giao cho
        </button>
        {ow.open && (
          <div className="absolute bottom-full left-0 mb-1 w-52 rounded-lg bg-surface p-1.5 shadow-panel">
            {[...team, ""].map((t) => (
              <button key={t || "none"} type="button" className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] hover:bg-hover" onClick={() => { onOwner(t); ow.setOpen(false); }}>
                <Avatar name={t} size={22} /> {t || "Bỏ người phụ trách"}
              </button>
            ))}
          </div>
        )}
      </div>
      {canDelete &&
        (confirm ? (
          <span className="flex items-center gap-1 px-1 text-[13px]">
            Chuyển {count} mục vào thùng rác?
            <button type="button" className="btn h-8 bg-[#df2f4a] text-white hover:brightness-95" onClick={() => { setConfirm(false); onDelete(); }}>
              Xoá
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>
              Huỷ
            </button>
          </span>
        ) : (
          <button type="button" className="btn-ghost text-[#df2f4a]" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={15} /> Xoá
          </button>
        ))}
      <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" aria-label="Bỏ chọn" onClick={onClear}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
