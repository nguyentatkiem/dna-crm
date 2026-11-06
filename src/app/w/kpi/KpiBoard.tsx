"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { vnd } from "@/lib/format";
import { Segmented } from "@/components/ui";
import type { KpiRow, KpiStatus, Metric, PeriodView, TeamKpi } from "@/lib/kpi";

// Hằng số lặp lại ở đây để không kéo Prisma (src/lib/kpi.ts) vào bundle trình duyệt.
const METRICS: Metric[] = ["revenue", "won_deals", "new_contacts", "calls", "win_rate", "tickets_resolved"];
const LABEL: Record<Metric, string> = { revenue: "Doanh thu", won_deals: "Giao dịch thắng", new_contacts: "Khách mới", calls: "Cuộc gọi", win_rate: "Tỉ lệ chốt", tickets_resolved: "Phiếu đã xử lý" };
const ICON: Record<Metric, string> = { revenue: "wallet", won_deals: "award", new_contacts: "person", calls: "phone", win_rate: "trend", tickets_resolved: "ticket" };
const STATUS: Record<KpiStatus, { label: string; cls: string }> = {
  ahead: { label: "Vượt", cls: "badge-success" },
  on: { label: "Đúng nhịp", cls: "badge-info" },
  behind: { label: "Đang chậm", cls: "badge-warning" },
  none: { label: "Chưa đặt", cls: "badge" },
};

type Board = { period: string; view: PeriodView; label: string; day: number; days: number; people: string[]; rows: KpiRow[]; teams: TeamKpi[]; revenueSource: "payments" | "deals" };
const VIEWS: { key: PeriodView; label: string }[] = [
  { key: "month", label: "Tháng" },
  { key: "quarter", label: "Quý" },
  { key: "year", label: "Năm" },
];
const VIEW_UNIT: Record<PeriodView, string> = { month: "tháng", quarter: "quý", year: "năm" };

const fmt = (m: Metric, v: number) => (m === "revenue" ? vnd(v) : m === "win_rate" ? `${Math.round(v * 10) / 10}%` : Math.round(v).toLocaleString("vi-VN"));
const score = (r: KpiRow) => {
  const set = METRICS.filter((m) => r.cells[m].target > 0);
  return set.length ? Math.round(set.reduce((s, m) => s + Math.min(200, r.cells[m].pct), 0) / set.length) : -1;
};

/** Thanh tiến độ có vạch nhịp kỳ vọng. */
function Progress({ pct, pace, status }: { pct: number; pace: number; status: KpiStatus }) {
  const color = status === "ahead" ? "bg-success" : status === "behind" ? "bg-warning" : "bg-primary";
  return (
    <div className="relative h-1.5 w-full rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      {pace > 0 && pace < 100 && <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink" style={{ left: `calc(${pace}% - 1px)` }} title={`Nhịp kỳ vọng ${pace}%`} />}
    </div>
  );
}

function Cell({ m, c }: { m: Metric; c: KpiRow["cells"][Metric] }) {
  const pace = c.target > 0 ? Math.round((c.expected / c.target) * 100) : 0;
  return (
    <div className="min-w-[132px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="tnum font-semibold">{fmt(m, c.actual)}</span>
        {c.target > 0 && <span className="tnum text-[12px] text-ink-2">/ {fmt(m, c.target)}</span>}
      </div>
      {c.target > 0 ? (
        <>
          <div className="mt-1.5">
            <Progress pct={c.pct} pace={pace} status={c.status} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="tnum text-[12px] text-ink-2">{c.pct}%</span>
            <span className={STATUS[c.status].cls}>{STATUS[c.status].label}</span>
          </div>
        </>
      ) : (
        <div className="mt-1.5 text-[12px] text-ink-2">Chưa đặt chỉ tiêu</div>
      )}
    </div>
  );
}

