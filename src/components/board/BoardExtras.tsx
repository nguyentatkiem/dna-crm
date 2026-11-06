"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { ago } from "@/lib/format";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { usePopover } from "./cells";
import { RULE_COLORS, colorableFields, type ColorRule, type Density, type FilterField } from "./model";

export type RowAction = { kind: "open" | "newtab" | "copylink" | "duplicate" | "delete" } | { kind: "move"; status: string };

/** Menu chuột phải trên một dòng (vị trí theo con trỏ, tự né mép màn hình). */
export function RowMenu({ obj, record, x, y, canDelete, onAction, onClose }: { obj: ObjectDef; record: RecordDTO; x: number; y: number; canDelete: boolean; onAction: (a: RowAction) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y, moveOpen, confirm]);

  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const scroll = () => onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", scroll);
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", scroll);
    };
  }, [onClose]);

  const act = (a: RowAction) => {
    onAction(a);
    onClose();
  };
  const item = (icon: string, label: string, onClick: () => void, cls = "") => (
    <button type="button" role="menuitem" onClick={onClick} className={`flex h-8 w-full items-center gap-2.5 rounded px-2 text-left text-[13.5px] hover:bg-hover focus:bg-hover focus:outline-none ${cls}`}>
      <Icon name={icon} size={15} className="flex-none text-ink-2" /> <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
  const sep = <div className="my-1 h-px bg-line-soft" />;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Thao tác với ${record.title}`}
      className="anim-fade fixed z-[70] w-60 rounded-lg bg-surface p-1.5 shadow-panel"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }}
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-[12px] font-medium text-ink-2">{record.title}</p>
      {item("open", `Mở ${obj.itemLabel.toLowerCase()}`, () => act({ kind: "open" }))}
      {item("link", "Mở trong thẻ mới", () => act({ kind: "newtab" }))}
      {item("copy", "Sao chép link", () => act({ kind: "copylink" }))}
      {sep}
      {item("copy", "Nhân bản", () => act({ kind: "duplicate" }))}
      {item("chevron", `Chuyển sang ${obj.statusLabel.toLowerCase()}…`, () => setMoveOpen(!moveOpen))}
      {moveOpen && (
        <div className="grid gap-1 px-1 pb-1">
          {obj.statuses
            .filter((s) => s.key !== record.status)
            .map((s) => (
              <button key={s.key} type="button" role="menuitem" onClick={() => act({ kind: "move", status: s.key })} className="h-7 rounded text-[13px] hover:brightness-95 focus:outline focus:outline-2 focus:outline-primary" style={{ background: color(s.color).bg, color: color(s.color).fg }}>
                {s.label}
              </button>
            ))}
        </div>
      )}
      {canDelete && (
        <>
          {sep}
          {confirm ? (
            <div className="flex items-center gap-1 px-1 py-0.5 text-[13px]">
              <span className="flex-1">Chuyển vào thùng rác?</span>
              <button type="button" role="menuitem" className="btn h-7 bg-[#df2f4a] px-2.5 text-[13px] text-white hover:brightness-95" onClick={() => act({ kind: "delete" })}>
                Xoá
              </button>
              <button type="button" className="btn-ghost h-7 px-2 text-[13px]" onClick={() => setConfirm(false)}>
                Huỷ
              </button>
            </div>
          ) : (
            item("trash", "Xoá", () => setConfirm(true), "text-[#df2f4a]")
          )}
        </>
      )}
    </div>
  );
}

/** Nút "…" trên thanh công cụ: độ cao dòng và tô màu theo điều kiện. */
export function ViewOptions({ density, rules, fields, onDensity, onRules }: { density: Density; rules: ColorRule[]; fields: FilterField[]; onDensity: (d: Density) => void; onRules: (r: ColorRule[]) => void }) {
  const p = usePopover();
  const usable = colorableFields(fields);
  const add = () => {
    const f = usable[0];
    if (f) onRules([...rules, { id: Math.random().toString(36).slice(2, 8), field: f.key, value: f.options?.[0]?.value ?? "", color: RULE_COLORS[rules.length % RULE_COLORS.length] }]);
  };
  const upd = (id: string, patch: Partial<ColorRule>) => onRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div ref={p.ref} className="relative">
      <button type="button" className={`btn-ghost ${rules.length ? "bg-primary-selected" : ""}`} onClick={() => p.setOpen(!p.open)} aria-expanded={p.open} aria-label="Tuỳ chọn hiển thị">
        <Icon name="settings" size={16} /> <span className="max-sm:hidden">Hiển thị</span>
      </button>
      {p.open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[min(440px,calc(100vw-32px))] rounded-lg bg-surface p-3 shadow-panel max-sm:fixed max-sm:left-4 max-sm:right-auto max-sm:top-24">
          <p className="text-[13px] font-semibold">Độ cao dòng</p>
          <div className="mt-1.5 flex overflow-hidden rounded border border-line text-[13.5px]" role="group" aria-label="Độ cao dòng">
            {(
              [
                ["compact", "Gọn"],
                ["normal", "Vừa"],
                ["roomy", "Thoáng"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={density === k} onClick={() => onDensity(k)} className={`h-8 flex-1 ${density === k ? "bg-primary-selected font-medium text-primary" : "hover:bg-hover"}`}>
                {label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-[13px] font-semibold">Tô màu theo điều kiện</p>
          <p className="text-[12.5px] text-ink-2">Dòng khớp điều kiện đầu tiên sẽ được tô màu nhạt.</p>
          <div className="mt-2 grid gap-2">
            {rules.map((r, i) => {
              const f = usable.find((x) => x.key === r.field) ?? usable[0];
              return (
                <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_32px] items-center gap-1.5">
                  <select aria-label={`Cột của luật màu ${i + 1}`} value={r.field} onChange={(e) => { const nf = usable.find((x) => x.key === e.target.value); upd(r.id, { field: e.target.value, value: nf?.options?.[0]?.value ?? "" }); }} className="h-8 min-w-0 rounded border border-line bg-surface px-1.5 text-[13px]">
                    {usable.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label={`Giá trị của luật màu ${i + 1}`} value={r.value} onChange={(e) => upd(r.id, { value: e.target.value })} className="h-8 min-w-0 rounded border border-line bg-surface px-1.5 text-[13px]">
                    {f?.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        là “{o.label}”
                      </option>
                    ))}
                  </select>
                  <span className="flex gap-0.5" role="radiogroup" aria-label={`Màu của luật ${i + 1}`}>
                    {RULE_COLORS.slice(0, 5).map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={r.color === c} aria-label={`Màu ${c}`} onClick={() => upd(r.id, { color: c })} className={`h-6 w-6 rounded-full border-2 ${r.color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />
                    ))}
                  </span>
                  <button type="button" aria-label="Bỏ luật màu" className="btn-ghost h-8 w-8 justify-center p-0 text-ink-2" onClick={() => onRules(rules.filter((x) => x.id !== r.id))}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          {usable.length > 0 && (
            <button type="button" className="btn-ghost mt-2 text-primary" onClick={add}>
              <Icon name="plus" size={15} /> Thêm luật màu
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Entry = { id: string; action: string; entityId: string; userName: string; summary: string; createdAt: string };
const ACTION_ICON: Record<string, string> = { "record.create": "plus", "record.update": "edit", "record.delete": "trash", "record.restore": "refresh", import: "upload", export: "download" };

/** Ngăn kéo "Nhật ký bảng": mọi thao tác tạo, sửa, xoá, nhập, xuất trên bảng này. */
export function BoardActivity({ obj, onClose, onOpen, trashHref }: { obj: ObjectDef; onClose: () => void; onOpen: (id: string) => void; trashHref?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [who, setWho] = useState("");

  const load = async (before?: string) => {
    setLoading(true);
    const r = await fetch(`/api/records/activity?object=${obj.key}${before ? `&before=${encodeURIComponent(before)}` : ""}`).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setLoading(false);
    if (!r?.ok) return setError(j?.error ?? "Không tải được nhật ký");
    setEntries((xs) => (before ? [...xs, ...j.entries] : j.entries));
    setMore(j.more);
  };
  useEffect(() => {
    load();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.key]);

  const people = [...new Set(entries.map((e) => e.userName))];
  const shown = entries.filter((e) => !who || e.userName === who);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-label={`Nhật ký bảng ${obj.label}`} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-surface shadow-panel">
        <header className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
          <Icon name="history" size={20} className="text-ink-2" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">Nhật ký bảng</h2>
            <p className="text-[13px] text-ink-2">Mọi thao tác trên bảng {obj.label.toLowerCase()}</p>
          </div>
          {trashHref && (
            <a href={trashHref} className="btn-ghost h-8 text-[13px]">
              <Icon name="trash" size={15} /> Thùng rác
            </a>
          )}
          <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </header>
        {people.length > 1 && (
          <div className="border-b border-line-soft px-5 py-2.5">
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <Icon name="person" size={15} />
              <select aria-label="Lọc theo người" value={who} onChange={(e) => setWho(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-ink">
                <option value="">Mọi người</option>
                {people.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="flex-1 overflow-y-auto bg-surface-2 px-5 py-4">
          {error ? (
            <p className="py-6 text-center text-ink-2">{error}</p>
          ) : !entries.length && loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-surface" />
          ) : !entries.length ? (
            <p className="py-6 text-center text-ink-2">Chưa có thao tác nào được ghi lại.</p>
          ) : (
            <ol className="grid gap-2">
              {shown.map((e) => {
                const clickable = e.action === "record.create" || e.action === "record.update" || e.action === "record.restore";
                const body = (
                  <>
                    <Avatar name={e.userName} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                        <b className="text-ink">{e.userName}</b>
                        <Icon name={ACTION_ICON[e.action] ?? "edit"} size={13} />
                        <span className="ml-auto flex-none text-[12px]" suppressHydrationWarning title={new Date(e.createdAt).toLocaleString("vi-VN")}>
                          {ago(e.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block break-words text-[13.5px]">{e.summary}</span>
                    </span>
                  </>
                );
                return (
                  <li key={e.id}>
                    {clickable ? (
                      <button type="button" onClick={() => onOpen(e.entityId)} className="flex w-full items-start gap-2.5 rounded-lg bg-surface px-3.5 py-3 text-left hover:outline hover:outline-1 hover:outline-line">
                        {body}
                      </button>
                    ) : (
                      <div className="flex items-start gap-2.5 rounded-lg bg-surface px-3.5 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {more && (
            <button type="button" className="btn-outline mx-auto mt-3 flex" disabled={loading} onClick={() => load(entries[entries.length - 1]?.createdAt)}>
              {loading ? "Đang tải..." : "Xem thêm"}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
