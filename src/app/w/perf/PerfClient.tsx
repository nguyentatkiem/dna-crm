"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { PersonLink } from "@/components/perf/PersonLink";
import { METRIC_DEFS, METRIC_KEYS } from "@/lib/perf/metrics";
import { RANK_LABEL, RANK_TONE, SOURCE_LABEL, rankOf, weightedTotal, type Criterion } from "@/lib/perf/shared";
import type { PerfRow } from "@/lib/perf/review";

type Board = { period: string; criteria: Criterion[]; rows: PerfRow[] };
type Draft = { scores: Record<string, string>; comment: string };

const STATUS: Record<PerfRow["status"], { label: string; cls: string }> = {
  none: { label: "Chưa đánh giá", cls: "badge" },
  draft: { label: "Nháp", cls: "badge-info" },
  done: { label: "Đã chốt", cls: "badge-success" },
};
const monthLabel = (p: string) => `Tháng ${Number(p.slice(5))}/${p.slice(0, 4)}`;
// Lặp lại ở đây để không kéo Prisma vào trình duyệt.
const SOURCES: { key: string; label: string }[] = [
  { key: "manual", label: "Chấm tay" },
  { key: "csat", label: "CSAT phiếu hỗ trợ" },
  { key: "kpi:revenue", label: "KPI: Doanh thu" },
  { key: "kpi:won_deals", label: "KPI: Giao dịch thắng" },
  { key: "kpi:new_contacts", label: "KPI: Khách mới" },
  { key: "kpi:calls", label: "KPI: Cuộc gọi" },
  { key: "kpi:win_rate", label: "KPI: Tỉ lệ chốt" },
  { key: "kpi:tickets_resolved", label: "KPI: Phiếu đã xử lý" },
  // Chỉ số hoạt động thực tế (bộ đo hiệu suất): tỉ lệ/điểm lấy thẳng, còn lại theo bách phân vị trong đội.
  ...METRIC_KEYS.filter((k) => !METRIC_DEFS[k].snapshot).map((k) => ({ key: `metric:${k}`, label: `Chỉ số: ${METRIC_DEFS[k].label}` })),
];

const draftOf = (b: Board, r: PerfRow): Draft => ({
  scores: Object.fromEntries(b.criteria.filter((c) => c.source === "manual").map((c) => [c.id, r.scores[c.id] == null ? "" : String(r.scores[c.id])])),
  comment: r.comment,
});

