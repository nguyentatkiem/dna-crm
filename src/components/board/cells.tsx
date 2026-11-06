"use client";

import { useEffect, useRef, useState } from "react";
import { splitTags, type FieldDef, type Option } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { dateVi, vnd } from "@/lib/format";
import { Avatar } from "../Avatar";
import type { FieldValue } from "@/lib/records";
import { formatFormulaValue, type FormulaResult } from "@/lib/formula";

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
export function InputCell({ field, value, onSave, align, form, startEditing, onClose }: { field: Pick<FieldDef, "type" | "label">; value: FieldValue | undefined; onSave: (v: FieldValue) => void; align?: "left" | "right" | "center"; form?: boolean; startEditing?: boolean; onClose?: () => void }) {
  const [edit, setEdit] = useState(!!startEditing);
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => {
    setV(String(value ?? ""));
  }, [value]);
  const numeric = field.type === "number" || field.type === "money";
  const commit = () => {
    setEdit(false);
    onClose?.();
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
            onClose?.();
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

/** Ô công thức: chỉ đọc, số căn phải, lỗi hiện #LỖI kèm chú thích. */
export function FormulaCell({ result, money, form }: { result: FormulaResult | undefined; money?: boolean; form?: boolean }) {
  const base = `flex h-full w-full items-center px-2.5 text-[14px] ${form ? "h-9 rounded border border-dashed border-line-soft bg-surface-2" : ""}`;
  if (!result) return <span className={base} />;
  if (!result.ok)
    return (
      <span className={`${base} justify-end font-medium text-[#df2f4a]`} title={`Lỗi công thức: ${result.error}`} aria-label={`Lỗi công thức: ${result.error}`}>
        #LỖI
      </span>
    );
  const v = result.value;
  const numeric = typeof v === "number";
  return (
    <span className={`${base} ${numeric ? "justify-end tnum" : v instanceof Date ? "justify-center" : ""} truncate`} title="Tính tự động từ công thức">
      <span className="truncate">{formatFormulaValue(v, { money, vnd })}</span>
    </span>
  );
}

export function FieldCell({ field, value, onSave, form, computed, money }: { field: FieldDef; value: FieldValue | undefined; onSave: (v: FieldValue) => void; form?: boolean; computed?: FormulaResult; money?: boolean }) {
  if (field.type === "formula") return <FormulaCell result={computed} money={money} form={form} />;
  if (field.type === "select") return <LabelCell options={field.options} value={String(value ?? "")} onPick={(k) => onSave(field.options.find((o) => o.key === k)?.label ?? k)} block={!form} />;
  if (field.type === "rating") return <RatingCell value={value} onSave={onSave} />;
  if (field.type === "checkbox") return <CheckboxCell label={field.label} value={value} onSave={onSave} form={form} />;
  if (field.type === "progress") return <ProgressCell label={field.label} value={value} onSave={onSave} form={form} />;
  if (field.type === "tags") return <TagsCell label={field.label} options={field.options} value={value} onSave={onSave} form={form} />;
  if (field.type === "link") return <LinkCell label={field.label} value={value} onSave={onSave} form={form} />;
  return <InputCell field={field} value={value} onSave={onSave} form={form} />;
}

/** Ô tích: lưu 1/0, bấm để đổi. */
export function CheckboxCell({ label, value, onSave, form }: { label: string; value: FieldValue | undefined; onSave: (v: FieldValue) => void; form?: boolean }) {
  const on = !!Number(value);
  return (
    <label className={`flex h-full w-full cursor-pointer items-center ${form ? "gap-2 px-1 text-[14px]" : "justify-center"}`}>
      <input type="checkbox" aria-label={label} checked={on} onChange={(e) => onSave(e.target.checked ? 1 : 0)} className="h-[18px] w-[18px] accent-[#00c875]" />
      {form && <span className="text-ink-2">{on ? "Đã tích" : "Chưa tích"}</span>}
    </label>
  );
}

/** Tiến độ 0–100%: thanh màu theo mức, bấm để nhập số. */
export function ProgressCell({ label, value, onSave, form }: { label: string; value: FieldValue | undefined; onSave: (v: FieldValue) => void; form?: boolean }) {
  const [edit, setEdit] = useState(false);
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  const empty = value === undefined || value === "";
  const c = n >= 100 ? "#00c875" : n >= 50 ? "#579bfc" : n > 0 ? "#fdab3d" : "var(--line)";
  if (edit)
    return (
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        aria-label={`${label} (%)`}
        defaultValue={empty ? "" : n}
        className={`h-full w-full bg-surface px-2.5 text-right text-[14px] outline outline-2 outline-primary ${form ? "h-9 rounded" : ""}`}
        onBlur={(e) => {
          setEdit(false);
          const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
          if (e.target.value !== "" && v !== n) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEdit(false);
        }}
      />
    );
  return (
    <button type="button" onClick={() => setEdit(true)} aria-label={`${label}: ${empty ? "chưa có" : `${n}%`}`} className={`flex h-full w-full items-center gap-2 px-2.5 ${form ? "h-9 rounded border border-line-soft hover:border-line" : "hover:outline hover:outline-1 hover:outline-line"}`}>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
        <span className="block h-full rounded-full transition-[width]" style={{ width: `${n}%`, background: c }} />
      </span>
      <span className="w-9 text-right text-[12.5px] tnum text-ink-2">{empty ? "–" : `${n}%`}</span>
    </button>
  );
}

/** Thẻ nhiều lựa chọn: hiện các chip màu, bấm để bật/tắt từng thẻ. */
export function TagsCell({ label, options, value, onSave, form }: { label: string; options: Option[]; value: FieldValue | undefined; onSave: (v: FieldValue) => void; form?: boolean }) {
  const p = usePopover();
  const tags = splitTags(value);
  const toggle = (l: string) => onSave((tags.includes(l) ? tags.filter((x) => x !== l) : [...tags, l]).join(", "));
  return (
    <div ref={p.ref} className="relative h-full w-full">
      <button
        type="button"
        onClick={() => p.setOpen(!p.open)}
        aria-label={`${label}: ${tags.join(", ") || "chưa có"}`}
        className={`flex h-full w-full items-center gap-1 overflow-hidden px-1.5 ${form ? "h-9 rounded border border-line-soft hover:border-line" : "justify-center hover:outline hover:outline-1 hover:outline-line"}`}
      >
        {tags.map((t) => {
          const o = options.find((x) => x.label === t);
          const c = o ? color(o.color) : { bg: "var(--surface-2)", fg: "var(--ink)" };
          return (
            <span key={t} className="max-w-[110px] flex-none truncate rounded-full px-2 py-0.5 text-[12px]" style={{ background: c.bg, color: c.fg }}>
              {t}
            </span>
          );
        })}
        {!tags.length && form && <span className="px-1 text-[14px] text-ink-2 opacity-60">Thêm {label.toLowerCase()}</span>}
      </button>
      {p.open && (
        <div role="listbox" aria-multiselectable="true" aria-label={label} className="absolute left-1/2 top-full z-40 mt-1 w-52 -translate-x-1/2 rounded-lg bg-surface p-1.5 shadow-panel">
          {options.map((o) => {
            const on = tags.includes(o.label);
            return (
              <button key={o.key} type="button" role="option" aria-selected={on} onClick={() => toggle(o.label)} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] hover:bg-hover">
                <span className={`grid h-4 w-4 flex-none place-items-center rounded border text-[11px] text-white ${on ? "border-transparent bg-primary" : "border-line"}`}>{on ? "✓" : ""}</span>
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: color(o.color).bg }} />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
          {!options.length && <p className="px-2 py-1.5 text-[13px] text-ink-2">Chưa có thẻ. Thêm trong Cài đặt → Trường dữ liệu.</p>}
        </div>
      )}
    </div>
  );
}

/** Liên kết: bấm chữ để mở trang, bút chì để sửa. Thiếu http(s) thì tự thêm https://. */
export function LinkCell({ label, value, onSave, form }: { label: string; value: FieldValue | undefined; onSave: (v: FieldValue) => void; form?: boolean }) {
  const [edit, setEdit] = useState(false);
  const raw = String(value ?? "").trim();
  const href = raw && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw;
  let text = raw;
  try {
    if (href) text = new URL(href).hostname.replace(/^www\./, "") + new URL(href).pathname.replace(/\/$/, "");
  } catch {}
  if (edit || (!raw && form))
    return <InputCell field={{ type: "text", label }} value={raw} onSave={(v) => onSave(String(v).trim())} form={form} startEditing={edit} onClose={() => setEdit(false)} />;
  return (
    <div className={`group/l flex h-full w-full items-center gap-1 px-2.5 ${form ? "h-9 rounded border border-line-soft" : ""}`}>
      {href && /^https?:\/\//i.test(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 truncate text-[14px] text-primary hover:underline" title={href}>
          {text}
        </a>
      ) : (
        <span className="flex-1" />
      )}
      <button type="button" onClick={() => setEdit(true)} aria-label={`Sửa ${label.toLowerCase()}`} className={`flex-none rounded px-1 text-[13px] text-ink-2 hover:bg-hover hover:text-ink ${raw ? "opacity-0 focus:opacity-100 group-hover/l:opacity-100 max-md:opacity-100" : ""}`}>
        ✎
      </button>
    </div>
  );
}
