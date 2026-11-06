"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { Badge, EmptyState, Tabs } from "@/components/ui";
import { CreateTicketButton } from "@/components/care/CreateTicketButton";
import { ago } from "@/lib/format";
import { CHANNEL_LABEL, PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL, TICKET_STATUS_TONE, isOverdue, type Priority, type TicketStatus } from "@/lib/care/shared";
import type { TicketDTO } from "@/lib/care/tickets";

type Counts = Record<TicketStatus, number>;

/** Thời gian còn lại tới hạn SLA, dạng ngắn. */
export function dueText(dueAt: string | null) {
  if (!dueAt) return "";
  const ms = new Date(dueAt).getTime() - Date.now();
  const h = Math.abs(ms) / 3600e3;
  const s = h < 1 ? `${Math.max(1, Math.round(h * 60))} phút` : h < 48 ? `${Math.round(h)} giờ` : `${Math.round(h / 24)} ngày`;
  return ms < 0 ? `Quá hạn ${s}` : `Còn ${s}`;
}

type TeamLite = { id: string; name: string; color: string };

export function TicketsClient({ team, me, canManage, sla, initialStatus, teams = [], categories = [] }: { team: string[]; me: string; canManage: boolean; sla: Record<Priority, number>; initialStatus: string; teams?: TeamLite[]; categories?: string[] }) {
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [q, setQ] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<TicketDTO[] | null>(null);
  const [counts, setCounts] = useState<Counts>({ open: 0, pending: 0, resolved: 0, closed: 0 });
  const [overdue, setOverdue] = useState(0);
  const [showSla, setShowSla] = useState(false);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ status, assignee });
    if (priority) sp.set("priority", priority);
    if (q.trim()) sp.set("q", q.trim());
    if (overdueOnly) sp.set("overdue", "1");
    if (teamId) sp.set("teamId", teamId);
    if (category) sp.set("category", category);
    const r = await fetch(`/api/tickets?${sp}`);
    if (!r.ok) return setItems([]);
    const j = await r.json();
    setItems(j.items);
    setCounts(j.counts);
    setOverdue(j.overdue);
  }, [status, priority, assignee, q, overdueOnly, teamId, category]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const people = [...new Set([...team, me])];

  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold">Phiếu hỗ trợ</h1>
          <p className="mt-1 text-ink-2">Tiếp nhận khiếu nại, yêu cầu sau bán. Mỗi phiếu có hạn xử lý theo SLA và khảo sát hài lòng khi xong.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <button type="button" className={`btn-ghost ${showSla ? "bg-primary-selected" : ""}`} onClick={() => setShowSla(!showSla)} aria-expanded={showSla}>
              <Icon name="clock" size={15} /> SLA
            </button>
          )}
          <CreateTicketButton className="btn-primary" label="Phiếu mới" onCreated={() => load()} />
        </div>
      </div>

      {showSla && canManage && <SlaSettings initial={sla} onClose={() => setShowSla(false)} />}

      {overdue > 0 && (
        <button type="button" onClick={() => { setOverdueOnly(true); setStatus("all"); }} className="mt-4 flex w-full items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-left text-[13.5px] text-danger">
          <Icon name="clock" size={16} /> <b className="tnum">{overdue}</b> phiếu đã quá hạn SLA. Bấm để xem.
        </button>
      )}

      <Tabs
        className="mt-4"
        value={status}
        onChange={setStatus}
        items={[...TICKET_STATUSES.map((s) => ({ key: s, label: TICKET_STATUS_LABEL[s], count: counts[s] })), { key: "all", label: "Tất cả", count: Object.values(counts).reduce((a, b) => a + b, 0) }]}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 max-sm:w-full">
          <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm số phiếu, tiêu đề" aria-label="Tìm phiếu" className="input h-8 w-56 pl-8 max-sm:w-full" />
        </label>
        <select aria-label="Lọc theo mức ưu tiên" value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
          <option value="">Mọi mức ưu tiên</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select aria-label="Lọc theo người xử lý" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
          <option value="all">Mọi người</option>
          <option value={me}>Của tôi</option>
          <option value="none">Chưa giao</option>
          {people.filter((p) => p !== me).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {teams.length > 0 && (
          <select aria-label="Lọc theo đội" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
            <option value="">Mọi đội</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="none">Chưa có đội</option>
          </select>
        )}
        {categories.length > 0 && (
          <select aria-label="Lọc theo phân loại" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
            <option value="">Mọi phân loại</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="none">Chưa phân loại</option>
          </select>
        )}
        <label className="flex h-8 items-center gap-1.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /> Chỉ quá hạn
        </label>
      </div>

      <div className="card mt-3">
        {items === null ? (
          <div className="grid gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="ticket" title="Chưa có phiếu nào ở đây" desc="Tạo phiếu khi khách báo lỗi, khiếu nại hoặc cần hỗ trợ sau mua. Có thể tạo nhanh từ Hộp thư hoặc trang cuộc gọi." />
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((t) => {
              const late = isOverdue(t);
              return (
                <li key={t.id}>
                  <Link href={`/w/tickets/${t.id}`} className={`flex items-start gap-3 px-4 py-3 hover:bg-[var(--row-hover)] ${late ? "border-l-[3px] border-danger pl-[13px]" : ""}`}>
                    <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} title={PRIORITY_LABEL[t.priority]} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[12.5px] text-ink-2 tnum">{t.number}</span>
                        <span className="min-w-0 truncate font-medium">{t.subject}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
                        {t.customer && (
                          <span className="flex items-center gap-1">
                            <Icon name="person" size={12} /> {t.customer}
                          </span>
                        )}
                        <span>{CHANNEL_LABEL[t.channel] ?? t.channel}</span>
                        {t.category && <span>· {t.category}</span>}
                        {t.teamId && teams.find((x) => x.id === t.teamId) && (
                          <span className="flex items-center gap-1">
                            · <span className="h-2 w-2 rounded-full" style={{ background: teams.find((x) => x.id === t.teamId)!.color }} /> {teams.find((x) => x.id === t.teamId)!.name}
                          </span>
                        )}
                        <span suppressHydrationWarning>· {ago(t.createdAt)}</span>
                        {t.csat != null && <span className="text-warning">· {"★".repeat(t.csat)}</span>}
                      </p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      <Badge tone={TICKET_STATUS_TONE[t.status as TicketStatus] ?? "neutral"}>{TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status}</Badge>
                      {(t.status === "open" || t.status === "pending") && t.dueAt && (
                        <span className={`text-[12px] tnum ${late ? "font-medium text-danger" : "text-ink-2"}`} suppressHydrationWarning>
                          {dueText(t.dueAt)}
                        </span>
                      )}
                    </div>
                    <span className="hidden flex-none sm:block" title={t.assignee || "Chưa giao"}>
                      <Avatar name={t.assignee || "?"} size={26} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function SlaSettings({ initial, onClose }: { initial: Record<Priority, number>; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await fetch("/api/tickets/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slaHours: v }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? "Đã lưu. Áp dụng cho phiếu tạo từ bây giờ." : j.error ?? "Không lưu được");
  }
  return (
    <section className="card anim-fade mt-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">Thời hạn xử lý (SLA) theo mức ưu tiên</h2>
        <button type="button" className="btn-ghost h-7 w-7 justify-center p-0" aria-label="Đóng" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PRIORITIES.map((p) => (
          <label key={p} className="grid gap-1">
            <span className="flex items-center gap-1.5 text-[13px]">
              <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_COLOR[p] }} /> {PRIORITY_LABEL[p]}
            </span>
            <span className="flex items-center gap-1.5">
              <input type="number" min={0} max={1440} className="input h-8 tnum" value={v[p]} onChange={(e) => setV({ ...v, [p]: Number(e.target.value) })} />
              <span className="text-[13px] text-ink-2">giờ</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          Lưu SLA
        </button>
        <span className="text-[13px] text-ink-2">{msg || "Đặt 0 giờ nếu không muốn tính hạn cho mức đó."}</span>
      </div>
    </section>
  );
}
