"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { vnd } from "@/lib/format";
import { Icon } from "../Icon";
import { formulaMoney, formulaNumber, groupableFields, groupsOf, readLS, writeLS, type GroupBy } from "./model";

const tick = { fill: "var(--ink-2)", fontSize: 12 };
const tipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", fontSize: 12.5 };

type Kind = "bar" | "pie";
type Pref = { by: GroupBy; metric: string; kind: Kind };

/** Đại lượng đo được: đếm số mục, hoặc cộng một cột số / tiền / công thức số. */
function metricsOf(obj: ObjectDef) {
  const out: { key: string; label: string; money: boolean }[] = [{ key: "count", label: "Số mục", money: false }];
  if (obj.amountLabel) out.push({ key: "amount", label: `Tổng ${obj.amountLabel.toLowerCase()}`, money: true });
  for (const f of obj.fields) {
    if (f.type === "number" || f.type === "money") out.push({ key: `f:${f.key}`, label: `Tổng ${f.label.toLowerCase()}`, money: f.type === "money" });
    else if (f.type === "formula") out.push({ key: `f:${f.key}`, label: `Tổng ${f.label.toLowerCase()}`, money: formulaMoney(f, obj) });
  }
  return out;
}

function measure(r: RecordDTO, metric: string, obj: ObjectDef): number {
  if (metric === "count") return 1;
  if (metric === "amount") return r.amount || 0;
  const f = obj.fields.find((x) => `f:${x.key}` === metric);
  if (!f) return 0;
  if (f.type === "formula") return formulaNumber(f, r, obj) ?? 0;
  return Number(r.data[f.key]) || 0;
}

/** Chế độ xem Biểu đồ: chia các mục đang lọc theo một cột nhãn, đo bằng số mục hoặc tổng một cột số. */
export function ChartView({ obj, team, rows }: { obj: ObjectDef; team: string[]; rows: RecordDTO[] }) {
  const metrics = useMemo(() => metricsOf(obj), [obj]);
  const dims = useMemo<{ key: GroupBy; label: string }[]>(
    () => [{ key: "status", label: obj.statusLabel }, { key: "owner", label: "Người phụ trách" }, ...groupableFields(obj).map((f) => ({ key: `f:${f.key}` as GroupBy, label: f.label }))],
    [obj],
  );
  const prefKey = `board-chart:${obj.key}`;
  const [pref, setPref] = useState<Pref>({ by: "status", metric: obj.amountLabel ? "amount" : "count", kind: "bar" });
  useEffect(() => {
    const p = readLS<Partial<Pref>>(prefKey, {});
    setPref((cur) => ({
      by: p.by && dims.some((d) => d.key === p.by) ? p.by : cur.by,
      metric: p.metric && metrics.some((m) => m.key === p.metric) ? p.metric : cur.metric,
      kind: p.kind === "pie" ? "pie" : "bar",
    }));
  }, [prefKey, dims, metrics]);
  const set = (p: Partial<Pref>) =>
    setPref((cur) => {
      const next = { ...cur, ...p };
      writeLS(prefKey, next);
      return next;
    });

  const metric = metrics.find((m) => m.key === pref.metric) ?? metrics[0];
  const data = useMemo(() => {
    const groups = groupsOf(obj, team, rows, pref.by, (o) => color(o.color).bg);
    return groups
      .map((g) => {
        const list = rows.filter(g.match);
        return { name: g.label, value: Math.round(list.reduce((a, r) => a + measure(r, metric.key, obj), 0) * 100) / 100, count: list.length, fill: g.color };
      })
      .filter((d) => d.count > 0);
  }, [obj, team, rows, pref.by, metric.key]);

  const total = data.reduce((a, d) => a + d.value, 0);
  const fmt = (v: number) => (metric.money ? vnd(v) : v.toLocaleString("vi-VN"));
  const short = (v: number) => (metric.money && Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr` : v.toLocaleString("vi-VN"));

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <label className="btn-ghost">
          <Icon name="board" size={16} />
          <select aria-label="Chia theo" value={pref.by} onChange={(e) => set({ by: e.target.value as GroupBy })} className="bg-transparent outline-none">
            {dims.map((d) => (
              <option key={d.key} value={d.key}>
                Chia theo {d.label.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="btn-ghost">
          <Icon name="chart" size={16} />
          <select aria-label="Đo bằng" value={metric.key} onChange={(e) => set({ metric: e.target.value })} className="bg-transparent outline-none">
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Kiểu biểu đồ">
          {(
            [
              ["bar", "Cột", "chart"],
              ["pie", "Tròn", "pie"],
            ] as const
          ).map(([k, label, icon]) => (
            <button key={k} type="button" aria-pressed={pref.kind === k} onClick={() => set({ kind: k })} className={`flex h-8 items-center gap-1.5 px-3 ${pref.kind === k ? "bg-primary-selected text-primary" : "hover:bg-hover"}`}>
              <Icon name={icon} size={15} /> {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[13px] text-ink-2">
          {rows.length} mục · {metric.label.toLowerCase()}: <b className="tnum text-ink">{fmt(total)}</b>
        </span>
      </div>

      <section className="card p-4" aria-label={`Biểu đồ ${metric.label.toLowerCase()}`}>
        {!data.length ? (
          <p className="grid h-[320px] place-items-center text-ink-2">Không có mục nào để vẽ biểu đồ.</p>
        ) : pref.kind === "bar" ? (
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
                <XAxis dataKey="name" tick={tick} interval={0} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                <YAxis tick={tick} tickFormatter={short} width={60} tickLine={false} axisLine={false} allowDecimals={!!metric.money || metric.key !== "count"} />
                <Tooltip contentStyle={tipStyle} cursor={{ fill: "var(--hover)" }} formatter={(v) => [fmt(Number(v)), metric.label]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={1.5} stroke="var(--surface)">
                    {data.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tipStyle} formatter={(v) => [fmt(Number(v)), metric.label]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="grid gap-1.5 text-[13.5px]">
              {data.map((d) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="h-3 w-3 flex-none rounded-sm" style={{ background: d.fill }} />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="tnum text-ink-2">{total ? Math.round((d.value / total) * 100) : 0}%</span>
                  <b className="tnum w-24 text-right font-medium">{short(d.value)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
