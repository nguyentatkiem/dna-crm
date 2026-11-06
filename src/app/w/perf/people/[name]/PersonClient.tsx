"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { Sparkline } from "@/components/ui";
import { DeltaBadge, Funnel, Heatmap, MetricHelp, RangePicker, ScoreDelta, personHref } from "@/components/perf/PerfWidgets";
import { fmtValue, GROUP_LABEL, GROUPS, METRIC_DEFS, vnDate, type RangePreset } from "@/lib/perf/metrics";
import { OUTCOMES } from "@/lib/calls-shared";
import type { PersonBoard } from "@/lib/perf/board";

const KPI_LABEL: Record<string, string> = { revenue: "Doanh thu", won_deals: "Giao dịch thắng", new_contacts: "Khách mới", calls: "Cuộc gọi", win_rate: "Tỉ lệ chốt", tickets_resolved: "Phiếu đã xử lý" };
const KPI_STATUS: Record<string, { label: string; cls: string }> = { ahead: { label: "Vượt", cls: "badge-success" }, on: { label: "Đúng nhịp", cls: "badge-info" }, behind: { label: "Đang chậm", cls: "badge-warning" }, none: { label: "Chưa đặt", cls: "badge" } };
const RANK = (s: number | null) => (s == null ? { label: "Chưa đủ dữ liệu", cls: "badge" } : s >= 75 ? { label: "Nhóm dẫn đầu", cls: "badge-success" } : s >= 50 ? { label: "Trên trung bình", cls: "badge-info" } : s >= 25 ? { label: "Dưới trung bình", cls: "badge-warning" } : { label: "Cần hỗ trợ", cls: "badge-danger" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const fmtDT = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
/** Mức chênh so với đội: dưới 200% ghi %, lớn hơn thì chỉ ghi "tốt hơn nhiều" để tránh con số khó hiểu với số đếm nhỏ. */
const gap = (pct: number, word: string) => (Math.abs(pct) < 200 ? `, ${word} ${Math.abs(pct)}%` : `, ${word} nhiều`);
const kpiFmt = (m: string, v: number) => (m === "revenue" ? fmtValue("revenue", v) : m === "win_rate" ? `${Math.round(v * 10) / 10}%` : Math.round(v).toLocaleString("vi-VN"));

export function PersonClient({ initial, me }: { initial: PersonBoard; me: string }) {
  const [b, setB] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [coach, setCoach] = useState<{ busy: boolean; text: string; error: string }>({ busy: false, text: "", error: "" });

  async function load(range: RangePreset, from?: string, to?: string) {
    const p = new URLSearchParams({ range });
    if (range === "custom" && from && to) {
      p.set("from", from);
      p.set("to", to);
    }
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/perf/people/${encodeURIComponent(b.who)}?${p}`);
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "Không tải được số liệu");
    setB(d);
    setCoach({ busy: false, text: "", error: "" });
    window.history.replaceState(null, "", `${personHref(b.who)}?${p}`);
  }

  async function askCoach() {
    setCoach({ busy: true, text: "", error: "" });
    const p = new URLSearchParams({ range: b.range.preset });
    if (b.range.preset === "custom") {
      p.set("from", vnDate(b.range.cur.from));
      p.set("to", vnDate(b.range.cur.to - 1));
    }
    const r = await fetch(`/api/perf/people/${encodeURIComponent(b.who)}/coach?${p}`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setCoach({ busy: false, text: r.ok ? d.text : "", error: r.ok ? "" : (d.error ?? "Không lấy được gợi ý") });
  }

  const isMe = b.who === me;
  const rk = RANK(b.score);
  const kpiRow = b.kpi.row;
  const kpiSet = kpiRow ? Object.entries(kpiRow.cells).filter(([, c]) => c.target > 0) : [];

  return (
    <div className={`anim-fade ${busy ? "opacity-70" : ""}`}>
      <Link href="/w/perf/overview" className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <Icon name="chevron" size={14} className="rotate-180" /> Tổng quan hiệu suất
      </Link>

      {/* Thẻ điểm */}
      <header className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={b.who} size={56} />
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold sm:text-[24px]">{b.who}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
              {b.teams.length ? (
                b.teams.map((t) => (
                  <span key={t.id} className="badge" style={{ background: `${t.color}22`, color: t.color }}>
                    {t.name}
                    {t.leader === b.who ? " · trưởng nhóm" : ""}
                  </span>
                ))
              ) : (
                <span>Chưa thuộc đội nào</span>
              )}
              {isMe && <span className="badge-info">Bạn</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:ml-auto">
          <div>
            <p className="text-[12px] text-ink-2">Điểm hiệu suất</p>
            <p className="flex items-baseline gap-2">
              <span className="font-title text-[28px] font-semibold leading-none tnum">{b.score ?? "—"}</span>
              <ScoreDelta cur={b.score} prev={b.scorePrev} />
            </p>
            <span className={`${rk.cls} mt-1`}>{rk.label}</span>
          </div>
          <div>
            <p className="text-[12px] text-ink-2">Xếp hạng {b.teams.length ? "trong đội" : "trong công ty"}</p>
            <p className="font-title text-[28px] font-semibold leading-none tnum">
              {b.rank}
              <span className="text-[15px] font-normal text-ink-2">/{b.rankOf}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <RangePicker preset={b.range.preset} from={vnDate(b.range.cur.from)} to={vnDate(b.range.cur.to - 1)} disabled={busy} onChange={load} />
        <p className="text-[12.5px] text-ink-2">
          {b.range.label} · so với kỳ trước và {b.compareLabel}
        </p>
      </div>
      {err && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
          {err}
        </p>
      )}

      {/* Điểm mạnh / cần cải thiện + AI */}
      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 font-medium text-success">
            <Icon name="trend" size={16} /> Điểm mạnh
          </h2>
          {b.insights.strengths.length ? (
            <ul className="space-y-1.5 text-[13px]">
              {b.insights.strengths.map((s) => (
                <li key={s.key}>
                  <b>{s.label}</b>: {fmtValue(s.key, s.value)} <span className="text-ink-2">(đội {fmtValue(s.key, s.median)}{gap(s.diffPct, "tốt hơn")})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">Chưa có chỉ số nào nổi bật hơn trung vị đội.</p>
          )}
        </div>
        <div className="card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 font-medium text-warning">
            <Icon name="target" size={16} /> Cần cải thiện
          </h2>
          {b.insights.weaknesses.length ? (
            <ul className="space-y-1.5 text-[13px]">
              {b.insights.weaknesses.map((s) => (
                <li key={s.key}>
                  <b>{s.label}</b>: {fmtValue(s.key, s.value)} <span className="text-ink-2">(đội {fmtValue(s.key, s.median)}{gap(s.diffPct, "kém hơn")})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">Không có chỉ số nào thấp hơn trung vị đội.</p>
          )}
        </div>
        <div className="card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 font-medium">
            <Icon name="spark" size={16} className="text-accent" /> Gợi ý huấn luyện bằng AI
          </h2>
          {coach.text ? (
            <div className="whitespace-pre-line text-[13px] leading-relaxed">{coach.text}</div>
          ) : (
            <p className="text-[13px] text-ink-2">AI đọc các con số tổng hợp ở trang này (không gửi tên, số điện thoại hay email khách) và đề xuất 3 việc cho tuần tới.</p>
          )}
          {coach.error && (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {coach.error}
            </p>
          )}
          <button type="button" className="btn-outline mt-3 h-8" onClick={askCoach} disabled={coach.busy}>
            <Icon name="spark" size={15} /> {coach.busy ? "Đang phân tích…" : coach.text ? "Gợi ý lại" : "Xin gợi ý"}
          </button>
        </div>
      </section>

      {/* Thẻ chỉ số theo nhóm */}
      {GROUPS.map((g) => (
        <section key={g} className="mt-5" aria-labelledby={`grp-${g}`}>
          <h2 id={`grp-${g}`} className="mb-2 text-[15px] font-semibold">
            {GROUP_LABEL[g]}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {b.cards
              .filter((c) => METRIC_DEFS[c.key].group === g)
              .map((c) => {
                const d = METRIC_DEFS[c.key];
                const spark = c.spark.map((v) => v ?? 0);
                const hasSpark = c.spark.some((v) => v != null && v !== 0);
                const vsTeam = c.v != null && c.median != null && c.v !== c.median ? (c.v > c.median) === d.higherBetter : null;
                return (
                  <div key={c.key} className="card min-w-0 p-3">
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{d.label}</p>
                      <MetricHelp k={c.key} />
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="truncate font-title text-[20px] font-semibold tnum">{fmtValue(c.key, c.v)}</span>
                      <DeltaBadge d={c.d} />
                    </div>
                    <p className="truncate text-[11.5px] text-ink-2">
                      Đội: <span className={vsTeam === null ? "" : vsTeam ? "text-success" : "text-danger"}>{fmtValue(c.key, c.median)}</span>
                      {d.snapshot ? " · hiện tại" : c.prev != null ? ` · kỳ trước ${fmtValue(c.key, c.prev)}` : ""}
                    </p>
                    {!d.snapshot && (
                      <div className="mt-1.5" title={`8 tuần: ${c.spark.map((v, i) => `${b.weeks[i]} ${fmtValue(c.key, v)}`).join(" · ")}`}>
                        {hasSpark ? <Sparkline data={spark} height={28} color={d.higherBetter ? "#0073ea" : "#a25ddc"} /> : <div className="h-[28px] text-[11px] leading-[28px] text-ink-2">Chưa có dữ liệu 8 tuần</div>}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="card min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium">KPI tháng này</h2>
            <Link href={`/w/kpi?period=${b.kpi.period}`} className="text-[13px] text-primary hover:underline">
              Mở trang KPI
            </Link>
          </div>
          {kpiSet.length ? (
            <ul className="space-y-3">
              {kpiSet.map(([m, c]) => {
                const pace = c.target > 0 ? Math.round((c.expected / c.target) * 100) : 0;
                return (
                  <li key={m}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span>{KPI_LABEL[m] ?? m}</span>
                      <span className="tnum">
                        <b>{kpiFmt(m, c.actual)}</b> <span className="text-ink-2">/ {kpiFmt(m, c.target)}</span> <span className={`${KPI_STATUS[c.status].cls} ml-1`}>{KPI_STATUS[c.status].label}</span>
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-2" role="progressbar" aria-valuenow={c.pct} aria-valuemin={0} aria-valuemax={100} aria-label={KPI_LABEL[m]}>
                      <div className={`h-full rounded-full ${c.status === "behind" ? "bg-warning" : c.status === "ahead" ? "bg-success" : "bg-primary"}`} style={{ width: `${Math.min(100, c.pct)}%` }} />
                      {pace > 0 && pace < 100 && <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink" style={{ left: `${pace}%` }} title={`Nhịp kỳ vọng ${pace}%`} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">Chưa đặt chỉ tiêu cá nhân tháng {b.kpi.period.slice(5)}/{b.kpi.period.slice(0, 4)}. (Chỉ tiêu đội vẫn tính ở trang KPI.)</p>
          )}
          <p className="mt-2 text-[11.5px] text-ink-2">
            Ngày {b.kpi.day}/{b.kpi.days} của tháng · vạch đen = nhịp cần đạt tới hôm nay.
          </p>
        </section>

        <section className="card min-w-0 p-4">
          <h2 className="mb-3 font-medium">Phễu chuyển đổi</h2>
          <Funnel steps={b.funnel} />
          <p className="mt-2 text-[11.5px] text-ink-2">
            {b.leads.leads ? `${b.leads.touched}/${b.leads.leads} khách mới đã được liên hệ.` : "Chưa có khách mới trong kỳ."} Các bước tính theo kỳ.
          </p>
        </section>

        <section className="card min-w-0 p-4 lg:col-span-2">
          <h2 className="mb-3 font-medium">Hoạt động theo giờ</h2>
          <Heatmap grid={b.heatmap} />
        </section>

        <section className="card min-w-0 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            Giao dịch tồn đọng <span className="text-[12.5px] font-normal text-ink-2">(không cập nhật &gt; {b.staleDays} ngày)</span>
            {b.stale.length > 0 && <span className="badge-warning">{b.stale.length}</span>}
          </h2>
          {b.stale.length ? (
            <ul className="divide-y divide-line-soft text-[13px]">
              {b.stale.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/w/b/deals?open=${s.id}`} className="min-w-0 truncate hover:text-primary hover:underline">
                    {s.title}
                  </Link>
                  <span className="flex flex-none items-center gap-2 text-ink-2">
                    <span className="tnum">{fmtValue("revenue", s.amount)}</span>
                    <span className={s.idleDays > 30 ? "badge-danger" : "badge-warning"}>{s.idleDays} ngày</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">Không có giao dịch nào bị bỏ quên.</p>
          )}
        </section>

        <section className="card min-w-0 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            Việc quá hạn {b.overdueTasks.length > 0 && <span className="badge-danger">{b.overdueTasks.length}</span>}
          </h2>
          {b.overdueTasks.length ? (
            <ul className="divide-y divide-line-soft text-[13px]">
              {b.overdueTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={t.href} className="min-w-0 truncate hover:text-primary hover:underline">
                    {t.title}
                  </Link>
                  <span className="flex-none text-ink-2">hạn {fmtDate(t.dueAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">Không có việc quá hạn.</p>
          )}
        </section>

        <section className="card min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium">Cuộc gọi gần đây</h2>
            <Link href="/w/telesales" className="text-[13px] text-primary hover:underline">
              Telesales
            </Link>
          </div>
          {b.recentCalls.length ? (
            <ul className="divide-y divide-line-soft text-[13px]">
              {b.recentCalls.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <Link href={`/w/telesales/calls/${c.id}`} className="min-w-0 flex-1 hover:text-primary">
                    <span className="block truncate">{OUTCOMES.find((o) => o.key === c.outcome)?.label ?? c.outcome}</span>
                    <span className="block truncate text-[11.5px] text-ink-2">
                      {fmtDT(c.startedAt)} · {Math.round(c.durationSec / 60)} phút{c.summary ? ` · ${c.summary}` : ""}
                    </span>
                  </Link>
                  <span className={`flex-none ${c.score == null ? "badge" : c.score >= 80 ? "badge-success" : c.score >= 60 ? "badge-warning" : "badge-danger"}`}>{c.score == null ? "Chưa chấm" : `${c.score} điểm`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">Chưa có cuộc gọi nào.</p>
          )}
        </section>

        <section className="card min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium">Lịch sử đánh giá</h2>
            <Link href="/w/perf" className="text-[13px] text-primary hover:underline">
              {b.canReview ? "Chấm điểm" : "Trang đánh giá"}
            </Link>
          </div>
          {b.reviews.length ? (
            <ul className="divide-y divide-line-soft text-[13px]">
              {b.reviews.map((r) => (
                <li key={r.period} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/w/perf?period=${r.period}`} className="hover:text-primary hover:underline">
                      Tháng {Number(r.period.slice(5))}/{r.period.slice(0, 4)}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="tnum font-semibold">{r.total}</span>
                      <span className={r.status === "done" ? "badge-success" : "badge-info"}>{r.status === "done" ? "Đã chốt" : "Nháp"}</span>
                    </span>
                  </div>
                  {r.comment && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">“{r.comment}” — {r.reviewer}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2">Chưa có phiếu đánh giá nào.</p>
          )}
        </section>
      </div>
    </div>
  );
}
