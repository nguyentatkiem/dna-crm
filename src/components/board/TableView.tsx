"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { ago, heat, vnd } from "@/lib/format";
import { Icon } from "../Icon";
import { FieldCell, InputCell, LabelCell, PersonCell, usePopover } from "./cells";
import { CHECK_W, TITLE_W, colKey, fieldOf, formulaMoney, formulaNumber, formulaOf, type ColSort, type Column, type Group, type Patch } from "./model";

const VIRTUAL_FROM = 200;
const ROW_H = 36;

type Props = {
  obj: ObjectDef;
  team: string[];
  groups: Group[];
  rows: RecordDTO[];
  cols: Column[];
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
  onPatch: (id: string, b: Patch) => void;
  onCreate: (title: string, g: Group) => void;
  onOpen: (id: string) => void;
  /** Sắp xếp đang bật theo cột (hiện mũi tên trên tiêu đề cột). */
  sort?: ColSort | null;
  /** Menu tiêu đề cột; bỏ trống thì tiêu đề chỉ là chữ. */
  onColumn?: (c: Column, a: ColAction) => void;
  /** Cột nào nhóm được (trạng thái, người phụ trách, trường lựa chọn). */
  canGroup?: (c: Column) => boolean;
  canFilter?: (c: Column) => boolean;
  /** Tuỳ chọn dòng: độ cao, màu theo điều kiện, menu chuột phải, xuất nhóm. */
  ext?: RowExt;
};

export type RowExt = {
  rowH: number;
  tintOf: (r: RecordDTO) => string | null;
  onRowMenu: (r: RecordDTO, x: number, y: number) => void;
  onExportGroup?: (g: Group, ids: string[]) => void;
  /** Trường chỉ xem với vai trò hiện tại (Phân quyền trường): ô hiện giá trị nhưng không sửa được. */
  readOnly?: Set<string>;
  /** Kéo tiêu đề cột để đổi thứ tự; kéo mép phải để đổi độ rộng. */
  onReorder?: (from: string, to: string) => void;
  onResize?: (id: string, w: number) => void;
};
const NO_EXT: RowExt = { rowH: ROW_H, tintOf: () => null, onRowMenu: () => undefined };

export type ColAction = "asc" | "desc" | "clear-sort" | "filter" | "group" | "hide";

