"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { DeltaBadge, Funnel, Heatmap, MetricHelp, PersonLink, personHref, RangePicker, ScoreDelta, TrendChart, pctTone } from "@/components/perf/PerfWidgets";
import { fmtValue, GROUP_LABEL, GROUPS, LEADER_KEYS, METRIC_DEFS, METRIC_KEYS, SCORE_DEFAULT, SCORE_EXPLAIN, vnDate, type MetricGroup, type MetricKey, type RangePreset, type ScoreWeights } from "@/lib/perf/metrics";
import type { Overview, OverviewRow } from "@/lib/perf/board";

type ColSet = "main" | MetricGroup;
type SortKey = "rank" | "who" | MetricKey;

const TREND_KEYS = METRIC_KEYS.filter((k) => !METRIC_DEFS[k].snapshot);

export function OverviewClient({ initial }: { initial: Overview }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cols, setCols] = useState<ColSet>("main");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [funnelWho, setFunnelWho] = useState("");
  const [showScore, setShowScore] = useState(false);

  const q = (over: Partial<{ range: RangePreset; from: string; to: string; team: string; metric: string }> = {}) => {
    const range = over.range ?? data.range.preset;
    const p = new URLSearchParams({ range });
    if (range === "custom") {
      p.set("from", over.from ?? vnDate(data.range.cur.from));
      p.set("to", over.to ?? vnDate(data.range.cur.to - 1));
    }
    const team = over.team ?? data.teamId;
    if (team) p.set("team", team);
    const metric = over.metric ?? data.trend.metric;
    if (metric !== "revenue") p.set("metric", metric);
    return p.toString();
  };

  async function load(over: Parameters<typeof q>[0]) {
    const qs = q(over);
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/perf/overview?${qs}`);
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "Không tải được số liệu");
    setData(d);
    // Chỉ đổi URL (để chia sẻ / tải lại giữ bộ lọc), không render lại trang ở server.
    window.history.replaceState(null, "", `/w/perf/overview?${qs}`);
  }

  const keys = cols === "main" ? LEADER_KEYS : METRIC_KEYS.filter((k) => METRIC_DEFS[k].group === cols);
  const rows = useMemo(() => {
    const val = (r: OverviewRow) => (sort.key === "rank" ? r.rank : sort.key === "who" ? 0 : r.cells[sort.key].v);
    return [...data.rows].sort((a, b) => {
      if (sort.key === "who") return a.who.localeCompare(b.who, "vi") * sort.dir;
      const va = val(a);
      const vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * sort.dir;
    });
  }, [data.rows, sort]);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "rank" || key === "who" ? 1 : METRIC_DEFS[key].higherBetter ? -1 : 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");
  const self = data.scope === "self";
  const mine = data.rows.find((r) => r.who === data.me);
  const rangeQs = q().replace(/(^|&)(team|metric)=[^&]*/g, "");
  const funnelSteps = funnelWho ? data.rows.find((r) => r.who === funnelWho)?.funnel : (data.group?.funnel ?? mine?.funnel);

  return (
    <div className="anim-fade">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold">
            <Icon name="chart" size={24} className="text-primary" /> Tổng quan hiệu suất
          </h1>
          <p className="mt-1 text-ink-2">
            {data.range.label} · so với {data.range.preset === "month" || data.range.preset === "quarter" ? "cùng số ngày liền trước" : "kỳ trước cùng độ dài"}
            {self ? " · số liệu của bạn" : data.scope === "team" ? " · đội bạn phụ trách" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.teams.length > 0 && !self && (
            <>
              <label className="sr-only" htmlFor="perf-team">
                Lọc theo đội
              </label>
              <select id="perf-team" className="input h-8 w-auto py-0 text-[13px]" value={data.teamId} disabled={busy} onChange={(e) => load({ team: e.target.value })}>
                {data.scope === "all" && <option value="">Tất cả đội</option>}
                {data.scope === "team" && data.teams.length > 1 && <option value="">Các đội của bạn</option>}
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <a className="btn-outline h-8" href={`/api/perf/overview/export?${q()}`}>
            <Icon name="download" size={15} /> Xuất Excel
          </a>
        </div>
      </div>

      <div className="mt-4">
        <RangePicker preset={data.range.preset} from={vnDate(data.range.cur.from)} to={vnDate(data.range.cur.to - 1)} disabled={busy} onChange={(range, from, to) => load({ range, from, to })} />
      </div>

      {err && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
          {err}
        </p>
      )}

      {self && (
        <div className="card mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          {mine ? (
            <>
              <div className="flex items-center gap-3">
                <Avatar name={mine.who} size={36} />
                <div>
                  <p className="font-medium">{mine.who}</p>
                  <p className="text-[12.5px] text-ink-2">Bạn chỉ xem được số liệu của mình; bảng so sánh với trung vị {mine.teams.length ? `đội ${mine.teams.join(", ")}` : "cả công ty"}.</p>
                </div>
              </div>
              <div>
                <p className="text-[12px] text-ink-2">Điểm hiệu suất</p>
                <p className="font-title text-[22px] font-semibold tnum">{mine.score ?? "—"}</p>
              </div>
              <div>
                <p className="text-[12px] text-ink-2">Xếp hạng</p>
                <p className="font-title text-[22px] font-semibold tnum">
                  {mine.rank}
                  <span className="text-[14px] font-normal text-ink-2">/{data.population}</span>
                </p>
              </div>
              <Link href={personHref(mine.who, rangeQs)} className="btn-outline h-8">
                <Icon name="person" size={15} /> Xem hồ sơ của bạn
              </Link>
            </>
          ) : (
            <p className="text-ink-2">Bạn chưa có trong danh sách nhân viên được đo hiệu suất (đội trong cấu hình hoặc đội/phòng ban).</p>
          )}
        </div>
      )}

      {/* Bảng xếp hạng */}
      <section className="card mt-4" aria-labelledby="perf-board-h">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
          <h2 id="perf-board-h" className="font-medium">
            {self ? "Chỉ số của bạn" : "Bảng xếp hạng"} <span className="text-[12.5px] font-normal text-ink-2">· màu theo vị trí trong {data.teamId ? "đội" : data.scope === "team" ? "đội" : "công ty"} ({data.population} người)</span>
          </h2>
          <div role="group" aria-label="Nhóm chỉ số" className="segmented no-scrollbar max-w-full overflow-x-auto">
            {(["main", ...GROUPS] as ColSet[]).map((c) => (
              <button key={c} type="button" aria-pressed={cols === c} onClick={() => setCols(c)} className="whitespace-nowrap">
                {c === "main" ? "Chính" : GROUP_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div className={`overflow-x-auto ${busy ? "opacity-60" : ""}`}>
          <table className="w-max min-w-full text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-left align-bottom text-ink-2">
                <th className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => toggleSort("rank")} className="hover:text-ink">
                    #{arrow("rank")}
                  </button>
                </th>
                <th className="sticky left-0 z-10 min-w-[140px] bg-surface px-3 py-2 font-medium">
                  <button type="button" onClick={() => toggleSort("who")} className="hover:text-ink">
                    Nhân viên{arrow("who")}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => toggleSort("rank")} className="hover:text-ink" title={SCORE_EXPLAIN}>
                    Điểm hiệu suất{arrow("rank")}
                  </button>
                </th>
                {keys.map((k) => (
                  <th key={k} className="min-w-[104px] px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => toggleSort(k)} className="hover:text-ink" title={METRIC_DEFS[k].formula}>
                        {METRIC_DEFS[k].label}
                        {arrow(k)}
                      </button>
                      <MetricHelp k={k} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const me = r.who === data.me;
                return (
                  <tr key={r.who} className={`border-b border-line-soft ${me ? "bg-primary-selected" : ""}`}>
                    <td className="tnum px-3 py-2 text-ink-2">{r.rank}</td>
                    <th scope="row" className={`sticky left-0 z-10 px-3 py-2 text-left font-medium ${me ? "bg-primary-selected" : "bg-surface"}`}>
                      <span className="flex items-center gap-2">
                        <Avatar name={r.who} size={24} />
                        <span className="min-w-0">
                          <PersonLink name={r.who} qs={rangeQs} className="block truncate" />
                          {r.teams.length > 0 && <span className="block truncate text-[11.5px] font-normal text-ink-2">{r.teams.join(", ")}</span>}
                        </span>
                      </span>
                    </th>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="tnum w-7 text-right font-semibold">{r.score ?? "—"}</span>
                        <span className="h-1.5 w-14 rounded-full bg-surface-2" aria-hidden>
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${r.score ?? 0}%` }} />
                        </span>
                        <ScoreDelta small cur={r.score} prev={r.scorePrev} />
                      </span>
                    </td>
                    {keys.map((k) => {
                      const c = r.cells[k];
                      return (
                        <td key={k} className={`px-3 py-2 text-right ${pctTone(c.pct)}`} title={c.pct != null ? `Vị trí trong nhóm: ${c.pct}/100${c.prev != null ? ` · kỳ trước ${fmtValue(k, c.prev)}` : ""}` : undefined}>
                          <div className="tnum font-medium">{fmtValue(k, c.v)}</div>
                          <DeltaBadge small d={c.d} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={keys.length + 3} className="px-4 py-8 text-center text-ink-2">
                    Chưa có nhân viên nào trong phạm vi bạn được xem.
                  </td>
                </tr>
              )}
              {data.group && (
                <tr className="border-b border-line-soft bg-surface-2/60 font-medium">
                  <td />
                  <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left">
                    <span className="flex items-center gap-2">
                      <Icon name="users" size={18} className="text-ink-2" /> {data.group.label}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-ink-2">Tổng</td>
                  {keys.map((k) => (
                    <td key={k} className="px-3 py-2 text-right">
                      <div className="tnum">{fmtValue(k, data.group!.cells[k].v)}</div>
                      <DeltaBadge small d={data.group!.cells[k].d} />
                    </td>
                  ))}
                </tr>
              )}
              <tr className="text-ink-2">
                <td />
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal">
                  Trung vị {data.teamId || self || data.scope === "team" ? "đội" : "công ty"}
                </th>
                <td />
                {keys.map((k) => (
                  <td key={k} className="tnum px-3 py-2 text-right">
                    {fmtValue(k, data.median[k])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-success-soft" /> nhóm đầu (≥ 75)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-warning-soft" /> dưới trung bình (25–50)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-danger-soft" /> nhóm cuối (&lt; 25)
          </span>
          <span>▲▼ so với kỳ trước, xanh = tốt hơn</span>
          {data.revenueSource === "deals" && <span>Doanh thu đang tính theo giá trị giao dịch thắng (chưa có phiếu thu).</span>}
          <button type="button" className="ml-auto text-primary hover:underline" onClick={() => setShowScore(!showScore)} aria-expanded={showScore}>
            Điểm hiệu suất tính thế nào?
          </button>
        </div>
        {showScore && <ScorePanel weights={data.weights} staleDays={data.staleDays} canEdit={data.canConfigure} onSaved={() => load({})} />}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card min-w-0 p-4" aria-labelledby="perf-trend-h">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="perf-trend-h" className="font-medium">
              Xu hướng theo tuần
            </h2>
            <label className="sr-only" htmlFor="perf-metric">
              Chỉ số
            </label>
            <select id="perf-metric" className="input h-8 w-auto py-0 text-[13px]" value={data.trend.metric} disabled={busy} onChange={(e) => load({ metric: e.target.value })}>
              {TREND_KEYS.map((k) => (
                <option key={k} value={k}>
                  {METRIC_DEFS[k].label}
                </option>
              ))}
            </select>
          </div>
          <TrendChart metric={data.trend.metric} weeks={data.trend.weeks} series={data.trend.series} />
          <p className="mt-1 text-[11.5px] text-ink-2">8 tuần gần nhất (thứ Hai → Chủ nhật){data.trend.series.length >= 10 ? " · 10 người đứng đầu" : ""}.</p>
        </section>

        <section className="card min-w-0 p-4" aria-labelledby="perf-alert-h">
          <h2 id="perf-alert-h" className="mb-3 flex items-center gap-2 font-medium">
            <Icon name="bell" size={16} className="text-warning" /> Cần chú ý
            {data.alerts.length > 0 && <span className="badge-warning">{data.alerts.length}</span>}
          </h2>
          {data.alerts.length ? (
            <ul className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {data.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]">
                  <span className={`${a.severity === "danger" ? "badge-danger" : "badge-warning"} mt-0.5`}>{a.kind === "drop" ? "Tụt" : a.kind === "stale" ? "Tồn đọng" : "Chậm"}</span>
                  <span className="min-w-0">
                    <PersonLink name={a.who} qs={rangeQs} className="font-medium" />: {a.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-ink-2">Không có ai tụt quá 20% so với kỳ trước, không có giao dịch tồn đọng hay khách mới bị chậm liên hệ.</p>
          )}
          <p className="mt-2 text-[11.5px] text-ink-2">Tụt: doanh thu, giao dịch thắng, cuộc gọi, tin nhắn hoặc ghi chú giảm quá 20%. Tồn đọng: giao dịch mở không cập nhật quá {data.staleDays} ngày. Chậm: trung vị liên hệ khách mới quá 60 phút.</p>
        </section>

        <section className="card min-w-0 p-4" aria-labelledby="perf-heat-h">
          <h2 id="perf-heat-h" className="mb-3 font-medium">
            Hoạt động theo giờ <span className="text-[12.5px] font-normal text-ink-2">· {data.heatmapLabel}</span>
          </h2>
          <Heatmap grid={data.heatmap} />
        </section>

        <section className="card min-w-0 p-4" aria-labelledby="perf-funnel-h">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="perf-funnel-h" className="font-medium">
              Phễu chuyển đổi
            </h2>
            {data.rows.length > 1 && (
              <>
                <label className="sr-only" htmlFor="perf-funnel-who">
                  Phễu của
                </label>
                <select id="perf-funnel-who" className="input h-8 w-auto py-0 text-[13px]" value={funnelWho} onChange={(e) => setFunnelWho(e.target.value)}>
                  <option value="">{data.group?.label ?? "Tất cả"}</option>
                  {data.rows.map((r) => (
                    <option key={r.who} value={r.who}>
                      {r.who}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          {funnelSteps ? <Funnel steps={funnelSteps} /> : <p className="text-[13px] text-ink-2">Chưa có dữ liệu.</p>}
          <p className="mt-2 text-[11.5px] text-ink-2">Khách mới trong kỳ → đã được người phụ trách liên hệ → báo giá đã gửi → giao dịch thắng (các bước tính theo kỳ).</p>
        </section>
      </div>
    </div>
  );
}

function ScorePanel({ weights, staleDays, canEdit, onSaved }: { weights: ScoreWeights; staleDays: number; canEdit: boolean; onSaved: () => void }) {
  const [w, setW] = useState<Record<string, string>>(() => Object.fromEntries(METRIC_KEYS.map((k) => [k, weights[k] ? String(weights[k]) : ""])));
  const [sd, setSd] = useState(String(staleDays));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const total = Object.values(w).reduce((s, v) => s + (Number(v) || 0), 0);

  async function save(reset = false) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(w)) {
      if (!v.trim()) continue;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) return setMsg({ ok: false, text: `Trọng số “${METRIC_DEFS[k as MetricKey].label}” phải từ 0 đến 100` });
      if (n > 0) out[k] = n;
    }
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/perf/score", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reset ? { reset: true } : { weights: out, staleDays: Number(sd) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không lưu được" });
    if (reset) {
      setW(Object.fromEntries(METRIC_KEYS.map((k) => [k, SCORE_DEFAULT[k] ? String(SCORE_DEFAULT[k]) : ""])));
      setSd("14");
    }
    setMsg({ ok: true, text: "Đã lưu cách tính điểm." });
    onSaved();
  }

  return (
    <div className="border-t border-line-soft px-4 py-4 text-[13px]">
      <p className="max-w-3xl text-ink-2">{SCORE_EXPLAIN}</p>
      <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_KEYS.filter((k) => canEdit || weights[k]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate" title={METRIC_DEFS[k].formula}>
              {METRIC_DEFS[k].label}
            </span>
            {canEdit ? (
              <span className="flex items-center gap-1">
                <input className="input h-7 w-16 px-2 text-right tnum" inputMode="decimal" value={w[k]} onChange={(e) => setW((x) => ({ ...x, [k]: e.target.value }))} aria-label={`Trọng số ${METRIC_DEFS[k].label}`} placeholder="0" />
                <span className="text-ink-2">%</span>
              </span>
            ) : (
              <span className="tnum font-medium">{weights[k]}%</span>
            )}
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-ink-2">
            Tổng trọng số: <b className="tnum text-ink">{total}</b> (không cần đúng 100, hệ thống tự chia tỉ lệ)
          </span>
          <label className="ml-auto flex items-center gap-1.5">
            Tồn đọng sau
            <input className="input h-7 w-14 px-2 text-right tnum" inputMode="numeric" value={sd} onChange={(e) => setSd(e.target.value)} aria-label="Số ngày coi là tồn đọng" />
            ngày
          </label>
          <button type="button" className="btn-ghost h-8" disabled={busy} onClick={() => save(true)}>
            Về mặc định
          </button>
          <button type="button" className="btn-primary h-8" disabled={busy} onClick={() => save()}>
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className={`mt-2 ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
