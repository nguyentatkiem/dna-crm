"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { vnd } from "@/lib/format";
import type { KpiRow, KpiStatus, Metric } from "@/lib/kpi";

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

type Board = { period: string; day: number; days: number; people: string[]; rows: KpiRow[]; revenueSource: "payments" | "deals" };

const fmt = (m: Metric, v: number) => (m === "revenue" ? vnd(v) : m === "win_rate" ? `${Math.round(v * 10) / 10}%` : Math.round(v).toLocaleString("vi-VN"));
const monthLabel = (p: string) => {
  const [y, m] = p.split("-");
  return `Tháng ${Number(m)}/${y}`;
};
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

  const company = board.rows.find((r) => r.who === "")!;
  const people = board.rows.filter((r) => r.who !== "");
  const leaders = useMemo(
    () =>
      people
        .map((r) => ({ who: r.who, score: score(r), revenue: r.cells.revenue.actual, won: r.cells.won_deals.actual }))
        .sort((a, b) => b.score - a.score || b.revenue - a.revenue || b.won - a.won),
    [people],
  );

  async function load(period: string) {
    setBusy("load");
    setMsg(null);
    const r = await fetch(`/api/kpi?period=${period}`);
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không tải được" });
    setBoard(d);
    setEditing(false);
    router.replace(`/w/kpi?period=${period}`, { scroll: false });
  }

  function startEdit() {
    const d: Record<string, string> = {};
    for (const r of board.rows) for (const m of METRICS) d[`${r.who}|${m}`] = r.cells[m].target > 0 ? String(r.cells[m].target) : "";
    setDraft(d);
    setEditing(true);
    setMsg(null);
  }

  async function save() {
    const cells: { who: string; metric: Metric; target: number | null }[] = [];
    for (const r of board.rows)
      for (const m of METRICS) {
        const raw = (draft[`${r.who}|${m}`] ?? "").replace(/[.\s]/g, "").replace(",", ".");
        const v = raw === "" ? null : Number(raw);
        if (v !== null && (!isFinite(v) || v < 0)) return setMsg({ ok: false, text: `Ô “${r.who || "Cả công ty"} · ${LABEL[m]}” chưa phải số hợp lệ` });
        if ((v ?? 0) !== r.cells[m].target) cells.push({ who: r.who, metric: m, target: v });
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

  const paceNote = board.day === 0 ? "Tháng này chưa bắt đầu." : board.day >= board.days ? "Tháng đã kết thúc." : `Hôm nay ngày ${board.day}/${board.days}: nhịp kỳ vọng ${Math.round((board.day / board.days) * 100)}% chỉ tiêu.`;

  return (
    <div className="anim-fade">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold">
            <Icon name="target" size={24} className="text-primary" /> Chỉ tiêu KPI
          </h1>
          <p className="mt-1 text-ink-2">
            {monthLabel(board.period)} · {paceNote}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="kpi-month">
            Chọn tháng
          </label>
          <input id="kpi-month" type="month" className="input w-[160px]" value={board.period} onChange={(e) => e.target.value && load(e.target.value)} disabled={busy !== ""} />
          {canEdit && !editing && (
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
            Vạch đứng trên thanh là nhịp kỳ vọng tới hôm nay (chỉ tiêu × ngày đã qua / số ngày trong tháng). Vượt: ≥ 110% nhịp · Đúng nhịp: ≥ 90% · Đang chậm: dưới 90%.
            {!canEdit && " Chỉ chủ và quản lý được đặt chỉ tiêu."}
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