export function PerfClient({ initial, me, canReview, isOwner }: { initial: Board; me: string; canReview: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [board, setBoard] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(initial.rows.map((r) => [r.who, draftOf(initial, r)])));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showCriteria, setShowCriteria] = useState(false);

  function apply(b: Board) {
    setBoard(b);
    setDrafts(Object.fromEntries(b.rows.map((r) => [r.who, draftOf(b, r)])));
  }

  async function load(period: string) {
    setBusy("load");
    setMsg(null);
    const r = await fetch(`/api/perf?period=${period}`);
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không tải được" });
    apply(d);
    router.replace(`/w/perf?period=${period}`, { scroll: false });
  }

  async function save(r: PerfRow, extra: { finalize?: boolean; reopen?: boolean } = {}) {
    const d = drafts[r.who];
    const scores: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(d?.scores ?? {})) {
      const t = v.trim().replace(",", ".");
      if (t === "") scores[k] = null;
      else {
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0 || n > 100) return setMsg({ ok: false, text: `Điểm của ${r.who} phải từ 0 đến 100` });
        scores[k] = n;
      }
    }
    if (extra.finalize && !confirm(`Chốt đánh giá ${monthLabel(board.period).toLowerCase()} của ${r.who}? Sau khi chốt chỉ chủ doanh nghiệp sửa được.`)) return;
    setBusy(r.who);
    setMsg(null);
    const res = await fetch("/api/perf", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: board.period, who: r.who, scores, comment: d?.comment ?? "", ...extra }) });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Không lưu được" });
    apply(j.board);
    setMsg({ ok: true, text: extra.reopen ? `Đã mở lại đánh giá của ${r.who}.` : extra.finalize ? `Đã chốt đánh giá của ${r.who}: ${j.total} điểm.` : `Đã lưu đánh giá của ${r.who}.` });
  }

  const manual = board.criteria.filter((c) => c.source === "manual");
  const doneCount = board.rows.filter((r) => r.status === "done").length;

  return (
    <div className="anim-fade">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold">
            <Icon name="award" size={24} className="text-primary" /> Đánh giá nhân viên
          </h1>
          <p className="mt-1 text-ink-2">
            {monthLabel(board.period)} · {canReview ? `${doneCount}/${board.rows.length} phiếu đã chốt` : "Phiếu đánh giá của bạn"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="perf-month">
            Chọn tháng
          </label>
          <input id="perf-month" type="month" className="input w-[160px]" value={board.period} onChange={(e) => e.target.value && load(e.target.value)} disabled={busy !== ""} />
          <a className="btn-outline" href={`/api/perf/export?period=${board.period}`}>
            <Icon name="download" size={15} /> Xuất Excel
          </a>
          {isOwner && (
            <button type="button" className={`btn-ghost ${showCriteria ? "bg-primary-selected" : ""}`} onClick={() => setShowCriteria(!showCriteria)} aria-expanded={showCriteria}>
              <Icon name="settings" size={15} /> Tiêu chí
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      {showCriteria && isOwner && (
        <CriteriaEditor
          initial={board.criteria}
          onSaved={() => {
            setShowCriteria(false);
            load(board.period);
          }}
        />
      )}

      <div className="card mt-5 overflow-x-auto">
        <table className="w-max min-w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line-soft text-left align-bottom text-ink-2">
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">#</th>
              <th className="sticky left-0 z-10 min-w-[120px] bg-surface px-3 py-2.5 font-medium sm:min-w-[150px]">Nhân viên</th>
              {board.criteria.map((c) => (
                <th key={c.id} className="w-[118px] min-w-[118px] px-3 py-2.5 font-medium" title={`${c.label} · trọng số ${c.weight}% · ${SOURCE_LABEL(c.source)}`}>
                  <span className="line-clamp-2 leading-snug">{c.label}</span>
                  <span className="mt-0.5 block whitespace-nowrap text-[11.5px] font-normal">
                    <span className="tnum font-medium text-ink">{c.weight}%</span> · {c.source === "manual" ? "Chấm tay" : c.source === "csat" ? "Tự động · CSAT" : c.source.startsWith("metric:") ? "Tự động · Chỉ số" : "Tự động · KPI"}
                  </span>
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">Tổng</th>
              <th className="min-w-[190px] px-3 py-2.5 font-medium">Nhận xét</th>
              <th className="z-10 bg-surface px-3 py-2.5 font-medium sm:sticky sm:right-0 sm:shadow-[-1px_0_0_var(--line-soft)]">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {board.rows.length === 0 && (
              <tr>
                <td colSpan={board.criteria.length + 5} className="p-6 text-center text-ink-2">
                  Chưa có nhân viên nào để đánh giá.
                </td>
              </tr>
            )}
            {board.rows.map((r, i) => {
              const d = drafts[r.who] ?? draftOf(board, r);
              const editable = canReview && (r.status !== "done" || isOwner);
              // Tổng xem trước theo điểm đang gõ (chưa lưu).
              const live = { ...r.scores };
              for (const c of manual) {
                const t = (d.scores[c.id] ?? "").trim();
                live[c.id] = t === "" ? null : Number(t.replace(",", "."));
              }
              const total = editable ? weightedTotal(board.criteria, live) : r.total;
              const rank = rankOf(total);
              const scored = board.criteria.some((c) => live[c.id] != null && !Number.isNaN(live[c.id]));
              return (
                <tr key={r.who} className={`border-b border-line-soft last:border-0 ${r.who === me ? "bg-primary-selected" : ""}`}>
                  <td className="tnum hidden px-3 py-3 align-top text-ink-2 sm:table-cell">{i + 1}</td>
                  <th scope="row" className={`sticky left-0 z-10 px-3 py-3 text-left align-top font-medium ${r.who === me ? "bg-primary-selected" : "bg-surface"}`}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={r.who} size={26} /> <PersonLink name={r.who} />
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1 text-[12px] font-normal text-ink-2">
                      <span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span>
                      {r.teams.length > 0 && <span className="max-sm:hidden">{r.teams.join(", ")}</span>}
                    </span>
                  </th>
                  {board.criteria.map((c) => (
                    <td key={c.id} className="px-3 py-3 align-top">
                      {c.source === "manual" && editable ? (
                        <input
                          className="input h-8 w-[72px] tnum"
                          inputMode="numeric"
                          placeholder="0–100"
                          aria-label={`${c.label} của ${r.who}`}
                          value={d.scores[c.id] ?? ""}
                          onChange={(e) => setDrafts((x) => ({ ...x, [r.who]: { ...d, scores: { ...d.scores, [c.id]: e.target.value } } }))}
                        />
                      ) : (
                        <div>
                          <span className="tnum font-semibold">{r.scores[c.id] == null ? "–" : r.scores[c.id]}</span>
                          {c.source !== "manual" && r.notes[c.id] && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2">{r.notes[c.id]}</div>}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 align-top">
                    <div className="tnum text-[16px] font-semibold">{scored ? total : "–"}</div>
                    {scored && <span className={RANK_TONE[rank]}>{RANK_LABEL[rank]}</span>}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {editable ? (
                      <textarea className="input min-h-[56px] w-[180px] py-1.5 text-[13px]" aria-label={`Nhận xét cho ${r.who}`} value={d.comment} onChange={(e) => setDrafts((x) => ({ ...x, [r.who]: { ...d, comment: e.target.value } }))} placeholder="Điểm mạnh, cần cải thiện…" />
                    ) : (
                      <p className="max-w-[220px] whitespace-pre-wrap text-[13px]">{r.comment || <span className="text-ink-2">–</span>}</p>
                    )}
                    {r.reviewer && <p className="mt-1 text-[11.5px] text-ink-2">Người đánh giá: {r.reviewer}</p>}
                  </td>
                  <td className={`z-10 px-3 py-3 align-top sm:sticky sm:right-0 sm:shadow-[-1px_0_0_var(--line-soft)] ${r.who === me ? "bg-primary-selected" : "bg-surface"}`}>
                    {canReview && (
                      <div className="flex flex-col items-stretch gap-1.5">
                        {editable && (
                          <button type="button" className="btn-outline h-8 whitespace-nowrap" onClick={() => save(r)} disabled={busy !== ""}>
                            {busy === r.who ? "Đang lưu…" : "Lưu"}
                          </button>
                        )}
                        {r.status !== "done" && (
                          <button type="button" className="btn-primary h-8 whitespace-nowrap" onClick={() => save(r, { finalize: true })} disabled={busy !== ""}>
                            <Icon name="lock" size={14} /> Chốt đánh giá
                          </button>
                        )}
                        {r.status === "done" && isOwner && (
                          <button type="button" className="btn-ghost h-8 whitespace-nowrap" onClick={() => save(r, { reopen: true })} disabled={busy !== ""}>
                            Mở lại
                          </button>
                        )}
                        {r.status === "done" && !isOwner && <span className="text-[12px] text-ink-2">Đã khoá</span>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-ink-2">
        Điểm tự động: % hoàn thành chỉ tiêu KPI của tháng, tối đa 120% = 100 điểm; CSAT = số sao trung bình × 20. Tiêu chí chưa có số liệu (chưa đặt chỉ tiêu, chưa chấm) không tính vào tổng. Xếp loại: Xuất sắc ≥ 90 · Tốt ≥ 75 · Đạt ≥ 60 · dưới 60 Cần cải thiện. Khi chốt, điểm được chụp lại và khoá (chỉ chủ mở lại được).
        {!canReview && " Bạn chỉ xem được phiếu đánh giá của mình."}
      </p>
    </div>
  );
}

function CriteriaEditor({ initial, onSaved }: { initial: Criterion[]; onSaved: () => void }) {
  const [list, setList] = useState(initial.map((c) => ({ ...c, weight: String(c.weight) })));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const sum = Math.round(list.reduce((s, c) => s + (Number(c.weight.replace(",", ".")) || 0), 0) * 100) / 100;

  async function submit(reset = false) {
    if (reset && !confirm("Đưa bộ tiêu chí về mặc định?")) return;
    if (!reset) {
      const bad = list.find((c) => {
        const n = Number(c.weight.trim().replace(",", "."));
        return c.weight.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100;
      });
      if (bad) return setErr(`Trọng số của “${bad.label || "tiêu chí"}” phải là số từ 0 đến 100`);
    }
    setBusy(true);
    setErr("");
    const criteria = list.map((c) => ({ ...c, weight: Number(c.weight.trim().replace(",", ".")) || 0 }));
    const r = await fetch("/api/perf/criteria", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criteria, reset }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    onSaved();
  }

  return (
    <section className="card mt-4 p-4" aria-label="Tiêu chí đánh giá">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Tiêu chí đánh giá</h2>
        <span className={`tnum text-[13px] ${sum === 100 ? "text-ink-2" : "text-warning"}`}>Tổng trọng số: {sum}%{sum !== 100 && " (nên bằng 100%, hệ thống tự quy về tỉ lệ)"}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {list.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className="input h-8 min-w-[200px] flex-1" aria-label="Tên tiêu chí" value={c.label} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <label className="flex items-center gap-1 text-[13px] text-ink-2">
              <input className="input h-8 w-[70px] tnum" inputMode="numeric" aria-label="Trọng số %" value={c.weight} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />%
            </label>
            <select className="input h-8 w-[190px]" aria-label="Nguồn điểm" value={c.source} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, source: e.target.value as Criterion["source"] } : x)))}>
              {SOURCES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost h-8 px-2" aria-label={`Xoá tiêu chí ${c.label}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>
      {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => setList((l) => [...l, { id: `c${Date.now().toString(36)}`, label: "Tiêu chí mới", weight: "10", source: "manual" }])} disabled={list.length >= 20}>
          <Icon name="plus" size={15} /> Thêm tiêu chí
        </button>
        <span className="flex-1" />
        <button type="button" className="btn-ghost" onClick={() => submit(true)} disabled={busy}>
          Về mặc định
        </button>
        <button type="button" className="btn-primary" onClick={() => submit()} disabled={busy}>
          <Icon name="check" size={15} /> {busy ? "Đang lưu…" : "Lưu tiêu chí"}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-ink-2">Phiếu đã chốt giữ nguyên điểm lúc chốt. Đổi tiêu chí chỉ ảnh hưởng phiếu nháp và phiếu chưa đánh giá.</p>
    </section>
  );
}
