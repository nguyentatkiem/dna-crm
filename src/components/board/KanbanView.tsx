"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { vnd } from "@/lib/format";
import { Avatar } from "../Avatar";
import { ScorePill } from "./TableView";
import { readLS, writeLS } from "./model";

type Props = { obj: ObjectDef; rows: RecordDTO[]; onMove: (id: string, status: string) => void; onOpen: (id: string) => void; onAdd: (t: string, status: string) => void };
type Order = Record<string, string[]>;

/** Sắp lại thứ tự theo trạng thái hiện tại của bản ghi, giữ thứ tự cũ người dùng đã kéo. */
function syncOrder(prev: Order, obj: ObjectDef, rows: RecordDTO[]): Order {
  const next: Order = {};
  for (const s of obj.statuses) {
    const ids = new Set(rows.filter((r) => r.status === s.key).map((r) => r.id));
    const kept = (prev[s.key] ?? []).filter((id) => ids.has(id));
    const keptSet = new Set(kept);
    next[s.key] = [...kept, ...rows.filter((r) => r.status === s.key && !keptSet.has(r.id)).map((r) => r.id)];
  }
  return next;
}

/** Kanban kéo thả bằng dnd-kit: kéo giữa cột để đổi trạng thái, sắp thứ tự trong cột (lưu trên máy). */
export function KanbanView({ obj, rows, onMove, onOpen, onAdd }: Props) {
  const lsKey = `kanban-order:${obj.key}`;
  const [order, setOrder] = useState<Order>(() => syncOrder({}, obj, rows));
  const [active, setActive] = useState<string | null>(null);
  const from = useRef<string | null>(null);
  const loaded = useRef(false);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  useEffect(() => {
    setOrder((o) => {
      const base = loaded.current ? o : readLS<Order>(lsKey, o);
      loaded.current = true;
      return syncOrder(base, obj, rows);
    });
  }, [rows, obj, lsKey]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Trên điện thoại: giữ 220ms mới kéo, để vẫn cuộn ngang bình thường.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colOf = (id: string, o: Order = order) => (o[id] ? id : Object.keys(o).find((k) => o[k].includes(id)) ?? null);

  function onStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActive(id);
    from.current = colOf(id);
  }

  function onOver(e: DragOverEvent) {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    setOrder((o) => {
      const a = colOf(id, o);
      const b = colOf(overId, o);
      if (!a || !b || a === b) return o;
      const src = o[a].filter((x) => x !== id);
      const dst = [...o[b]];
      const idx = o[b].includes(overId) ? dst.indexOf(overId) : dst.length;
      dst.splice(idx < 0 ? dst.length : idx, 0, id);
      return { ...o, [a]: src, [b]: dst };
    });
  }

  function onEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActive(null);
    const start = from.current;
    from.current = null;
    if (!overId) {
      setOrder((o) => syncOrder(o, obj, rows));
      return;
    }
    let next = order;
    const col = colOf(id);
    if (col && order[col].includes(overId) && overId !== id) {
      next = { ...order, [col]: arrayMove(order[col], order[col].indexOf(id), order[col].indexOf(overId)) };
      setOrder(next);
    }
    writeLS(lsKey, next);
    if (col && start && col !== start) onMove(id, col);
  }

  const activeRec = active ? byId.get(active) : null;

  return (
    <DndContext id={`kanban-${obj.key}`} sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setActive(null); setOrder((o) => syncOrder(o, obj, rows)); }}>
      <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-6">
        {obj.statuses.map((s) => {
          const ids = order[s.key] ?? [];
          const list = ids.map((id) => byId.get(id)).filter((r): r is RecordDTO => !!r);
          return <Column key={s.key} obj={obj} statusKey={s.key} label={s.label} colorKey={s.color} list={list} onOpen={onOpen} onAdd={(t) => onAdd(t, s.key)} />;
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {activeRec ? (
          <div className="rotate-[2.5deg] scale-[1.03] cursor-grabbing">
            <Card obj={obj} r={activeRec} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ obj, statusKey, label, colorKey, list, onOpen, onAdd }: { obj: ObjectDef; statusKey: string; label: string; colorKey: string; list: RecordDTO[]; onOpen: (id: string) => void; onAdd: (t: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: statusKey });
  const c = color(colorKey);
  const total = list.reduce((a, r) => a + r.amount, 0);
  return (
    <div ref={setNodeRef} className={`flex w-[272px] flex-none snap-start flex-col rounded-lg bg-surface-2 transition-shadow max-sm:w-[82vw] ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="rounded-t-lg px-3 py-2 text-[14px] font-medium" style={{ background: c.bg, color: c.fg }}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          <span className="tnum opacity-90">{list.length}</span>
        </div>
        {obj.amountLabel && <div className="text-[12.5px] font-normal tnum opacity-90">Tổng {vnd(total)}</div>}
      </div>
      <SortableContext items={list.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[200px] flex-col gap-2 p-2">
          {list.map((r) => (
            <SortableCard key={r.id} obj={obj} r={r} onOpen={onOpen} />
          ))}
          {!list.length && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-ink-2">Kéo thẻ vào đây</p>}
          <AddCard onAdd={onAdd} />
        </div>
      </SortableContext>
    </div>
  );
}

const SortableCard = memo(function SortableCard({ obj, r, onOpen }: { obj: ObjectDef; r: RecordDTO; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(r.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen(r.id);
      }}
      aria-label={`${r.title}. Giữ và kéo để đổi trạng thái, Enter để mở`}
      className="touch-manipulation select-none"
    >
      <Card obj={obj} r={r} />
    </div>
  );
});

function Card({ obj, r, overlay }: { obj: ObjectDef; r: RecordDTO; overlay?: boolean }) {
  const preview = obj.fields.filter((f) => f.type !== "phone" && f.type !== "formula" && f.type !== "longtext").slice(0, 2);
  return (
    <div className={`grid cursor-grab gap-2 rounded-lg border bg-surface p-3 text-left active:cursor-grabbing ${overlay ? "border-primary shadow-panel" : "border-line-soft shadow-card hover:border-line"}`}>
      <span className="font-medium leading-snug">{r.title}</span>
      {preview.map((f) =>
        r.data[f.key] ? (
          <span key={f.key} className="truncate text-[12.5px] text-ink-2">
            {f.label}: <span className="text-ink">{f.type === "money" ? vnd(Number(r.data[f.key])) : String(r.data[f.key])}</span>
          </span>
        ) : null,
      )}
      {obj.amountLabel && r.winProb !== null && (
        <span className="grid gap-1">
          <span className="flex justify-between text-[12px] text-ink-2">
            Khả năng chốt <b className="text-ink tnum">{r.winProb}%</b>
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-line-soft">
            <span className="block h-full rounded-full" style={{ width: `${r.winProb}%`, background: r.winProb >= 70 ? "#00c875" : r.winProb >= 40 ? "#fdab3d" : "#df2f4a" }} />
          </span>
        </span>
      )}
      <span className="flex items-center justify-between">
        <Avatar name={r.ownerName} size={22} />
        {obj.amountLabel ? <b className="text-[13px] tnum">{vnd(r.amount)}</b> : obj.key === "contacts" ? <ScorePill score={r.score} /> : null}
      </span>
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      aria-label="Thêm thẻ"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          onAdd(v.trim());
          setV("");
        }
      }}
      placeholder="+ Thêm mục"
      className="h-9 rounded-lg bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-2 hover:bg-surface focus:bg-surface"
    />
  );
}
