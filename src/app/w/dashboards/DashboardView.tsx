"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/Icon";
import {
  GROUP_KEYS,
  GROUP_LABEL,
  KPI_KEYS,
  KPI_LABEL,
  LIBRARY,
  RANGES,
  RANGE_LABEL,
  RANK_KEYS,
  RANK_LABEL,
  SERIES_KEYS,
  SERIES_LABEL,
  libraryOf,
  newId,
  pack,
  type Widget,
  type WidgetConfig,
  type WidgetData,
  type WidgetType,
} from "./catalog";
import { WidgetBody } from "./WidgetView";

type Opt = { key: string; label: string };
type Options = { objects: Opt[]; team: string[]; channels: Opt[] };
type Props = {
  dashboard: { id: string; name: string; isDefault: boolean };
  others: { id: string; name: string; isDefault: boolean }[];
  initialWidgets: Widget[];
  initialData: Record<string, WidgetData>;
  startEditing: boolean;
  options: Options;
};

const ROW = 76;
const GAP = 12;
const GRID_CSS = `.dash-grid{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:${ROW}px;gap:${GAP}px}
.dash-grid>.dash-tile{grid-row:span var(--h)}
@media (max-width:767px){.dash-grid>.dash-tile{grid-row:span min(var(--h),4)}}
@media (min-width:768px){.dash-grid{grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-flow:dense}.dash-grid>.dash-tile{grid-column:span var(--w)}}`;

const NO_RANGE: WidgetType[] = ["overdue", "activity"];
const RECORD_BASED: WidgetType[] = ["kpi", "goal", "bar", "line", "area", "pie", "donut", "funnel", "leaderboard", "table"];

function subtitle(w: Widget) {
  const parts: string[] = [];
  if (!NO_RANGE.includes(w.type)) parts.push(RANGE_LABEL[w.config.range ?? (w.type === "goal" ? "month" : "30d")]);
  if (w.config.owner) parts.push(w.config.owner);
  if (w.config.channel) parts.push(w.config.channel);
  return parts.join(" · ");
}

