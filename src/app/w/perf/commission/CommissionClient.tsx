"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { PersonLink } from "@/components/perf/PersonLink";
import { Segmented } from "@/components/ui";
import { vnd } from "@/lib/format";
import { commissionFor, normTiers, type CommissionRules } from "@/lib/perf/shared";
import type { CommissionRow } from "@/lib/perf/commission";

type Board = { period: string; rules: CommissionRules; rows: CommissionRow[]; unassigned: number };
const monthLabel = (p: string) => `Tháng ${Number(p.slice(5))}/${p.slice(0, 4)}`;
const num = (s: string) => Number(s.replace(/[.\s]/g, "").replace(",", "."));

function rulesText(r: CommissionRules) {
  const tiers = normTiers(r.tiers)
    .map((t) => `từ ${vnd(t.from)}: ${t.pct}%`)
    .join(" · ");
  return `${r.mode === "progressive" ? "Lũy tiến từng phần" : "Theo bậc (cả doanh thu nhân % bậc đạt)"} — ${tiers}. Trưởng nhóm thêm ${r.teamLeaderPct}% doanh thu của thành viên.`;
}

export function CommissionClient({ initial, me, canEdit, canSeeAll }: { initial: Board; me: string; canEdit: boolean; canSeeAll: boolean }) {
  const router = useRouter();
  const [board, setBoard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  async function load(period: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/perf/commission?period=${period}`);
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không tải được" });
    setBoard(d);
    router.replace(`/w/perf/commission?period=${period}`, { scroll: false });
  }

  const sum = (k: "revenue" | "commission" | "leaderBonus" | "total") => board.rows.reduce((s, r) => s + r[k], 0);

  return (
    <div className="anim-fade">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[26px] font-semibold">
            <Icon name="wallet" size={24} className="text-primary" /> Hoa hồng
          </h1>
          <p className="mt-1 text-ink-2">
            {monthLabel(board.period)} · {board.rules.base === "paid" ? "tính trên tiền đã thu trong tháng" : "tính trên đơn hoàn tất trong tháng"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="cm-month">
            Chọn tháng
          </label>
          <input id="cm-month" type="month" className="input w-[160px]" value={board.period} onChange={(e) => e.target.value && load(e.target.value)} disabled={busy} />
          <a className="btn-outline" href={`/api/perf/commission/export?period=${board.period}`}>
            <Icon name="download" size={15} /> Xuất Excel
          </a>
          {canEdit && !editing && (
            <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
              <Icon name="edit" size={15} /> Quy tắc
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      {editing ? (
        <RulesEditor
          initial={board.rules}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setMsg({ ok: true, text: "Đã lưu quy tắc hoa hồng." });
            load(board.period);
          }}
        />
      ) : (
        <p className="mt-4 rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          <Icon name="receipt" size={14} className="mr-1 inline" /> {rulesText(board.rules)}
        </p>
      )}

      {canSeeAll && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Doanh thu tính hoa hồng", sum("revenue")],
            ["Hoa hồng cá nhân", sum("commission")],
            ["Thưởng trưởng nhóm", sum("leaderBonus")],
            ["Tổng chi hoa hồng", sum("total")],
          ].map(([l, v]) => (
            <div key={l as string} className="card p-4">
              <div className="text-[13px] text-ink-2">{l}</div>
              <div className="tnum mt-1 text-[20px] font-semibold">{vnd(v as number)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-ink-2">
              <th className="px-3 py-2.5 font-medium">Nhân viên</th>
              <th className="px-3 py-2.5 text-right font-medium">Số đơn</th>
              <th className="px-3 py-2.5 text-right font-medium">Doanh thu</th>
              <th className="px-3 py-2.5 text-right font-medium">Hoa hồng</th>
              <th className="px-3 py-2.5 text-right font-medium">Thưởng trưởng nhóm</th>
              <th className="px-3 py-2.5 text-right font-medium">Tổng nhận</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-2">
                  Chưa có doanh thu trong tháng này.
                </td>
              </tr>
            )}
            {board.rows.map((r) => (
              <tr key={r.who} className={`border-b border-line-soft last:border-0 ${r.who === me ? "bg-primary-selected" : ""}`}>
                <th scope="row" className="px-3 py-3 text-left font-medium">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar name={r.who} size={26} /> <PersonLink name={r.who} />
                    {r.who === me && <span className="badge-info">Bạn</span>}
                  </span>
                  {r.teams.length > 0 && <span className="mt-0.5 block text-[12px] font-normal text-ink-2">{r.teams.join(", ")}</span>}
                </th>
                <td className="tnum px-3 py-3 text-right">{r.orders}</td>
                <td className="tnum px-3 py-3 text-right">{vnd(r.revenue)}</td>
                <td className="tnum px-3 py-3 text-right">{vnd(r.commission)}</td>
                <td className="tnum px-3 py-3 text-right">
                  {r.leaderOf.length ? (
                    <span title={`Trưởng nhóm: ${r.leaderOf.join(", ")}`}>{vnd(r.leaderBonus)}</span>
                  ) : (
                    <span className="text-ink-2">–</span>
                  )}
                </td>
                <td className="tnum px-3 py-3 text-right font-semibold">{vnd(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-ink-2">
        Doanh thu của mỗi đơn được tính cho người phụ trách giao dịch gắn với đơn; đơn không gắn giao dịch thì cho người phụ trách khách, sau đó mới tới người tạo đơn — vì chủ hoặc kế toán thường tạo đơn hộ nhân viên bán (giống cách tính doanh thu ở Chỉ tiêu KPI).{" "}
        {board.rules.base === "paid" ? "Chỉ cộng tiền đã thu (phiếu thu) có ngày thu trong tháng, bỏ đơn đã huỷ." : "Cộng tổng giá trị đơn ở trạng thái Hoàn tất, theo ngày cập nhật cuối của đơn."}
        {board.unassigned > 0 && ` Có ${vnd(board.unassigned)} doanh thu chưa xác định được người bán.`}
        {!canSeeAll && " Bạn chỉ xem được dòng của mình."}
      </p>
    </div>
  );
}

function RulesEditor({ initial, onCancel, onSaved }: { initial: CommissionRules; onCancel: () => void; onSaved: () => void }) {
  const [base, setBase] = useState(initial.base);
  const [mode, setMode] = useState(initial.mode);
  const [tiers, setTiers] = useState(initial.tiers.map((t) => ({ from: String(t.from), pct: String(t.pct) })));
  const [leader, setLeader] = useState(String(initial.teamLeaderPct));
  const [sample, setSample] = useState("120000000");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = tiers.map((t) => ({ from: num(t.from), pct: num(t.pct) }));
  const s = num(sample);

  async function save() {
    if (parsed.some((t) => !Number.isFinite(t.from) || !Number.isFinite(t.pct) || t.from < 0 || t.pct < 0 || t.pct > 100)) return setErr("Mốc doanh thu và % phải là số hợp lệ (0–100%)");
    const lp = num(leader);
    if (!Number.isFinite(lp) || lp < 0 || lp > 100) return setErr("% thưởng trưởng nhóm phải từ 0 đến 100");
    setBusy(true);
    setErr("");
    const r = await fetch("/api/perf/commission", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base, mode, tiers: parsed, teamLeaderPct: lp }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    onSaved();
  }

  return (
    <section className="card mt-4 grid gap-4 p-4" aria-label="Quy tắc hoa hồng">
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1">
          <span className="label">Tính trên</span>
          <Segmented
            label="Tính trên"
            options={[
              { key: "paid", label: "Tiền đã thu" },
              { key: "done", label: "Đơn hoàn tất" },
            ]}
            value={base}
            onChange={setBase}
          />
        </div>
        <div className="grid gap-1">
          <span className="label">Cách tính bậc</span>
          <Segmented
            label="Cách tính bậc"
            options={[
              { key: "progressive", label: "Lũy tiến từng phần" },
              { key: "bracket", label: "Theo bậc đạt được" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
        <label className="grid gap-1">
          <span className="label">Thưởng trưởng nhóm (% doanh thu thành viên)</span>
          <input className="input h-8 w-[100px] tnum" inputMode="decimal" value={leader} onChange={(e) => setLeader(e.target.value)} />
        </label>
      </div>
      <div className="grid gap-2">
        <span className="label">Bậc hoa hồng</span>
        {tiers.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <span className="text-ink-2">Từ</span>
            <input className="input h-8 w-[170px] tnum" inputMode="numeric" aria-label="Mốc doanh thu (VNĐ)" value={t.from} onChange={(e) => setTiers((l) => l.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
            <span className="text-ink-2">₫ →</span>
            <input className="input h-8 w-[80px] tnum" inputMode="decimal" aria-label="Phần trăm" value={t.pct} onChange={(e) => setTiers((l) => l.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
            <span className="text-ink-2">%</span>
            <button type="button" className="btn-ghost h-8 px-2" aria-label="Xoá bậc" onClick={() => setTiers((l) => l.filter((_, j) => j !== i))} disabled={tiers.length <= 1}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost w-fit" onClick={() => setTiers((l) => [...l, { from: String((num(l[l.length - 1]?.from ?? "0") || 0) + 50_000_000), pct: "5" }])} disabled={tiers.length >= 20}>
          <Icon name="plus" size={15} /> Thêm bậc
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
        <span className="text-ink-2">Thử với doanh thu</span>
        <input className="input h-8 w-[160px] tnum" inputMode="numeric" aria-label="Doanh thu thử" value={sample} onChange={(e) => setSample(e.target.value)} />
        <span>
          → hoa hồng <b className="tnum">{Number.isFinite(s) ? vnd(commissionFor(s, { mode, tiers: parsed.filter((t) => Number.isFinite(t.from) && Number.isFinite(t.pct)) })) : "–"}</b>
        </span>
      </div>
      <p className="text-[12px] text-ink-2">Lũy tiến: mỗi phần doanh thu nằm trong bậc nào thì nhân % của bậc đó (như thuế thu nhập). Theo bậc: cả doanh thu nhân % của bậc cao nhất đã đạt.</p>
      {err && <p className="text-[13px] text-danger">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          Huỷ
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          <Icon name="check" size={15} /> {busy ? "Đang lưu…" : "Lưu quy tắc"}
        </button>
      </div>
    </section>
  );
}
