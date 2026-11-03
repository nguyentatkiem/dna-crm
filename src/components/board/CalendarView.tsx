"use client";

import { useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { Icon } from "../Icon";

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Lịch tháng theo trường ngày đầu tiên của bảng; mỗi mục là một nhãn màu theo trạng thái. */
export function CalendarView({ rows, obj, fieldKey, onOpen }: { rows: RecordDTO[]; obj: ObjectDef; fieldKey: string; onOpen: (id: string) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1);
  const todayKey = new Date().toDateString();
  const byDay = new Map<number, RecordDTO[]>();
  for (const r of rows) {
    const v = String(r.data[fieldKey] ?? "");
    const d = v ? new Date(v) : null;
    if (d && !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m) byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), r]);
  }
  const noDate = rows.filter((r) => !r.data[fieldKey]).length;

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" className="btn-outline h-8 w-8 justify-center p-0" aria-label="Tháng trước" onClick={() => setCursor(new Date(y, m - 1, 1))}>
          <Icon name="chevron" size={16} className="rotate-90" />
        </button>
        <button type="button" className="btn-outline h-8 w-8 justify-center p-0" aria-label="Tháng sau" onClick={() => setCursor(new Date(y, m + 1, 1))}>
          <Icon name="chevron" size={16} className="-rotate-90" />
        </button>
        <h2 className="text-[18px] font-semibold">Tháng {m + 1}/{y}</h2>
        <button type="button" className="btn-ghost text-primary" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Hôm nay
        </button>
        {noDate > 0 && <span className="ml-auto text-[13px] text-ink-2">{noDate} mục chưa có ngày</span>}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-lg border border-line-soft">
          {DAYS.map((d) => (
            <div key={d} className="border-b border-line-soft bg-surface-2 px-2 py-1.5 text-center text-[12.5px] text-ink-2">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            const inMonth = day >= 1 && day <= days;
            const isToday = inMonth && new Date(y, m, day).toDateString() === todayKey;
            return (
              <div key={i} className={`min-h-[110px] border-b border-r border-line-soft p-1.5 ${inMonth ? "" : "bg-surface-2"}`}>
                {inMonth && (
                  <>
                    <span className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-[12.5px] ${isToday ? "bg-primary text-white" : "text-ink-2"}`}>{day}</span>
                    <div className="grid gap-1">
                      {(byDay.get(day) ?? []).map((r) => {
                        const st = obj.statuses.find((s) => s.key === r.status);
                        const c = color(st?.color);
                        return (
                          <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="truncate rounded px-1.5 py-0.5 text-left text-[12px]" style={{ background: c.bg, color: c.fg }} title={`${r.title} · ${st?.label}`}>
                            {r.title}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