export function KpiBoard({ initial, me, canEdit }: { initial: Board; me: string; canEdit: boolean }) {
  const router = useRouter();
  const [board, setBoard] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const teams = board.teams ?? [];

  const company = board.rows.find((r) => r.who === "")!;
  const people = board.rows.filter((r) => r.who !== "");
  const leaders = useMemo(
    () =>
      people
        .map((r) => ({ who: r.who, score: score(r), revenue: r.cells.revenue.actual, won: r.cells.won_deals.actual }))
        .sort((a, b) => b.score - a.score || b.revenue - a.revenue || b.won - a.won),
    [people],
  );

  async function load(period: string, view: PeriodView = board.view) {
    setBusy("load");
    setMsg(null);
    const r = await fetch(`/api/kpi?period=${period}&view=${view}`);
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không tải được" });
    setBoard(d);
    setEditing(false);
    router.replace(`/w/kpi?period=${period}${view !== "month" ? `&view=${view}` : ""}`, { scroll: false });
  }

  function startEdit() {
    const d: Record<string, string> = {};
    for (const r of board.rows) for (const m of METRICS) d[`${r.who}|${m}`] = r.cells[m].target > 0 ? String(r.cells[m].target) : "";
    // Đội: chỉ điền ô đặt riêng; ô trống nghĩa là dùng tổng chỉ tiêu của thành viên.
    for (const t of teams) for (const m of METRICS) d[`${t.row.who}|${m}`] = t.explicit[m] ? String(t.explicit[m]) : "";
    setDraft(d);
    setEditing(true);
    setMsg(null);
  }

  async function save() {
    const cells: { who: string; metric: Metric; target: number | null }[] = [];
    const all = [...board.rows.map((r) => ({ who: r.who, name: r.who || "Cả công ty", cur: (m: Metric) => r.cells[m].target })), ...teams.map((t) => ({ who: t.row.who, name: `Đội ${t.name}`, cur: (m: Metric) => t.explicit[m] ?? 0 }))];
    for (const r of all)
      for (const m of METRICS) {
        const raw = (draft[`${r.who}|${m}`] ?? "").replace(/[.\s]/g, "").replace(",", ".");
        const v = raw === "" ? null : Number(raw);
        if (v !== null && (!isFinite(v) || v < 0)) return setMsg({ ok: false, text: `Ô “${r.name} · ${LABEL[m]}” chưa phải số hợp lệ` });
        if ((v ?? 0) !== r.cur(m)) cells.push({ who: r.who, metric: m, target: v });
      }
    if (!cells.length) return setEditing(false);
    setBusy("save");
    const res = await fetch("/api/kpi", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: board.period, cells }) });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? "Không lưu được" });
    setBoard(d);
    setEditing(false);
    setMsg({ ok: true, text: `Đã lưu ${cells.length} chỉ tiêu.` });
  }

  async function copyPrev() {
    setBusy("copy");
    const res = await fetch("/api/kpi/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: board.period }) });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? "Không chép được" });
    setBoard(d.board);
    setMsg({ ok: true, text: d.copied ? `Đã chép ${d.copied} chỉ tiêu từ tháng trước (chỉ điền ô còn trống).` : "Tháng trước chưa có chỉ tiêu nào để chép, hoặc tháng này đã đủ." });
  }

  const unit = VIEW_UNIT[board.view ?? "month"];
  const paceNote = board.day === 0 ? `${unit[0].toUpperCase()}${unit.slice(1)} này chưa bắt đầu.` : board.day >= board.days ? `${unit[0].toUpperCase()}${unit.slice(1)} đã kết thúc.` : `Đã qua ${board.day}/${board.days} ngày: nhịp kỳ vọng ${Math.round((board.day / board.days) * 100)}% chỉ tiêu.`;
  const monthView = (board.view ?? "month") === "month";

  return (
    <div className="anim-fade">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold">
            <Icon name="target" size={24} className="text-primary" /> Chỉ tiêu KPI
          </h1>
          <p className="mt-1 text-ink-2">
            {board.label} · {paceNote}
            {!monthView && " Chỉ tiêu và thực tế cộng dồn các tháng (tỉ lệ chốt: trung bình chỉ tiêu, thực tế tính lại từ tổng thắng/thua)."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="kpi-month">
            Chọn tháng
          </label>
          <Segmented label="Kỳ xem" options={VIEWS} value={board.view ?? "month"} onChange={(v) => load(board.period, v)} />
          <input id="kpi-month" type="month" className="input w-[160px]" value={board.period} onChange={(e) => e.target.value && load(e.target.value)} disabled={busy !== ""} />
          {canEdit && !editing && monthView && (
            <>
              <button className="btn-outline" onClick={copyPrev} disabled={busy !== ""}>
                <Icon name="copy" size={15} /> Chép tháng trước
              </button>
              <button className="btn-primary" onClick={startEdit} disabled={busy !== ""}>
                <Icon name="edit" size={15} /> Đặt chỉ tiêu
              </button>
            </>
          )}
          {editing && (
            <>
              <button className="btn-ghost" onClick={() => setEditing(false)} disabled={busy !== ""}>
                Huỷ
              </button>
              <button className="btn-primary" onClick={save} disabled={busy !== ""}>
                <Icon name="check" size={15} /> {busy === "save" ? "Đang lưu…" : "Lưu chỉ tiêu"}
              </button>
            </>
          )}
        </div>
      </div>

      {msg && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      {/* Tổng quan cả công ty */}
      <section className="mt-5" aria-label="Cả công ty">
        <h2 className="section-title mb-2">Cả công ty</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {METRICS.map((m) => {
            const c = company.cells[m];
            return (
              <div key={m} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13.5px] text-ink-2">
                    <Icon name={ICON[m]} size={16} /> {LABEL[m]}
                  </span>
                  <span className={STATUS[c.status].cls}>{STATUS[c.status].label}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="tnum text-[24px] font-semibold">{fmt(m, c.actual)}</span>
                  {c.target > 0 && <span className="tnum text-[13px] text-ink-2">/ {fmt(m, c.target)}</span>}
                </div>
                <div className="mt-2">
                  <Progress pct={c.pct} pace={c.target > 0 ? Math.round((c.expected / c.target) * 100) : 0} status={c.status} />
                </div>
                <p className="mt-1.5 text-[12px] text-ink-2">
                  {c.target > 0 ? `Đạt ${c.pct}% · nhịp cần ${fmt(m, c.expected)}` : "Chưa đặt chỉ tiêu"}
                  {m === "revenue" && ` · ${board.revenueSource === "payments" ? "theo phiếu thu" : "theo giao dịch thắng"}`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {teams.length > 0 && (
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label="Theo đội" className="min-w-0">
            <h2 className="section-title mb-2">Theo đội</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line-soft text-left text-ink-2">
                    <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 font-medium">Đội</th>
                    {METRICS.map((m) => (
                      <th key={m} className="px-3 py-2.5 font-medium">
                        {LABEL[m]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    const isOpen = !!open[t.id];
                    return (
                      <Fragment key={t.id}>
                        <tr className="border-b border-line-soft">
                          <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-3 text-left align-top font-medium">
                            <button type="button" className="flex items-start gap-2 text-left" onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))} aria-expanded={isOpen}>
                              <Icon name="chevron" size={14} className={`mt-1 flex-none transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: t.color }} /> {t.name}
                                </span>
                                <span className="block whitespace-nowrap text-[12px] font-normal text-ink-2">
                                  {t.members.length} người{t.leader ? ` · trưởng nhóm ${t.leader}` : ""}
                                </span>
                              </span>
                            </button>
                          </th>
                          {METRICS.map((m) => (
                            <td key={m} className="px-3 py-3 align-top">
                              {editing ? (
                                <div className="min-w-[132px]">
                                  <div className="tnum text-[12px] text-ink-2">Đang có: {fmt(m, t.row.cells[m].actual)}</div>
                                  <input
                                    className="input mt-1 h-8 tnum"
                                    inputMode="decimal"
                                    aria-label={`Chỉ tiêu ${LABEL[m]} của đội ${t.name}`}
                                    placeholder={t.derived.includes(m) ? `Tổng thành viên: ${fmt(m, t.row.cells[m].target)}` : "Để trống = tổng thành viên"}
                                    value={draft[`${t.row.who}|${m}`] ?? ""}
                                    onChange={(e) => setDraft((d) => ({ ...d, [`${t.row.who}|${m}`]: e.target.value }))}
                                  />
                                </div>
                              ) : (
                                <>
                                  <Cell m={m} c={t.row.cells[m]} />
                                  {t.derived.includes(m) && <div className="mt-1 text-[11.5px] text-ink-2">Chỉ tiêu = tổng thành viên</div>}
                                </>
                              )}
                            </td>
                          ))}
                        </tr>
                        {isOpen &&
                          t.memberRows.map((r) => (
                            <tr key={`${t.id}-${r.who}`} className={`border-b border-line-soft ${r.who === me ? "bg-primary-selected" : ""}`}>
                              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2.5 pl-9 text-left font-normal">
                                <span className="flex items-center gap-2 whitespace-nowrap">
                                  <Avatar name={r.who} size={22} /> {r.who}
                                  {r.who === t.leader && <span className="badge">Trưởng nhóm</span>}
                                </span>
                              </th>
                              {METRICS.map((m) => (
                                <td key={m} className="px-3 py-2.5 align-top">
                                  <Cell m={m} c={r.cells[m]} />
                                </td>
                              ))}
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-ink-2">Thực tế của đội = tổng thành viên (tỉ lệ chốt tính lại từ tổng giao dịch thắng/thua). Bấm tên đội để xem từng người. Sửa đội ở Cài đặt → Phòng ban / đội.</p>
          </section>
          <section aria-label="Xếp hạng đội">
            <h2 className="section-title mb-2">Xếp hạng đội</h2>
            <ol className="card divide-y divide-line-soft">
              {teams.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[13px] font-semibold ${i === 0 ? "bg-warning-soft text-warning" : "text-ink-2"}`}>{i === 0 ? <Icon name="award" size={15} /> : i + 1}</span>
                  <span className="h-3 w-3 flex-none rounded-full" style={{ background: t.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="tnum text-[12px] text-ink-2">
                      {vnd(t.row.cells.revenue.actual)} · {t.row.cells.won_deals.actual} thắng
                    </div>
                  </div>
                  <span className="tnum text-[14px] font-semibold">{t.score >= 0 ? `${t.score}%` : "–"}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Bảng theo người */}
        <section aria-label="Theo từng người" className="min-w-0">
          <h2 className="section-title mb-2">Theo từng người</h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-ink-2">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 font-medium">Người</th>
                  {METRICS.map((m) => (
                    <th key={m} className="px-3 py-2.5 font-medium">
                      {LABEL[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[company, ...people].map((r) => {
                  const mine = r.who === me;
                  return (
                    <tr key={r.who || "_company"} className={`border-b border-line-soft last:border-0 ${mine ? "bg-primary-selected" : ""}`} aria-current={mine ? "true" : undefined}>
                      <th scope="row" className={`sticky left-0 z-10 px-3 py-3 text-left font-medium ${mine ? "bg-primary-selected" : "bg-surface"}`}>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          {r.who ? <Avatar name={r.who} size={24} /> : <Icon name="users" size={18} className="text-ink-2" />}
                          {r.who || "Cả công ty"}
                          {mine && <span className="badge-info">Bạn</span>}
                        </span>
                      </th>
                      {METRICS.map((m) => (
                        <td key={m} className="px-3 py-3 align-top">
                          {editing ? (
                            <div className="min-w-[132px]">
                              <div className="tnum text-[12px] text-ink-2">Đang có: {fmt(m, r.cells[m].actual)}</div>
                              <input
                                className="input mt-1 h-8 tnum"
                                inputMode="decimal"
                                aria-label={`Chỉ tiêu ${LABEL[m]} của ${r.who || "cả công ty"}`}
                                placeholder={m === "win_rate" ? "%" : m === "revenue" ? "VNĐ" : "Số lượng"}
                                value={draft[`${r.who}|${m}`] ?? ""}
                                onChange={(e) => setDraft((d) => ({ ...d, [`${r.who}|${m}`]: e.target.value }))}
                              />
                            </div>
                          ) : (
                            <Cell m={m} c={r.cells[m]} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-ink-2">
            Vạch đứng trên thanh là nhịp kỳ vọng tới hôm nay (chỉ tiêu × ngày đã qua / số ngày trong {unit}). Vượt: ≥ 110% nhịp · Đúng nhịp: ≥ 90% · Đang chậm: dưới 90%.
            {!canEdit && " Chỉ chủ và quản lý được đặt chỉ tiêu."}
            {canEdit && !monthView && " Chỉ tiêu đặt theo từng tháng: chuyển về xem Tháng để sửa."}
          </p>
        </section>

        {/* Bảng xếp hạng */}
        <section aria-label="Bảng xếp hạng">
          <h2 className="section-title mb-2">Bảng xếp hạng</h2>
          <ol className="card divide-y divide-line-soft">
            {leaders.length === 0 && <li className="p-4 text-[13.5px] text-ink-2">Chưa có ai trong đội.</li>}
            {leaders.map((l, i) => (
              <li key={l.who} className={`flex items-center gap-3 px-4 py-3 ${l.who === me ? "bg-primary-selected" : ""}`}>
                <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[13px] font-semibold ${i === 0 ? "bg-warning-soft text-warning" : i < 3 ? "bg-surface-2 text-ink" : "text-ink-2"}`}>
                  {i < 3 ? <Icon name="award" size={15} /> : i + 1}
                </span>
                <Avatar name={l.who} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.who}</div>
                  <div className="tnum text-[12px] text-ink-2">
                    {vnd(l.revenue)} · {l.won} thắng
                  </div>
                </div>
                <span className="tnum text-[14px] font-semibold">{l.score >= 0 ? `${l.score}%` : "–"}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] text-ink-2">Xếp theo % hoàn thành trung bình các chỉ tiêu đã đặt (tối đa 200% mỗi chỉ tiêu).</p>
        </section>
      </div>
    </div>
  );
}
