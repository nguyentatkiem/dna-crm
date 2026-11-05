"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { addDays, diffDays, groupsOf, parseYmd, readLS, writeLS, ymd, type GroupBy, type Patch } from "./model";

type Scale = "day" | "week" | "month";
const PX: Record<Scale, number> = { day: 36, week: 14, month: 4.5 };
const PAD: Record<Scale, number> = { day: 4, week: 10, month: 25 };
const CREATED = "__created";
const PLUS7 = "__plus7";
const MONTHS = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];

type Props = { obj: ObjectDef; team: string[]; rows: RecordDTO[]; groupBy: GroupBy; onPatch: (id: string, b: Patch) => void; onOpen: (id: string) => void };
type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; delta: number; moved: boolean };

/** Timeline/Gantt tự viết: thanh theo trạng thái, kéo để dời ngày, kéo mép phải để đổi hạn. */
export function GanttView({ obj, team, rows, groupBy, onPatch, onOpen }: Props) {
  const dateFields = obj.fields.filter((f) => f.type === "date");
  const lsKey = `gantt:${obj.key}`;
  const [cfg, setCfg] = useState<{ start: string; end: string; scale: Scale }>({ start: CREATED, end: dateFields[0]?.key ?? PLUS7, scale: "week" });
  useEffect(() => {
    const saved = readLS<Partial<typeof cfg>>(lsKey, {});
    const valid = (k?: string) => !!k && (k === CREATED || k === PLUS7 || dateFields.some((f) => f.key === k));
    setCfg((c) => ({ start: valid(saved.start) ? saved.start! : c.start, end: valid(saved.end) ? saved.end! : c.end, scale: saved.scale ?? c.scale }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);
  const set = (p: Partial<typeof cfg>) =>
    setCfg((c) => {
      const n = { ...c, ...p };
      writeLS(lsKey, n);
      return n;
    });

  const px = PX[cfg.scale];
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const today = useMemo(() => parseYmd(ymd(new Date()))!, []);

  const spans = useMemo(() => {
    const m = new Map<string, { s: Date; e: Date } | null>();
    for (const r of rows) {
      const created = parseYmd(r.createdAt);
      const s0 = cfg.start === CREATED ? created : parseYmd(r.data[cfg.start]);
      const e0 = cfg.end === PLUS7 ? (s0 ? addDays(s0, 7) : null) : parseYmd(r.data[cfg.end]);
      const s = s0 ?? e0;
      const e = e0 ?? s0;
      if (!s || !e) m.set(r.id, null);
      else m.set(r.id, s <= e ? { s, e } : { s: e, e: s });
    }
    return m;
  }, [rows, cfg.start, cfg.end]);

  const [from, days] = useMemo(() => {
    let lo = today;
    let hi = addDays(today, 14);
    for (const v of spans.values()) {
      if (!v) continue;
      if (v.s < lo) lo = v.s;
      if (v.e > hi) hi = v.e;
    }
    let start = addDays(lo, -PAD[cfg.scale]);
    if (cfg.scale === "week") start = addDays(start, -((start.getDay() + 6) % 7));
    if (cfg.scale === "month") start = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = addDays(hi, PAD[cfg.scale] + (cfg.scale === "month" ? 30 : 7));
    return [start, Math.min(diffDays(end, start), 1500)] as const;
  }, [spans, today, cfg.scale]);

  const width = days * px;
  const todayX = diffDays(today, from) * px;

  // Mở view là cuộn tới hôm nay.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth / 3);
  }, [todayX, cfg.scale]);

  const canStart = cfg.start !== CREATED;
  const canEnd = cfg.end !== PLUS7;
  const groups = groupsOf(obj, team, rows, groupBy, (o) => color(o.color).bg);

  function down(e: React.PointerEvent, id: string, mode: Drag["mode"]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, mode, x0: e.clientX, delta: 0, moved: false });
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const delta = Math.round(dx / px);
    if (delta !== drag.delta || (!drag.moved && Math.abs(dx) > 4)) setDrag({ ...drag, delta, moved: drag.moved || Math.abs(dx) > 4 });
  }
  function up() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      onOpen(d.id);
      return;
    }
    const sp = spans.get(d.id);
    if (!sp || !d.delta) return;
    const { s, e } = preview(sp, d);
    const data: Record<string, string> = {};
    if (canStart && (d.mode === "move" || d.mode === "start")) data[cfg.start] = ymd(s);
    if (canEnd && (d.mode === "move" || d.mode === "end")) data[cfg.end] = ymd(e);
    if (Object.keys(data).length) onPatch(d.id, { data });
  }

  const preview = (sp: { s: Date; e: Date }, d: Drag | null) => {
    if (!d) return sp;
    if (d.mode === "move") return { s: addDays(sp.s, d.delta), e: addDays(sp.e, d.delta) };
    if (d.mode === "start") {
      const s = addDays(sp.s, d.delta);
      return { s: s > sp.e ? sp.e : s, e: sp.e };
    }
    const e = addDays(sp.e, d.delta);
    return { s: sp.s, e: e < sp.s ? sp.s : e };
  };

  // Thước thời gian: hàng trên (tháng/năm), hàng dưới (ngày/tuần/tháng).
  const ticks = useMemo(() => {
    const top: { x: number; w: number; label: string }[] = [];
    const bottom: { x: number; w: number; label: string; weekend?: boolean; today?: boolean }[] = [];
    for (let i = 0; i < days; ) {
      const d = addDays(from, i);
      if (cfg.scale === "month") {
        const y = d.getFullYear();
        const n = Math.min(diffDays(new Date(y + 1, 0, 1), d), days - i);
        top.push({ x: i * px, w: n * px, label: String(y) });
        i += n;
      } else {
        const n = Math.min(diffDays(new Date(d.getFullYear(), d.getMonth() + 1, 1), d), days - i);
        top.push({ x: i * px, w: n * px, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
        i += n;
      }
    }
    for (let i = 0; i < days; ) {
      const d = addDays(from, i);
      if (cfg.scale === "day") {
        bottom.push({ x: i * px, w: px, label: String(d.getDate()), weekend: d.getDay() === 0 || d.getDay() === 6, today: diffDays(d, today) === 0 });
        i++;
      } else if (cfg.scale === "week") {
        const n = Math.min(7, days - i);
        bottom.push({ x: i * px, w: n * px, label: `${d.getDate()}/${d.getMonth() + 1}` });
        i += n;
      } else {
        const n = Math.min(diffDays(new Date(d.getFullYear(), d.getMonth() + 1, 1), d), days - i);
        bottom.push({ x: i * px, w: n * px, label: MONTHS[d.getMonth()] });
        i += n;
      }
    }
    return { top, bottom };
  }, [days, from, px, cfg.scale, today]);

  const noDated = rows.filter((r) => !spans.get(r.id)).length;
  const labelW = "var(--gantt-label)";

  return (
    <div className="mt-4 [--gantt-label:230px] max-sm:[--gantt-label:140px]">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
        <label className="flex items-center gap-1.5">
          <span className="text-ink-2">Bắt đầu</span>
          <select aria-label="Trường ngày bắt đầu" value={cfg.start} onChange={(e) => set({ start: e.target.value })} className="h-8 rounded border border-line bg-surface px-2">
            <option value={CREATED}>Ngày tạo</option>
            {dateFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-ink-2">Kết thúc</span>
          <select aria-label="Trường ngày kết thúc" value={cfg.end} onChange={(e) => set({ end: e.target.value })} className="h-8 rounded border border-line bg-surface px-2">
            {dateFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
            <option value={PLUS7}>Bắt đầu + 7 ngày</option>
          </select>
        </label>
        <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Thang thời gian">
          {(["day", "week", "month"] as const).map((s) => (
            <button key={s} type="button" onClick={() => set({ scale: s })} className={`h-8 px-3 ${cfg.scale === s ? "bg-primary text-white" : "hover:bg-hover"}`}>
              {s === "day" ? "Ngày" : s === "week" ? "Tuần" : "Tháng"}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost text-primary" onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, todayX - scroller.current.clientWidth / 3))}>
          Hôm nay
        </button>
        {noDated > 0 && <span className="ml-auto text-[12.5px] text-ink-2">{noDated} mục chưa có ngày</span>}
      </div>
      {!dateFields.length && (
        <p className="mb-3 rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          Bảng này chưa có trường kiểu Ngày, nên thanh hiển thị từ ngày tạo đến 7 ngày sau. Thêm một cột “Ngày” (ví dụ Hạn chót) trong Cài đặt để kéo đổi lịch.
        </p>
      )}
      {dateFields.length > 0 && !canStart && canEnd && <p className="mb-2 text-[12.5px] text-ink-2">Kéo mép phải của thanh để đổi {dateFields.find((f) => f.key === cfg.end)?.label.toLowerCase()}. Chọn trường bắt đầu là một trường ngày để kéo dời cả thanh.</p>}

      <div ref={scroller} className="relative overflow-x-auto rounded-lg border border-line-soft" onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
        <div className="relative" style={{ width: `calc(${labelW} + ${width}px)` }}>
          {/* Thước */}
          <div className="sticky top-0 z-20 flex border-b border-line-soft bg-surface">
            <div className="sticky left-0 z-30 flex-none border-r border-line-soft bg-surface px-3 py-2 text-[12.5px] text-ink-2" style={{ width: labelW }}>
              {obj.itemLabel}
            </div>
            <div className="relative h-[46px] flex-none" style={{ width }}>
              {ticks.top.map((t) => (
                <span key={`t${t.x}`} className="absolute top-0 h-[22px] truncate border-l border-line-soft px-1.5 text-[12px] font-medium leading-[22px]" style={{ left: t.x, width: t.w }}>
                  {t.label}
                </span>
              ))}
              {ticks.bottom.map((t) => (
                <span key={`b${t.x}`} className={`absolute top-[22px] h-6 truncate border-l border-t border-line-soft text-center text-[11.5px] leading-6 tnum ${t.today ? "font-semibold text-primary" : t.weekend ? "text-ink-2 opacity-70" : "text-ink-2"}`} style={{ left: t.x, width: t.w }}>
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Nền: cuối tuần + vạch hôm nay */}
          <div className="pointer-events-none absolute bottom-0 top-[47px]" style={{ left: labelW, width }}>
            {cfg.scale === "day" && ticks.bottom.filter((t) => t.weekend).map((t) => <span key={t.x} className="absolute inset-y-0 bg-surface-2" style={{ left: t.x, width: t.w }} />)}
            {todayX >= 0 && todayX <= width && (
              <span className="absolute inset-y-0 z-10 w-0.5 bg-[#df2f4a]" style={{ left: todayX + (cfg.scale === "day" ? px / 2 : 0) }}>
                <span className="absolute -left-[18px] top-0 rounded bg-[#df2f4a] px-1 text-[10.5px] font-medium text-white">Hôm nay</span>
              </span>
            )}
          </div>

          {groups.map((g) => {
            const list = rows.filter(g.match);
            if (!list.length) return null;
            return (
              <div key={g.key} className="relative">
                <div className="flex h-9 items-center border-b border-line-soft bg-surface">
                  <span className="sticky left-0 z-10 flex items-center gap-2 bg-surface px-3 text-[14px] font-semibold" style={{ color: g.color, borderLeft: `4px solid ${g.color}`, width: labelW }}>
                    <span className="truncate">{g.label}</span> <span className="text-[12px] font-normal text-ink-2">{list.length}</span>
                  </span>
                </div>
                {list.map((r) => {
                  const sp = spans.get(r.id);
                  const p = sp ? preview(sp, drag?.id === r.id ? drag : null) : null;
                  const st = obj.statuses.find((s) => s.key === r.status);
                  const c = color(st?.color);
                  const x = p ? diffDays(p.s, from) * px : 0;
                  const w = p ? Math.max((diffDays(p.e, p.s) + 1) * px, 8) : 0;
                  const active = drag?.id === r.id;
                  return (
                    <div key={r.id} className="group flex h-10 items-center border-b border-line-soft hover:bg-[var(--row-hover)]">
                      <button type="button" onClick={() => onOpen(r.id)} className="sticky left-0 z-10 flex h-full flex-none items-center gap-2 border-r border-line-soft bg-surface px-3 text-left text-[13.5px] group-hover:bg-[var(--row-hover)]" style={{ width: labelW }}>
                        <Avatar name={r.ownerName} size={20} />
                        <span className="truncate">{r.title}</span>
                      </button>
                      <div className="relative h-full flex-none" style={{ width }}>
                        {p ? (
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={`${r.title}: ${p.s.toLocaleDateString("vi-VN")} – ${p.e.toLocaleDateString("vi-VN")}`}
                            title={`${r.title} · ${st?.label ?? ""}\n${p.s.toLocaleDateString("vi-VN")} → ${p.e.toLocaleDateString("vi-VN")}`}
                            onPointerDown={(e) => (canStart && canEnd ? down(e, r.id, "move") : down(e, r.id, "end"))}
                            onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)}
                            className={`absolute top-1/2 flex h-6 -translate-y-1/2 select-none items-center rounded-full text-[12px] font-medium shadow-card ${canStart && canEnd ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${active ? "ring-2 ring-primary ring-offset-1" : ""}`}
                            style={{ left: x, width: w, background: c.bg, color: c.fg, touchAction: canEnd ? "none" : "auto" }}
                          >
                            {canStart && (
                              <span onPointerDown={(e) => down(e, r.id, "start")} className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize rounded-l-full hover:bg-black/15" aria-hidden="true" />
                            )}
                            <span className={`truncate px-3 ${w < 90 ? "absolute left-full ml-1 text-ink" : ""}`}>{r.title}</span>
                            {canEnd && (
                              <span onPointerDown={(e) => down(e, r.id, "end")} className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize rounded-r-full hover:bg-black/15" aria-hidden="true" />
                            )}
                          </div>
                        ) : (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-ink-2" style={{ left: Math.max(8, todayX - 40) }}>
                            Chưa có ngày
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {!rows.length && (
            <div className="flex items-center gap-2 px-4 py-10 text-ink-2" style={{ paddingLeft: 16 }}>
              <Icon name="gantt" size={18} /> Chưa có mục nào khớp bộ lọc.
            </div>
          )}
        </div>
      </div>
      {drag?.moved && <p className="mt-2 text-[12.5px] text-ink-2">{drag.delta === 0 ? "Kéo sang trái/phải để dời ngày" : `${drag.delta > 0 ? "+" : ""}${drag.delta} ngày`}</p>}
    </div>
  );
}
