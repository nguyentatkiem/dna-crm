"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldDef, Option } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { dateVi, vnd } from "@/lib/format";
import { Avatar } from "../Avatar";
import type { FieldValue } from "@/lib/records";

/** Đóng popover khi bấm ra ngoài. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** Ô nhãn màu kín ô (status và select). */
export function LabelCell({ options, value, onPick, emptyText = "", block = true }: { options: Option[]; value: string; onPick: (key: string) => void; emptyText?: string; block?: boolean }) {
  const p = usePopover();
  const cur = options.find((o) => o.key === value || o.label === value);
  const c = cur ? color(cur.color) : { bg: "transparent", fg: "var(--ink-2)" };
  return (
    <div ref={p.ref} className={`relative ${block ? "h-full w-full" : ""}`}>
      <button
        type="button"
        onClick={() => p.setOpen(!p.open)}
        className={`grid w-full place-items-center px-2 text-[13.5px] transition-[filter] hover:brightness-95 ${block ? "h-full" : "h-8 rounded"}`}
        style={{ background: c.bg, color: c.fg }}
      >
        <span className="truncate">{cur?.label ?? emptyText}</span>
      </button>
      {p.open && (
        <div className="absolute left-1/2 top-full z-40 mt-1 w-48 -translate-x-1/2 rounded-lg bg-surface p-2 shadow-panel">
          <div className="grid gap-1.5">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onPick(o.key);
                  p.setOpen(false);
                }}
                className="h-8 rounded text-[13.5px] hover:brightness-95"
                style={{ background: color(o.color).bg, color: color(o.color).fg }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PersonCell({ team, value, onPick }: { team: string[]; value: string; onPick: (v: string) => void }) {
  const p = usePopover();
  return (
    <div ref={p.ref} className="relative grid h-full place-items-center">
      <button type="button" onClick={() => p.setOpen(!p.open)} aria-label="Đổi người phụ trách">
        <Avatar name={value} size={26} />
      </button>
      {p.open && (
        <div className="absolute left-1/2 top-full z-40 mt-1 w-52 -translate-x-1/2 rounded-lg bg-surface p-1.5 shadow-panel">
          {[...team, ""].map((t) => (
            <button
              key={t || "none"}
              type="button"
              onClick={() => {
                onPick(t);
                p.setOpen(false);
              }}
              className={`flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] hover:bg-hover ${t === value ? "bg-primary-selected" : ""}`}
            >
              <Avatar name={t} size={24} /> {t || "Bỏ người phụ trách"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ô nhập trực tiếp: hiển thị giá trị, bấm để sửa, Enter/blur để lưu. */
export function InputCell({ field, value, onSave, align, form }: { field: Pick<FieldDef, "type" | "label">; value: FieldValue | undefined; onSave: (v: FieldValue) => void; align?: "left" | "right" | "center"; form?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => {
    setV(String(value ?? ""));
  }, [value]);
  const numeric = field.type === "number" || field.type === "money";
  const commit = () => {
    setEdit(false);
    const next: FieldValue = numeric ? Number(v.replace(/[^\d.-]/g, "")) || 0 : v;
    if (String(next) !== String(value ?? "")) onSave(next);
  };
  const display = value === undefined || value === "" ? "" : field.type === "money" ? vnd(Number(value)) : field.type === "date" ? dateVi(String(value)) : String(value);
  const a = align ?? (numeric ? "right" : field.type === "date" ? "center" : "left");

  if (edit) {
    return (
      <input
        autoFocus
        aria-label={field.label}
        className={`h-full w-full bg-surface px-2.5 text-[14px] outline outline-2 outline-primary ${form ? "h-9 rounded" : ""} ${a === "right" ? "text-right" : a === "center" ? "text-center" : ""}`}
        type={field.type === "date" ? "date" : numeric ? "number" : field.type === "email" ? "email" : "text"}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setV(String(value ?? ""));
            setEdit(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEdit(true)}
      className={`h-full w-full truncate px-2.5 text-[14px] ${form ? "h-9 rounded border border-line-soft hover:border-line" : "hover:outline hover:outline-1 hover:outline-line"} ${a === "right" ? "text-right tnum" : a === "center" ? "text-center" : "text-left"}`}
    >
      {display || <span className="text-ink-2 opacity-60">{form ? `Thêm ${field.label.toLowerCase()}` : ""}</span>}
    </button>
  );
}

export function RatingCell({ value, onSave }: { value: FieldValue | undefined; onSave: (v: FieldValue) => void }) {
  const n = Number(value) || 0;
  return (
    <div className="flex h-full items-center justify-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" aria-label={`${i} sao`} onClick={() => onSave(i === n ? 0 : i)} className={i <= n ? "text-[#ffcb00]" : "text-line"}>
          ★
        </button>
      ))}
    </div>
  );
}

export function FieldCell({ field, value, onSave, form }: { field: FieldDef; value: FieldValue | undefined; onSave: (v: FieldValue) => void; form?: boolean }) {
  if (field.type === "select") return <LabelCell options={field.options} value={String(value ?? "")} onPick={(k) => onSave(field.options.find((o) => o.key === k)?.label ?? k)} block={!form} />;
  if (field.type === "rating") return <RatingCell value={value} onSave={onSave} />;
  return <InputCell field={field} value={value} onSave={onSave} form={form} />;
}
