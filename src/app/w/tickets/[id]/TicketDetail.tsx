"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui";
import { ago } from "@/lib/format";
import { CHANNEL_LABEL, PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL, TICKET_STATUS_TONE, isOverdue, type TicketStatus } from "@/lib/care/shared";
import type { TicketDTO } from "@/lib/care/tickets";
import { ContactPicker } from "@/components/care/ContactPicker";
import { dueText } from "../TicketsClient";

type Msg = { id: string; author: string; body: string; internal: boolean; at: string };
type Customer = { id: string; title: string; objectKey: string; phone: string; email: string; zaloUid: string; owner: string };
type Detail = { ticket: TicketDTO; customer: Customer | null; messages: Msg[]; logs: { id: string; user: string; summary: string; at: string }[]; csatUrl: string | null };
type Via = "" | "zalo" | "email" | "sms";

const when = (s: string) => new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

export function TicketDetail({ id, team, me, canDelete, teams = [], categories = [] }: { id: string; team: string[]; me: string; canDelete: boolean; teams?: { id: string; name: string; color: string }[]; categories?: string[] }) {
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [via, setVia] = useState<Via>("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [csatVia, setCsatVia] = useState<Via>("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/tickets/${id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Không tải được phiếu");
    setD(j);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-danger">{err}</p>;
  if (!d) return <div className="skeleton h-64" />;
  const t = d.ticket;
  const c = d.customer;
  const channels: { key: Via; label: string }[] = c ? [...(c.zaloUid ? [{ key: "zalo" as Via, label: "Zalo" }] : []), ...(c.email ? [{ key: "email" as Via, label: "Email" }] : []), ...(c.phone ? [{ key: "sms" as Via, label: "SMS" }] : [])] : [];

  async function patch(body: Record<string, unknown>) {
    setFlash(null);
    const r = await fetch(`/api/tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setFlash({ ok: false, text: j.error ?? "Không lưu được" });
    await load();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setFlash(null);
    const r = await fetch(`/api/tickets/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text, internal, sendVia: internal ? undefined : via || undefined }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setFlash({ ok: false, text: j.error ?? "Không gửi được" });
    setText("");
    if (j.send) setFlash(j.send.ok ? { ok: true, text: j.send.error ? `Đã lưu. ${j.send.error}` : "Đã gửi cho khách" } : { ok: false, text: `Đã lưu trả lời nhưng gửi cho khách lỗi: ${j.send.error}` });
    await load();
  }

  async function sendCsat() {
    if (!csatVia) return;
    setFlash(null);
    const r = await fetch(`/api/tickets/${id}/csat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: csatVia }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setFlash({ ok: false, text: j.error ?? "Không gửi được" });
    setFlash(j.send.ok ? { ok: true, text: j.send.error ? j.send.error : "Đã gửi link khảo sát cho khách" } : { ok: false, text: `Gửi khảo sát lỗi: ${j.send.error}` });
  }

  async function remove() {
    if (!confirm(`Xoá phiếu ${t.number}? Không hoàn tác được.`)) return;
    const r = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/w/tickets");
  }

  const late = isOverdue(t);
  const people = [...new Set([...team, me, ...(t.assignee ? [t.assignee] : [])])];

  return (
    <div className="grid gap-5">
      <div>
        <Link href="/w/tickets" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
          <Icon name="chevron" size={14} className="rotate-90" /> Phiếu hỗ trợ
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-ink-2 tnum">{t.number}</span>
          <Badge tone={TICKET_STATUS_TONE[t.status as TicketStatus] ?? "neutral"}>{TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status}</Badge>
          {late && <Badge tone="danger">Quá hạn</Badge>}
          {t.escalatedAt && <Badge tone="warning">Đã leo thang</Badge>}
        </div>
        <h1 className="mt-1 break-words text-[24px] font-semibold leading-tight">{t.subject}</h1>
      </div>

      {flash && (
        <p role="status" className={`rounded-lg px-3 py-2 text-[13.5px] ${flash.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {flash.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 content-start gap-4">
          {(t.status === "resolved" || t.status === "closed") && d.csatUrl && (
            <section className="card p-4">
              <h2 className="section-title">Khảo sát hài lòng</h2>
              {t.csat != null ? (
                <p className="mt-2">
                  <span className="text-[18px] text-warning">{"★".repeat(t.csat)}{"☆".repeat(5 - t.csat)}</span>
                  <span className="ml-2 text-ink-2 tnum">{t.csat}/5</span>
                  {t.csatComment && <span className="mt-1 block text-[14px]">“{t.csatComment}”</span>}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[13.5px] text-ink-2">Gửi link này cho khách để chấm 1–5 sao. Mỗi phiếu nhận một lần đánh giá.</p>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <input readOnly value={d.csatUrl} className="input h-8 min-w-0 flex-1 text-[13px]" aria-label="Link khảo sát" onFocus={(e) => e.target.select()} />
                    <button
                      type="button"
                      className="btn-outline h-8 flex-none"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(d.csatUrl!).catch(() => undefined);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Đã chép" : "Chép"}
                    </button>
                  </div>
                  {channels.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select aria-label="Kênh gửi khảo sát" value={csatVia} onChange={(e) => setCsatVia(e.target.value as Via)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
                        <option value="">Gửi qua…</option>
                        {channels.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn-outline h-8" disabled={!csatVia} onClick={sendCsat}>
                        <Icon name="send" size={14} /> Gửi khảo sát
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <section className="card p-4">
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <Avatar name={t.createdBy || "?"} size={22} />
              <span>
                <b className="font-medium text-ink">{t.createdBy || "Hệ thống"}</b> tạo qua {CHANNEL_LABEL[t.channel] ?? t.channel} · <span suppressHydrationWarning>{when(t.createdAt)}</span>
              </span>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-[14.5px]">{t.body || <span className="text-ink-2">Không có mô tả.</span>}</p>
          </section>

          {d.messages.map((m) => (
            <section key={m.id} className={`rounded-lg border p-4 ${m.internal ? "border-warning/40 bg-warning-soft" : "border-line-soft bg-surface"}`}>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <Avatar name={m.author} size={22} />
                <b className="font-medium text-ink">{m.author}</b>
                {m.internal ? <Badge tone="warning">Ghi chú nội bộ</Badge> : <Badge tone="info">Trả lời khách</Badge>}
                <span suppressHydrationWarning>{ago(m.at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-[14.5px]">{m.body}</p>
            </section>
          ))}

          <form onSubmit={send} className="card grid gap-2 p-3">
            <div className="segmented w-fit" role="tablist" aria-label="Loại tin">
              <button type="button" aria-pressed={!internal} onClick={() => setInternal(false)}>
                <Icon name="chat" size={14} /> Trả lời khách
              </button>
              <button type="button" aria-pressed={internal} onClick={() => setInternal(true)}>
                <Icon name="lock" size={14} /> Ghi chú nội bộ
              </button>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} className={`textarea min-h-[96px] ${internal ? "bg-warning-soft" : ""}`} placeholder={internal ? "Chỉ người trong nhóm thấy" : "Nội dung trả lời khách"} maxLength={5000} aria-label="Nội dung" />
            <div className="flex flex-wrap items-center gap-2">
              {!internal &&
                (channels.length ? (
                  <select aria-label="Gửi cho khách qua" value={via} onChange={(e) => setVia(e.target.value as Via)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
                    <option value="">Chỉ lưu, không gửi</option>
                    {channels.map((x) => (
                      <option key={x.key} value={x.key}>
                        Gửi qua {x.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[12.5px] text-ink-2">{c ? "Khách chưa có Zalo/email/SĐT để gửi trực tiếp" : "Gắn khách để gửi trả lời trực tiếp"}</span>
                ))}
              <button type="submit" className="btn-primary ml-auto" disabled={busy || !text.trim()}>
                <Icon name="send" size={14} /> {internal ? "Lưu ghi chú" : via ? "Gửi" : "Lưu trả lời"}
              </button>
            </div>
          </form>
        </div>

        <aside className="grid min-w-0 content-start gap-4">
          <section className="card grid gap-3 p-4">
            <label className="grid gap-1">
              <span className="label">Trạng thái</span>
              <select className="input h-8" value={t.status} onChange={(e) => patch({ status: e.target.value })}>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="label">Mức ưu tiên</span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                <select className="input h-8" value={t.priority} onChange={(e) => patch({ priority: e.target.value })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {(categories.length > 0 || t.category) && (
              <label className="grid gap-1">
                <span className="label">Phân loại</span>
                <select className="input h-8" value={t.category} onChange={(e) => patch({ category: e.target.value })}>
                  <option value="">Chưa phân loại</option>
                  {[...new Set([...categories, ...(t.category ? [t.category] : [])])].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {teams.length > 0 && (
              <label className="grid gap-1">
                <span className="label">Đội xử lý</span>
                <select className="input h-8" value={t.teamId ?? ""} onChange={(e) => patch({ teamId: e.target.value || null })}>
                  <option value="">Chưa có đội</option>
                  {teams.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="grid gap-1">
              <span className="label">Người xử lý</span>
              <select className="input h-8" value={t.assignee} onChange={(e) => patch({ assignee: e.target.value })}>
                <option value="">Chưa giao</option>
                {people.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1">
              <span className="label">Hạn xử lý</span>
              {t.dueAt ? (
                <p className={`text-[14px] ${late ? "font-medium text-danger" : ""}`} suppressHydrationWarning>
                  {when(t.dueAt)}
                  {(t.status === "open" || t.status === "pending") && <span className="block text-[12.5px] text-ink-2">{dueText(t.dueAt)}</span>}
                </p>
              ) : (
                <p className="text-[14px] text-ink-2">Không đặt hạn</p>
              )}
            </div>
            {t.resolvedAt && (
              <div className="grid gap-1">
                <span className="label">Xử lý xong</span>
                <p className="text-[14px]" suppressHydrationWarning>{when(t.resolvedAt)}</p>
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="section-title">Khách</h2>
            {c ? (
              <div className="mt-2 grid gap-1 text-[14px]">
                <Link href={`/w/b/${c.objectKey}?open=${c.id}`} className="font-medium text-primary hover:underline">
                  {c.title}
                </Link>
                {c.phone && <span className="text-ink-2 tnum">{c.phone}</span>}
                {c.email && <span className="break-all text-ink-2">{c.email}</span>}
                {c.owner && <span className="text-[12.5px] text-ink-2">Phụ trách: {c.owner}</span>}
                <button type="button" className="btn-ghost mt-1 h-7 w-fit px-2 text-[12.5px] text-ink-2" onClick={() => patch({ recordId: null })}>
                  Bỏ gắn khách
                </button>
              </div>
            ) : (
              <div className="mt-2 grid gap-1.5">
                <p className="text-[13.5px] text-ink-2">Chưa gắn khách.</p>
                <ContactPicker value={null} onChange={(x) => x && patch({ recordId: x.id })} />
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="section-title">Nhật ký</h2>
            <ul className="mt-2 grid gap-2 text-[13px]">
              {d.logs.length === 0 && <li className="text-ink-2">Chưa có thao tác.</li>}
              {d.logs.map((l) => (
                <li key={l.id} className="min-w-0">
                  <b className="font-medium">{l.user}</b> <span className="break-words text-ink-2">{l.summary.replace(/^Phiếu [^:]+: /, "")}</span>
                  <span className="block text-[12px] text-ink-2" suppressHydrationWarning>
                    {ago(l.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {canDelete && (
            <button type="button" className="btn-ghost w-fit text-danger" onClick={remove}>
              <Icon name="trash" size={14} /> Xoá phiếu
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
