"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { addDays, parseYmd, ymd } from "./model";

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
type Mode = "month" | "week";

/**
 * Lịch theo một trường ngày của bảng; mỗi mục là nhãn màu theo trạng thái.
 * Kéo thả mục sang ngày khác để đổi ngày (lưu vào data[fieldKey]). Xem theo tháng hoặc tuần.
 */
export function CalendarView({
  rows,
  obj,
  fieldKey,
  onOpen,
  onMove,
  onFieldChange,
}: {
  rows: RecordDTO[];
  obj: ObjectDef;
  fieldKey: string;
  onOpen: (id: string) => void;
  onMove?: (id: string, date: string) => void;
  onFieldChange?: (k: string) => void;
}) {
  const dateFields = obj.fields.filter((f) => f.type === "date");
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), useSensor(KeyboardSensor));

  const byDay = useMemo(() => {
    const m = new Map<string, RecordDTO[]>();
    for (const r of rows) {
      const d = parseYmd(r.data[fieldKey]);
      if (d) m.set(ymd(d), [...(m.get(ymd(d)) ?? []), r]);
    }
    return m;
  }, [rows, fieldKey]);
  const noDate = rows.filter((r) => !parseYmd(r.data[fieldKey])).length;
  const todayKey = ymd(new Date());

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  let cells: { date: Date; inRange: boolean }[];
  let title: string;
  if (mode === "month") {
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const n = new Date(y, m + 1, 0).getDate();
    cells = Array.from({ length: Math.ceil((offset + n) / 7) * 7 }, (_, i) => {
      const date = addDays(first, i - offset);
      return { date, inRange: date.getMonth() === m };
    });
    title = `Tháng ${m + 1}/${y}`;
  } else {
    const start = addDays(cursor, -((cursor.getDay() + 6) % 7));
    cells = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), inRange: true }));
    const end = cells[6].date;
    title = `${start.getDate()}/${start.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`;
  }
  const step = (dir: number) => setCursor(mode === "month" ? new Date(y, m + dir, 1) : addDays(cursor, dir * 7));

  function onEnd(e: DragEndEvent) {
    setActive(null);
    const id = String(e.active.id);
    const to = e.over ? String(e.over.id) : null;
    const r = rows.find((x) => x.id === id);
    if (!r || !to || !onMove) return;
    const cur = parseYmd(r.data[fieldKey]);
    if (cur && ymd(cur) === to) return;
    onMove(id, to);
  }
  const activeRec = active ? rows.find((r) => r.id === active) : null;

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-outline h-8 w-8 justify-center p-0" aria-label={mode === "month" ? "Tháng trước" : "Tuần trước"} onClick={() => step(-1)}>
          <Icon name="chevron" size={16} className="rotate-90" />
        </button>
        <button type="button" className="btn-outline h-8 w-8 justify-center p-0" aria-label={mode === "month" ? "Tháng sau" : "Tuần sau"} onClick={() => step(1)}>
          <Icon name="chevron" size={16} className="-rotate-90" />
        </button>
        <h2 className="text-[18px] font-semibold">{title}</h2>
        <button type="button" className="btn-ghost text-primary" onClick={() => setCursor(parseYmd(ymd(new Date()))!)}>
          Hôm nay
        </button>
        <div className="flex overflow-hidden rounded border border-line text-[13.5px]" role="group" aria-label="Kiểu xem lịch">
          {(["month", "week"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`h-8 px-3 ${mode === k ? "bg-primary text-white" : "hover:bg-hover"}`}>
              {k === "month" ? "Tháng" : "Tuần"}
            </button>
          ))}
        </div>
        {dateFields.length > 1 && onFieldChange && (
          <select aria-label="Trường ngày hiển thị" value={fieldKey} onChange={(e) => onFieldChange(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13.5px]">
            {dateFields.map((f) => (
              <option key={f.key} value={f.key}>
                Theo {f.label.toLowerCase()}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-[12.5px] text-ink-2">{noDate > 0 ? `${noDate} mục chưa có ngày · ` : ""}Giữ và kéo mục sang ngày khác để dời lịch</span>
      </div>
      <DndContext id={`calendar-${obj.key}`} sensors={sensors} onDragStart={(e) => setActive(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
        <div className="overflow-x-auto">
          <div className={`grid grid-cols-7 overflow-hidden rounded-lg border border-line-soft ${mode === "month" ? "min-w-[760px]" : "min-w-[700px]"}`}>
            {DAYS.map((d, i) => (
              <div key={d} className="border-b border-line-soft bg-surface-2 px-2 py-1.5 text-center text-[12.5px] text-ink-2">
                {d}
                {mode === "week" && <span className="ml-1 tnum">{cells[i].date.getDate()}/{cells[i].date.getMonth() + 1}</span>}
              </div>
            ))}
            {cells.map((c) => {
              const key = ymd(c.date);
              return (
                <DayCell key={key} id={key} dim={!c.inRange} tall={mode === "week"} isToday={key === todayKey} day={c.date.getDate()} showNum={mode === "month"}>
                  {(byDay.get(key) ?? []).map((r) => (
                    <Item key={r.id} r={r} obj={obj} onOpen={onOpen} detailed={mode === "week"} />
                  ))}
                </DayCell>
              );
            })}
          </div>
        </div>
        <DragOverlay>{activeRec ? <Chip r={activeRec} obj={obj} lifted /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function DayCell({ id, dim, tall, isToday, day, showNum, children }: { id: string; dim: boolean; tall: boolean; isToday: boolean; day: number; showNum: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`border-b border-r border-line-soft p-1.5 transition-colors ${tall ? "min-h-[360px]" : "min-h-[110px]"} ${dim ? "bg-surface-2" : ""} ${isOver ? "bg-primary-selected" : ""}`}>
      {showNum && <span className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-[12.5px] ${isToday ? "bg-primary text-white" : dim ? "text-ink-2 opacity-60" : "text-ink-2"}`}>{day}</span>}
      {!showNum && isToday && <span className="mb-1 block text-[11.5px] font-medium text-primary">Hôm nay</span>}
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function Item({ r, obj, onOpen, detailed }: { r: RecordDTO; obj: ObjectDef; onOpen: (id: string) => void; detailed: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: r.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(r.id)} style={{ opacity: isDragging ? 0.3 : 1 }} className="touch-manipulation">
      <Chip r={r} obj={obj} detailed={detailed} />
    </div>
  );
}

function Chip({ r, obj, lifted, detailed }: { r: RecordDTO; obj: ObjectDef; lifted?: boolean; detailed?: boolean }) {
  const st = obj.statuses.find((s) => s.key === r.status);
  const c = color(st?.color);
  return (
    <div className={`flex cursor-grab items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-left text-[12px] ${lifted ? "rotate-2 shadow-panel" : ""} ${detailed ? "py-1.5" : ""}`} style={{ background: c.bg, color: c.fg }} title={`${r.title} · ${st?.label ?? ""}`}>
      {detailed && <Avatar name={r.ownerName} size={18} />}
      <span className="truncate">{r.title}</span>
    </div>
  );
}