/** Bảng chính kiểu monday: mỗi nhóm có viền trái màu, cột tiêu đề dính trái; nhóm > 200 dòng render ảo. */
export function TableView({ obj, team, groups, rows, cols, selected, onSelect, onPatch, onCreate, onOpen, sort, onColumn, canGroup, canFilter, ext = NO_EXT }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const template = `${CHECK_W + TITLE_W}px ${cols.map((c) => `${c.w}px`).join(" ")}`;
  const moneyCols = useMemo(() => new Set(cols.filter((c) => fieldOf(c)?.type === "formula" && formulaMoney(fieldOf(c)!, obj)).map((c) => c.id)), [cols, obj]);
  const parts = useMemo(() => groups.map((g) => ({ g, rows: rows.filter(g.match) })), [groups, rows]);

  if (!rows.length && !groups.length) return null;
  return (
    <div className="mt-5 overflow-x-auto pb-40">
      <div className="grid min-w-max gap-8">
        {parts.map(({ g, rows: list }) => (
          <section key={g.key} aria-label={g.label}>
            <div className="group/g sticky left-0 z-30 mb-2 flex w-fit items-center gap-2">
              <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))} aria-expanded={!collapsed[g.key]} className="flex items-center gap-1.5 text-[16px] font-semibold" style={{ color: g.color }}>
                <Icon name="chevron" size={18} className={collapsed[g.key] ? "-rotate-90" : ""} />
                {g.label}
              </button>
              <span className="text-[13px] text-ink-2">{list.length} mục</span>
              <GroupMenu
                group={g}
                count={list.length}
                collapsed={!!collapsed[g.key]}
                allCollapsed={parts.every((x) => collapsed[x.g.key])}
                onToggle={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                onToggleAll={(on) => setCollapsed(Object.fromEntries(parts.map((x) => [x.g.key, on])))}
                onSelectAll={() => onSelect(list.map((r) => r.id), true)}
                onExport={ext.onExportGroup && list.length ? () => ext.onExportGroup!(g, list.map((r) => r.id)) : undefined}
              />
              {list.length > VIRTUAL_FROM && <span className="rounded bg-surface-2 px-1.5 text-[11.5px] text-ink-2">cuộn nhanh</span>}
            </div>
            {!collapsed[g.key] && (
              <GroupTable obj={obj} team={team} group={g} rows={list} cols={cols} template={template} moneyCols={moneyCols} selected={selected} onSelect={onSelect} onPatch={onPatch} onCreate={onCreate} onOpen={onOpen} sort={sort} onColumn={onColumn} canGroup={canGroup} canFilter={canFilter} ext={ext} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function GroupTable({ obj, team, group, rows, cols, template, moneyCols, selected, onSelect, onPatch, onCreate, onOpen, sort, onColumn, canGroup, canFilter, ext = NO_EXT }: Omit<Props, "groups"> & { group: Group; template: string; moneyCols: Set<string> }) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = !allOn && rows.some((r) => selected.has(r.id));
  const virtual = rows.length > VIRTUAL_FROM;
  return (
    <div role="table" className="w-max text-[14px]" style={{ borderLeft: `6px solid ${group.color}`, borderRadius: 4 }}>
      <div role="row" className="grid" style={{ gridTemplateColumns: template }}>
        <div role="columnheader" className="sticky left-0 z-20 flex h-9 items-center border-b border-r border-t border-line-soft bg-surface text-[13px] text-ink-2">
          <span className="grid h-full flex-none place-items-center" style={{ width: CHECK_W }}>
            <input
              type="checkbox"
              aria-label={`Chọn tất cả trong nhóm ${group.label}`}
              checked={allOn}
              ref={(el) => {
                if (el) el.indeterminate = someOn;
              }}
              onChange={(e) => onSelect(rows.map((r) => r.id), e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </span>
          <span className="pl-1">{obj.itemLabel}</span>
        </div>
        {cols.map((c) => (
          <ColumnHeader key={c.id} c={c} sort={sort} onColumn={onColumn} canGroup={canGroup?.(c) ?? false} canFilter={canFilter?.(c) ?? false} onReorder={ext.onReorder} onResize={ext.onResize} />
        ))}
      </div>
      {virtual ? (
        <VirtualRows obj={obj} team={team} rows={rows} cols={cols} template={template} moneyCols={moneyCols} selected={selected} onSelect={onSelect} onPatch={onPatch} onOpen={onOpen} ext={ext} />
      ) : (
        rows.map((r) => <Row key={r.id} obj={obj} team={team} r={r} cols={cols} template={template} moneyCols={moneyCols} on={selected.has(r.id)} onSelect={onSelect} onPatch={onPatch} onOpen={onOpen} ext={ext} tint={ext.tintOf(r)} />)
      )}
      <div role="row" className="grid" style={{ gridTemplateColumns: template }}>
        <div className="sticky left-0 z-10 h-9 border-b border-r border-line-soft bg-surface" style={{ paddingLeft: CHECK_W }}>
          <AddRow label={obj.itemLabel} onAdd={(t) => onCreate(t, group)} />
        </div>
        <div className="h-9 border-b border-line-soft" style={{ gridColumn: `span ${cols.length}` }} />
      </div>
      <SumRow obj={obj} rows={rows} cols={cols} template={template} moneyCols={moneyCols} />
    </div>
  );
}

/** Tiêu đề cột kiểu monday: rê chuột hiện nút "…" mở menu sắp xếp / lọc / nhóm / ẩn cột. */
function ColumnHeader({ c, sort, onColumn, canGroup, canFilter, onReorder, onResize }: { c: Column; sort?: ColSort | null; onColumn?: Props["onColumn"]; canGroup: boolean; canFilter: boolean; onReorder?: RowExt["onReorder"]; onResize?: RowExt["onResize"] }) {
  const p = usePopover();
  const [over, setOver] = useState(false);
  // Kéo mép phải: cập nhật độ rộng theo từng khung hình, giữ trong 60–800px.
  const startResize = (e: React.PointerEvent) => {
    if (!onResize) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = c.w;
    let raf = 0;
    const move = (ev: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => onResize(c.id, Math.max(60, Math.min(800, Math.round(w0 + ev.clientX - x0)))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const f = fieldOf(c);
  const sorted = sort && sort.col === colKey(c) ? sort.dir : null;
  const act = (a: ColAction) => {
    p.setOpen(false);
    onColumn?.(c, a);
  };
  const item = (a: ColAction, icon: string, label: string, on = false) => (
    <button key={a} type="button" role="menuitem" onClick={() => act(a)} className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] hover:bg-hover ${on ? "font-medium text-primary" : "text-ink"}`}>
      <Icon name={icon} size={15} className="flex-none text-ink-2" /> {label}
    </button>
  );
  return (
    <div
      ref={p.ref}
      role="columnheader"
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
      title={f?.type === "formula" ? `Công thức: ${f.formula ?? ""}` : onReorder ? "Kéo để đổi vị trí cột" : undefined}
      draggable={!!onReorder && !p.open}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-col", c.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!onReorder || !e.dataTransfer.types.includes("text/x-col")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const from = e.dataTransfer.getData("text/x-col");
        if (from && from !== c.id) onReorder?.(from, c.id);
      }}
      className={`group/h relative flex h-9 items-center justify-center gap-1 border-b border-r border-t border-line-soft bg-surface px-1 text-[13px] text-ink-2 ${onReorder ? "cursor-grab active:cursor-grabbing" : ""} ${over ? "shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
    >
      {f?.type === "formula" && <Icon name="formula" size={13} className="flex-none" />}
      <span className="truncate">{c.label}</span>
      {sorted && <span className="flex-none text-[11px] text-primary" aria-hidden="true">{sorted === "asc" ? "▲" : "▼"}</span>}
      {onColumn && (
        <button
          type="button"
          onClick={() => p.setOpen(!p.open)}
          aria-label={`Tuỳ chọn cột ${c.label}`}
          aria-haspopup="menu"
          aria-expanded={p.open}
          className={`absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded bg-surface text-[15px] leading-none text-ink-2 hover:bg-hover hover:text-ink focus:opacity-100 group-hover/h:opacity-100 max-md:opacity-100 ${p.open ? "opacity-100" : "opacity-0"}`}
        >
          …
        </button>
      )}
      {p.open && (
        <div role="menu" aria-label={`Cột ${c.label}`} className="anim-fade absolute right-0 top-full z-40 mt-1 w-56 rounded-lg bg-surface p-1.5 text-left shadow-panel">
          <p className="px-2 pb-1 pt-0.5 text-[11.5px] font-medium uppercase tracking-wide text-ink-2">{c.label}</p>
          {item("asc", "sort", "Sắp xếp tăng dần", sorted === "asc")}
          {item("desc", "sort", "Sắp xếp giảm dần", sorted === "desc")}
          {sorted && item("clear-sort", "x", "Bỏ sắp xếp")}
          <div className="my-1 h-px bg-line-soft" />
          {canFilter && item("filter", "filter", "Lọc theo cột này")}
          {canGroup && item("group", "board", "Nhóm theo cột này")}
          {item("hide", "eye-off", "Ẩn cột")}
        </div>
      )}
      {onResize && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Đổi độ rộng cột ${c.label}`}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onPointerDown={startResize}
          onDoubleClick={() => onResize(c.id, 0)}
          className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-primary/30"
        />
      )}
    </div>
  );
}

/** Nút "…" cạnh tên nhóm: thu gọn, chọn cả nhóm, xuất nhóm ra Excel. */
function GroupMenu({ group, count, collapsed, allCollapsed, onToggle, onToggleAll, onSelectAll, onExport }: { group: Group; count: number; collapsed: boolean; allCollapsed: boolean; onToggle: () => void; onToggleAll: (collapse: boolean) => void; onSelectAll: () => void; onExport?: () => void }) {
  const p = usePopover();
  const item = (icon: string, label: string, fn: () => void, disabled = false) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => { p.setOpen(false); fn(); }} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] hover:bg-hover disabled:opacity-40">
      <Icon name={icon} size={15} className="flex-none text-ink-2" /> {label}
    </button>
  );
  return (
    <div ref={p.ref} className="relative">
      <button
        type="button"
        onClick={() => p.setOpen(!p.open)}
        aria-label={`Tuỳ chọn nhóm ${group.label}`}
        aria-haspopup="menu"
        aria-expanded={p.open}
        className={`grid h-6 w-6 place-items-center rounded text-[15px] leading-none text-ink-2 hover:bg-hover hover:text-ink focus:opacity-100 group-hover/g:opacity-100 max-md:opacity-100 ${p.open ? "opacity-100" : "opacity-0"}`}
      >
        …
      </button>
      {p.open && (
        <div role="menu" aria-label={`Nhóm ${group.label}`} className="anim-fade absolute left-0 top-full z-40 mt-1 w-60 rounded-lg bg-surface p-1.5 shadow-panel">
          {item("chevron", collapsed ? "Mở nhóm này" : "Thu gọn nhóm này", onToggle)}
          {item("layout", allCollapsed ? "Mở tất cả nhóm" : "Thu gọn tất cả nhóm", () => onToggleAll(!allCollapsed))}
          {item("check", `Chọn cả ${count} mục trong nhóm`, onSelectAll, !count)}
          {onExport && (
            <>
              <div className="my-1 h-px bg-line-soft" />
              {item("download", "Xuất nhóm ra Excel", onExport)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Tìm phần tử cuộn dọc của trang (main trong layout). */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  return (el?.closest("main") as HTMLElement | null) ?? (typeof document !== "undefined" ? (document.scrollingElement as HTMLElement | null) : null);
}

function VirtualRows({ obj, team, rows, cols, template, moneyCols, selected, onSelect, onPatch, onOpen, ext = NO_EXT }: Omit<Props, "groups" | "onCreate"> & { template: string; moneyCols: Set<string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const sc = scrollParentOf(el);
    setScroller(sc);
    if (!el || !sc) return;
    const measure = () => setMargin(el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop);
    measure();
    const ro = new ResizeObserver(measure);
    if (sc.firstElementChild) ro.observe(sc.firstElementChild);
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  const rowH = ext.rowH;
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller, estimateSize: () => ext.rowH, overscan: 12, scrollMargin: margin });
  return (
    <div ref={ref} style={{ height: v.getTotalSize(), position: "relative" }}>
      {v.getVirtualItems().map((it) => {
        const r = rows[it.index];
        return (
          <div key={r.id} style={{ position: "absolute", top: 0, left: 0, transform: `translateY(${it.start - margin}px)` }}>
            <Row obj={obj} team={team} r={r} cols={cols} template={template} moneyCols={moneyCols} on={selected.has(r.id)} onSelect={onSelect} onPatch={onPatch} onOpen={onOpen} ext={ext} tint={ext.tintOf(r)} />
          </div>
        );
      })}
    </div>
  );
}

type RowProps = { obj: ObjectDef; team: string[]; r: RecordDTO; cols: Column[]; template: string; moneyCols: Set<string>; on: boolean; onSelect: Props["onSelect"]; onPatch: Props["onPatch"]; onOpen: Props["onOpen"]; ext: RowExt; tint: string | null };

const Row = memo(function Row({ obj, team, r, cols, template, moneyCols, on, onSelect, onPatch, onOpen, ext, tint }: RowProps) {
  const cellBg = on ? "bg-primary-selected" : "bg-surface group-hover:bg-[var(--row-hover)]";
  // Màu theo điều kiện: phủ một lớp màu nhạt lên các ô không phải nhãn màu.
  const tintStyle = tint && !on ? { backgroundImage: `linear-gradient(${tint}2e, ${tint}2e)` } : undefined;
  const h = { height: ext.rowH };
  return (
    <div
      role="row"
      className="group grid"
      style={{ gridTemplateColumns: template }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("input, textarea")) return;
        e.preventDefault();
        ext.onRowMenu(r, e.clientX, e.clientY);
      }}
    >
      <div role="cell" className={`sticky left-0 z-10 flex items-center border-b border-r border-line-soft ${cellBg}`} style={{ ...h, ...tintStyle, ...(tint ? { boxShadow: `inset 4px 0 0 ${tint}` } : {}) }}>
        <span className="grid h-full flex-none place-items-center" style={{ width: CHECK_W }}>
          <input type="checkbox" aria-label={`Chọn ${r.title}`} checked={on} onChange={(e) => onSelect([r.id], e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        </span>
        <div className="h-full min-w-0 flex-1">
          <InputCell field={{ type: "text", label: obj.itemLabel }} value={r.title} onSave={(v) => onPatch(r.id, { title: String(v) })} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
            ext.onRowMenu(r, b.left, b.bottom + 4);
          }}
          className="flex h-7 w-7 flex-none items-center justify-center rounded text-[15px] leading-none text-ink-2 opacity-0 hover:bg-hover hover:text-ink focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
          aria-label={`Thao tác với ${r.title}`}
          aria-haspopup="menu"
        >
          …
        </button>
        <button type="button" onClick={() => onOpen(r.id)} className="mr-1 flex h-7 flex-none items-center gap-1 rounded px-1.5 text-[12.5px] text-ink-2 opacity-0 hover:bg-hover hover:text-primary focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" aria-label={`Mở chi tiết ${r.title}`}>
          <Icon name="open" size={14} /> <span className="max-md:hidden">Mở</span>
        </button>
        {r.updates > 0 && <span className="mr-2 flex-none rounded-full bg-primary px-1.5 text-[11px] text-white tnum">{r.updates}</span>}
      </div>
      {cols.map((c) => (
        <div key={c.id} role="cell" className={`min-w-0 border-b border-r border-line-soft ${c.id === "status" || fieldOf(c)?.type === "select" ? "" : cellBg}`} style={c.id === "status" || fieldOf(c)?.type === "select" ? h : { ...h, ...tintStyle }}>
          {(() => {
            const f = fieldOf(c);
            const cell = <CellFor obj={obj} team={team} r={r} c={c} money={moneyCols.has(c.id)} onPatch={onPatch} />;
            // Trường chỉ xem: vẫn hiện giá trị nhưng chặn mọi thao tác sửa (server cũng bỏ qua nếu có gửi lên).
            return f && ext.readOnly?.has(f.key) ? (
              <div className="h-full cursor-not-allowed" title="Chỉ xem: bạn không được sửa trường này">
                <div inert className="h-full">
                  {cell}
                </div>
              </div>
            ) : (
              cell
            );
          })()}
        </div>
      ))}
    </div>
  );
});

function CellFor({ obj, team, r, c, money, onPatch }: { obj: ObjectDef; team: string[]; r: RecordDTO; c: Column; money: boolean; onPatch: Props["onPatch"] }) {
  const f = fieldOf(c);
  if (f) return <FieldCell field={f} value={r.data[f.key]} onSave={(v) => onPatch(r.id, { data: { [f.key]: v } })} computed={f.type === "formula" ? formulaOf(f, r, obj) : undefined} money={money} />;
  switch (c.id) {
    case "owner":
      return <PersonCell team={team} value={r.ownerName} onPick={(v) => onPatch(r.id, { ownerName: v })} />;
    case "status":
      return <LabelCell options={obj.statuses} value={r.status} onPick={(k) => onPatch(r.id, { status: k })} />;
    case "amount":
      return <InputCell field={{ type: "money", label: obj.amountLabel }} value={r.amount} onSave={(v) => onPatch(r.id, { amount: Number(v) })} />;
    case "winProb":
      return <WinProb value={r.winProb} />;
    case "score":
      return (
        <div className="grid h-full place-items-center">
          <ScorePill score={r.score} />
        </div>
      );
    case "updated":
      return (
        <div className="grid h-full place-items-center text-[12.5px] text-ink-2" suppressHydrationWarning>
          {ago(r.updatedAt)}
        </div>
      );
  }
  return null;
}

export function WinProb({ value, compact }: { value: number | null; compact?: boolean }) {
  if (value === null || value === undefined) return <div className="grid h-full place-items-center text-[12.5px] text-ink-2">{compact ? "" : "–"}</div>;
  const c = value >= 70 ? "#00c875" : value >= 40 ? "#fdab3d" : "#df2f4a";
  return (
    <div className="flex h-full items-center gap-2 px-2.5" title={`Khả năng chốt ${value}%`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: c }} />
      </span>
      <span className="w-9 text-right text-[12.5px] tnum">{value}%</span>
    </div>
  );
}

export function ScorePill({ score }: { score: number }) {
  const h = heat(score);
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-medium text-white tnum" style={{ background: color(h.color).bg }}>
      {h.label} · {score}
    </span>
  );
}

function Sum({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <span className="text-[13px] tnum">
      <b className="font-semibold text-ink">{money ? vnd(value) : (Math.round(value * 100) / 100).toLocaleString("vi-VN")}</b> <span className="text-[11.5px] text-ink-2">{label}</span>
    </span>
  );
}

function SumRow({ obj, rows, cols, template, moneyCols }: { obj: ObjectDef; rows: RecordDTO[]; cols: Column[]; template: string; moneyCols: Set<string> }) {
  const cells = useMemo(
    () =>
      cols.map((col) => {
        const f = fieldOf(col);
        if (f?.type === "number" || f?.type === "money") return <Sum label="tổng" value={rows.reduce((a, r) => a + (Number(r.data[f.key]) || 0), 0)} money={f.type === "money"} />;
        if (f?.type === "formula") {
          let n = 0;
          let any = false;
          for (const r of rows) {
            const x = formulaNumber(f, r, obj);
            if (x !== null) {
              n += x;
              any = true;
            }
          }
          return any ? <Sum label="tổng" value={n} money={moneyCols.has(col.id)} /> : null;
        }
        if (f?.type === "checkbox") {
          const k = rows.filter((r) => Number(r.data[f.key])).length;
          return <span className="text-[12.5px] text-ink-2 tnum" title={`${k}/${rows.length} mục đã tích`}><b className="font-semibold text-ink">{k}</b>/{rows.length} đã tích</span>;
        }
        if (f?.type === "progress") {
          const xs = rows.filter((r) => r.data[f.key] !== undefined && r.data[f.key] !== "");
          if (!xs.length) return null;
          const avg = Math.round(xs.reduce((a, r) => a + (Number(r.data[f.key]) || 0), 0) / xs.length);
          return (
            <span className="flex w-[120px] items-center gap-1.5" title={`Tiến độ trung bình ${avg}%`}>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft"><span className="block h-full rounded-full bg-[#579bfc]" style={{ width: `${avg}%` }} /></span>
              <span className="text-[12px] text-ink-2 tnum">TB {avg}%</span>
            </span>
          );
        }
        if (f?.type === "select" && f.options.length) {
          const counted = f.options.map((o) => ({ o, k: rows.filter((r) => String(r.data[f.key] ?? "") === o.label).length })).filter((x) => x.k);
          const n = counted.reduce((a, x) => a + x.k, 0);
          return (
            <div className="flex h-5 w-[120px] overflow-hidden rounded-sm" title={`${n}/${rows.length} mục có ${f.label.toLowerCase()}`}>
              {counted.map(({ o, k }) => (
                <span key={o.label} style={{ width: `${(k / rows.length) * 100}%`, background: color(o.color).bg }} title={`${o.label}: ${k}`} />
              ))}
              {n < rows.length && <span className="flex-1" style={{ background: "var(--line-soft)" }} title={`Trống: ${rows.length - n}`} />}
            </div>
          );
        }
        if (col.id === "status")
          return (
            <div className="flex h-5 w-[120px] overflow-hidden rounded-sm" title={`${rows.length} mục`}>
              {obj.statuses.map((s) => {
                const k = rows.filter((r) => r.status === s.key).length;
                return k ? <span key={s.key} style={{ width: `${(k / rows.length) * 100}%`, background: color(s.color).bg }} title={`${s.label}: ${k}`} /> : null;
              })}
              {!rows.length && <span className="flex-1" style={{ background: "var(--line-soft)" }} />}
            </div>
          );
        if (col.id === "amount") return <Sum label="tổng" value={rows.reduce((a, r) => a + r.amount, 0)} money />;
        if (col.id === "score") return <span className="text-[12.5px] text-ink-2">TB {rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0}</span>;
        if (col.id === "winProb") {
          const xs = rows.filter((r) => r.winProb !== null);
          return xs.length ? <span className="text-[12.5px] text-ink-2">TB {Math.round(xs.reduce((a, r) => a + (r.winProb ?? 0), 0) / xs.length)}%</span> : null;
        }
        return null;
      }),
    [cols, rows, obj, moneyCols],
  );
  return (
    <div role="row" className="grid" style={{ gridTemplateColumns: template }}>
      <div className="sticky left-0 z-10 h-9 bg-surface" />
      {cells.map((x, i) => (
        <div key={cols[i].id} className="flex h-9 items-center justify-center px-2">
          {x}
        </div>
      ))}
    </div>
  );
}

function AddRow({ label, onAdd }: { label: string; onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  const submit = () => {
    if (v.trim()) {
      onAdd(v.trim());
      setV("");
    }
  };
  return (
    <input
      aria-label={`Thêm ${label.toLowerCase()}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && submit()}
      onBlur={submit}
      placeholder={`+ Thêm ${label.toLowerCase()}`}
      className="h-full w-full bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-2 focus:bg-surface"
    />
  );
}