export function DashboardView({ dashboard, others, initialWidgets, initialData, startEditing, options }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialWidgets);
  const [widgets, setWidgets] = useState(initialWidgets);
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState(startEditing);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(widgets) !== JSON.stringify(saved);

  // Dữ liệu ban đầu do server tính; khi router.refresh() trả về số mới thì cập nhật theo.
  useEffect(() => setData(initialData), [initialData]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const preview = useCallback(async (w: Widget) => {
    const res = await fetch("/api/dashboards/widget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: w.type, config: w.config }) });
    const d = await res.json().catch(() => ({}));
    setData((m) => ({ ...m, [w.id]: res.ok ? d.data : { kind: "error", message: d.error ?? "Không tải được dữ liệu" } }));
  }, []);

  function addWidget(type: WidgetType, at?: number) {
    const lib = libraryOf(type);
    const w: Widget = { id: newId(), type, title: lib.title, x: 0, y: 0, w: lib.w, h: lib.h, config: { ...lib.config } };
    setWidgets((ws) => {
      const next = [...ws];
      next.splice(at ?? next.length, 0, w);
      return pack(next);
    });
    setSelected(w.id);
    preview(w);
  }
  function update(id: string, patch: Partial<Widget>, refetch = false) {
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    if (refetch) {
      const cur = widgets.find((w) => w.id === id);
      if (cur) preview({ ...cur, ...patch });
    }
  }
  function remove(id: string) {
    setWidgets((ws) => pack(ws.filter((w) => w.id !== id)));
    if (selected === id) setSelected(null);
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const a = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (a.startsWith("lib:")) {
      if (!over) return;
      const idx = widgets.findIndex((w) => w.id === over);
      addWidget(a.slice(4) as WidgetType, idx >= 0 ? idx : undefined);
      return;
    }
    if (!over || a === over) return;
    setWidgets((ws) => {
      const from = ws.findIndex((w) => w.id === a);
      const to = ws.findIndex((w) => w.id === over);
      return from < 0 || to < 0 ? ws : pack(arrayMove(ws, from, to));
    });
  }

  /** Kéo góc để đổi kích thước theo bước lưới 12 cột. */
  function startResize(e: React.PointerEvent, w: Widget) {
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;
    const colW = (grid.clientWidth + GAP) / 12;
    const sx = e.clientX;
    const sy = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const nw = Math.max(2, Math.min(12, w.w + Math.round((ev.clientX - sx) / colW)));
      const nh = Math.max(2, Math.min(8, w.h + Math.round((ev.clientY - sy) / (ROW + GAP))));
      setWidgets((ws) => ws.map((x) => (x.id === w.id && (x.w !== nw || x.h !== nh) ? { ...x, w: nw, h: nh } : x)));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setWidgets((ws) => pack(ws));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/dashboards/${dashboard.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ widgets }) });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMsg(d.error ?? "Không lưu được dashboard");
    setSaved(d.widgets);
    setWidgets(d.widgets);
    setEditing(false);
    setSelected(null);
    setMsg("Đã lưu dashboard.");
  }
  function cancel() {
    if (dirty && !confirm("Bỏ các thay đổi chưa lưu?")) return;
    setWidgets(saved);
    setEditing(false);
    setSelected(null);
  }

  const sel = widgets.find((w) => w.id === selected) ?? null;

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <style>{GRID_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/w/dashboards" className="btn-ghost h-8 w-8 flex-none justify-center p-0" aria-label="Về danh sách dashboard">
            <Icon name="chevron" size={16} className="rotate-90" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold">{dashboard.name}</h1>
            <p className="text-[12.5px] text-ink-2">
              {dashboard.isDefault ? "Dashboard mặc định · " : ""}
              {widgets.length} widget
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && others.length > 1 && (
            <select className="input h-8 w-auto max-w-[12rem]" value={dashboard.id} onChange={(e) => router.push(`/w/dashboards/${e.target.value}`)} aria-label="Chuyển dashboard">
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {editing ? (
            <>
              <button className="btn-outline" onClick={cancel} disabled={saving}>
                Huỷ
              </button>
              <button className="btn-primary" onClick={save} disabled={saving}>
                <Icon name="check" size={16} /> {saving ? "Đang lưu..." : "Lưu dashboard"}
              </button>
            </>
          ) : (
            <>
              <button className="btn-outline" onClick={() => router.refresh()} aria-label="Làm mới số liệu">
                <Icon name="refresh" size={15} /> <span className="hidden sm:inline">Làm mới</span>
              </button>
              <button className="btn-primary" onClick={() => setEditing(true)}>
                <Icon name="edit" size={15} /> Chỉnh sửa
              </button>
            </>
          )}
        </div>
      </div>
      {msg && <p className="mt-2 text-[13px] text-ink-2">{msg}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {editing && <p className="mb-2 text-[12.5px] text-ink-2">Kéo biểu tượng ⠿ để đổi chỗ, kéo góc dưới phải để đổi kích thước, bấm bánh răng để cấu hình.</p>}
            <GridDrop editing={editing}>
              <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div ref={gridRef} className="dash-grid">
                  {widgets.map((w) => (
                    <Tile key={w.id} w={w} data={data[w.id]} editing={editing} active={selected === w.id} onConfig={() => setSelected(w.id)} onRemove={() => remove(w.id)} onResize={(e) => startResize(e, w)} />
                  ))}
                </div>
              </SortableContext>
              {widgets.length === 0 && (
                <div className="grid place-items-center gap-2 rounded-lg border-2 border-dashed border-line p-10 text-center">
                  <Icon name="layout" size={28} className="text-ink-2" />
                  <p className="font-medium">Dashboard đang trống</p>
                  <p className="max-w-md text-[13.5px] text-ink-2">{editing ? "Bấm hoặc kéo một widget từ thư viện vào đây." : "Bấm Chỉnh sửa để thêm widget từ thư viện."}</p>
                  {!editing && (
                    <button className="btn-primary mt-1" onClick={() => setEditing(true)}>
                      Thêm widget
                    </button>
                  )}
                </div>
              )}
            </GridDrop>
          </div>

          {editing && (
            <aside className="card order-first w-full flex-none p-3 lg:sticky lg:top-4 lg:order-none lg:w-72" aria-label="Thư viện widget">
              <p className="label px-1">Thư viện widget</p>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {LIBRARY.map((l) => (
                  <LibraryItem key={l.type} type={l.type} label={l.label} hint={l.hint} icon={l.icon} onAdd={() => addWidget(l.type)} />
                ))}
              </ul>
            </aside>
          )}
        </div>
        <DragOverlay>
          {dragging?.startsWith("lib:") ? (
            <div className="card flex items-center gap-2 p-2 shadow-panel">
              <Icon name={libraryOf(dragging.slice(4) as WidgetType).icon} size={16} className="text-primary" />
              <span className="text-[13px] font-medium">{libraryOf(dragging.slice(4) as WidgetType).label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing && sel && <ConfigDrawer w={sel} data={data[sel.id]} options={options} onClose={() => setSelected(null)} onChange={(patch, refetch) => update(sel.id, patch, refetch)} />}
    </div>
  );
}

function GridDrop({ editing, children }: { editing: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "grid", disabled: !editing });
  return (
    <div ref={setNodeRef} className={`min-h-[120px] rounded-lg ${isOver ? "bg-primary-selected/30" : ""}`}>
      {children}
    </div>
  );
}

function LibraryItem({ type, label, hint, icon, onAdd }: { type: WidgetType; label: string; hint: string; icon: string; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lib:${type}` });
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={onAdd}
        className={`flex w-full min-w-0 cursor-grab items-center gap-2 rounded-md border border-line-soft bg-surface p-2 text-left hover:border-primary hover:bg-hover ${isDragging ? "opacity-40" : ""}`}
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded bg-primary-selected text-primary">
          <Icon name={icon} size={16} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{label}</span>
          <span className="block truncate text-[11.5px] text-ink-2">{hint}</span>
        </span>
      </button>
    </li>
  );
}

function Tile({ w, data, editing, active, onConfig, onRemove, onResize }: { w: Widget; data: WidgetData | undefined; editing: boolean; active: boolean; onConfig: () => void; onRemove: () => void; onResize: (e: React.PointerEvent) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const style = { "--w": w.w, "--h": w.h, transform: CSS.Translate.toString(transform), transition } as React.CSSProperties;
  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`dash-tile card relative flex min-h-0 min-w-0 flex-col p-3 ${editing ? "border-dashed" : ""} ${active ? "ring-2 ring-primary" : ""} ${isDragging ? "z-10 opacity-70 shadow-panel" : ""}`}
      aria-label={w.title}
    >
      <header className="flex min-w-0 items-center gap-1.5">
        {editing && (
          <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} className="grid h-6 w-6 flex-none cursor-grab place-items-center rounded text-ink-2 hover:bg-hover" aria-label={`Kéo để đổi chỗ ${w.title}`}>
            <Icon name="grip" size={14} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold" title={w.title}>
            {w.title}
          </h2>
          {subtitle(w) && <p className="truncate text-[11.5px] text-ink-2">{subtitle(w)}</p>}
        </div>
        {editing && (
          <>
            <button type="button" onClick={onConfig} className="grid h-6 w-6 flex-none place-items-center rounded text-ink-2 hover:bg-hover hover:text-primary" aria-label={`Cấu hình ${w.title}`}>
              <Icon name="settings" size={14} />
            </button>
            <button type="button" onClick={onRemove} className="grid h-6 w-6 flex-none place-items-center rounded text-ink-2 hover:bg-hover hover:text-[#df2f4a]" aria-label={`Xoá ${w.title}`}>
              <Icon name="x" size={14} />
            </button>
          </>
        )}
      </header>
      <div className="mt-2 min-h-0 flex-1">
        <WidgetBody w={w} data={data} />
      </div>
      {editing && (
        <span
          role="separator"
          aria-label={`Đổi kích thước ${w.title}`}
          onPointerDown={onResize}
          className="absolute bottom-0.5 right-0.5 hidden h-4 w-4 cursor-nwse-resize touch-none md:block"
          style={{ background: "linear-gradient(135deg, transparent 50%, var(--ink-2) 50%, var(--ink-2) 60%, transparent 60%, transparent 75%, var(--ink-2) 75%, var(--ink-2) 85%, transparent 85%)" }}
        />
      )}
    </section>
  );
}

function ConfigDrawer({ w, data, options, onClose, onChange }: { w: Widget; data: WidgetData | undefined; options: Options; onClose: () => void; onChange: (patch: Partial<Widget>, refetch?: boolean) => void }) {
  const c = w.config;
  const setCfg = (patch: Partial<WidgetConfig>) => {
    const next = { ...c, ...patch };
    for (const k of Object.keys(next) as (keyof WidgetConfig)[]) if (next[k] === "" || next[k] === undefined) delete next[k];
    onChange({ config: next }, true);
  };
  const chartFamily: WidgetType[] | null = ["bar", "line", "area"].includes(w.type) ? ["bar", "line", "area"] : ["pie", "donut"].includes(w.type) ? ["pie", "donut"] : null;
  const objSelect = (label = "Bảng dữ liệu") => (
    <Field label={label}>
      <select className="input" value={c.objectKey ?? ""} onChange={(e) => setCfg({ objectKey: e.target.value })}>
        {options.objects.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="anim-fade fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <aside className="anim-slide-right flex h-full w-full max-w-[380px] flex-col bg-surface shadow-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cấu hình widget">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <p className="font-semibold">Cấu hình widget</p>
          <button className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="grid flex-1 content-start gap-3 overflow-auto p-4">
          <Field label="Tiêu đề">
            <input className="input" value={w.title} maxLength={80} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          {chartFamily && (
            <div className="grid gap-1">
              <span className="text-[12.5px] text-ink-2">Kiểu biểu đồ</span>
              <div className="flex flex-wrap gap-1.5">
                {chartFamily.map((t) => (
                  <button key={t} type="button" className={`chip ${w.type === t ? "chip-on" : ""}`} onClick={() => onChange({ type: t })}>
                    {libraryOf(t).label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(w.type === "kpi" || w.type === "goal") && (
            <Field label="Chỉ số">
              <select className="input" value={c.metric ?? "won_revenue"} onChange={(e) => setCfg({ metric: e.target.value as WidgetConfig["metric"] })}>
                {KPI_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {KPI_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {w.type === "goal" && (
            <Field label="Mục tiêu">
              <input className="input tnum" type="number" min={0} value={c.target ?? 0} onChange={(e) => setCfg({ target: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          )}
          {chartFamily?.[0] === "bar" && (
            <Field label="Dữ liệu">
              <select className="input" value={c.series ?? "new_contacts_daily"} onChange={(e) => setCfg({ series: e.target.value as WidgetConfig["series"] })}>
                {SERIES_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {SERIES_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {chartFamily?.[0] === "pie" && (
            <>
              {objSelect()}
              <Field label="Chia theo">
                <select className="input" value={c.groupBy ?? "status"} onChange={(e) => setCfg({ groupBy: e.target.value as WidgetConfig["groupBy"] })}>
                  {GROUP_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {GROUP_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Đo bằng">
                <select className="input" value={c.measure ?? "count"} onChange={(e) => setCfg({ measure: e.target.value as "count" | "amount" })}>
                  <option value="count">Số lượng</option>
                  <option value="amount">Giá trị</option>
                </select>
              </Field>
            </>
          )}
          {w.type === "funnel" && objSelect()}
          {w.type === "leaderboard" && (
            <Field label="Xếp hạng theo">
              <select className="input" value={c.rankBy ?? "revenue"} onChange={(e) => setCfg({ rankBy: e.target.value as WidgetConfig["rankBy"] })}>
                {RANK_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {RANK_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {w.type === "table" && (
            <>
              {objSelect()}
              <Field label="Sắp xếp">
                <select className="input" value={c.sort ?? "amount"} onChange={(e) => setCfg({ sort: e.target.value as WidgetConfig["sort"] })}>
                  <option value="amount">Giá trị lớn nhất</option>
                  <option value="score">Điểm cao nhất</option>
                  <option value="createdAt">Mới nhất</option>
                </select>
              </Field>
            </>
          )}
          {["leaderboard", "table", "overdue", "activity"].includes(w.type) && (
            <Field label="Số dòng">
              <input className="input tnum" type="number" min={1} max={50} value={c.limit ?? 6} onChange={(e) => setCfg({ limit: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
            </Field>
          )}

          <p className="label mt-2">Bộ lọc</p>
          {!NO_RANGE.includes(w.type) && (
            <Field label="Khoảng thời gian">
              <select className="input" value={c.range ?? (w.type === "goal" ? "month" : "30d")} onChange={(e) => setCfg({ range: e.target.value as WidgetConfig["range"] })}>
                {RANGES.map((k) => (
                  <option key={k} value={k}>
                    {RANGE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {w.type !== "activity" && (
            <Field label="Người phụ trách">
              <select className="input" value={c.owner ?? ""} onChange={(e) => setCfg({ owner: e.target.value })}>
                <option value="">Tất cả</option>
                {options.team.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {RECORD_BASED.includes(w.type) && (
            <Field label="Kênh">
              <select className="input" value={c.channel ?? ""} onChange={(e) => setCfg({ channel: e.target.value })}>
                <option value="">Tất cả kênh</option>
                {options.channels.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <p className="label mt-2">Kích thước</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rộng (cột / 12)">
              <input className="input tnum" type="number" min={2} max={12} value={w.w} onChange={(e) => onChange({ w: Math.max(2, Math.min(12, Number(e.target.value) || 2)) })} />
            </Field>
            <Field label="Cao (hàng)">
              <input className="input tnum" type="number" min={2} max={8} value={w.h} onChange={(e) => onChange({ h: Math.max(2, Math.min(8, Number(e.target.value) || 2)) })} />
            </Field>
          </div>

          <p className="label mt-2">Xem trước</p>
          <div className="card flex flex-col p-3" style={{ height: Math.max(2, Math.min(w.h, 4)) * ROW }}>
            <WidgetBody w={w} data={data} />
          </div>
        </div>
        <div className="border-t border-line-soft p-3">
          <button className="btn-primary w-full justify-center" onClick={onClose}>
            Xong
          </button>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      {children}
    </label>
  );
}
