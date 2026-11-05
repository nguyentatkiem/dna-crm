"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { color } from "@/lib/colors";
import { ago } from "@/lib/format";
import type { Attachment, ConversationDTO, MessageDTO, RecordCard } from "@/lib/inbox";

type Counts = { all: number; unread: number; mine: number; done: number };
type ListData = { items: ConversationDTO[]; counts: Counts; unreadTotal: number };
type Detail = { conversation: ConversationDTO; messages: MessageDTO[]; record: RecordCard | null; activities: { id: string; kind: string; body: string; author: string; at: string }[] };
type Setup = { zaloUrl: string; fbUrl: string; zalo: boolean; messenger: boolean };
type Props = { me: string; team: string[]; contactLabel: string; initial: ListData; initialId: string | null; setup: Setup };
type Pane = "list" | "thread" | "info";

const CH = {
  zalo: { label: "Zalo", bg: "#0068ff" },
  messenger: { label: "Messenger", bg: "#0084ff" },
} as const;

const FILTERS = [
  ["all", "Tất cả"],
  ["unread", "Chưa đọc"],
  ["mine", "Của tôi"],
  ["done", "Đã xong"],
] as const;

const QUICK_KEY = "dna-inbox-quick";
const DEFAULT_QUICK = [
  "Dạ em chào anh/chị {ten}, em có thể hỗ trợ gì cho mình ạ?",
  "Dạ anh/chị cho em xin số điện thoại để em tư vấn kỹ hơn nhé ạ.",
  "Dạ em gửi anh/chị bảng giá chi tiết ngay đây ạ.",
  "Dạ anh/chị muốn đặt lịch vào ngày giờ nào để em giữ chỗ ạ?",
  "Dạ em đã nhận thông tin, em kiểm tra và phản hồi anh/chị trong ít phút nữa ạ.",
  "Dạ em cảm ơn anh/chị {ten} đã tin tưởng ạ. Chúc anh/chị một ngày vui!",
];

const TITLE = "Hộp thư · DNA CRM";

/** Thời gian ngắn cho danh sách: vừa xong / 5 phút / 2 giờ / Hôm qua / 12/10. */
function short(at: string) {
  const d = new Date(at);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return `${Math.floor(s / 3600)} giờ`;
  if (d.getTime() >= today.getTime() - 864e5) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function dayLabel(at: string) {
  const d = new Date(at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return "Hôm nay";
  if (d.getTime() >= today.getTime() - 864e5) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
}

const hhmm = (at: string) => new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const given = (name: string) => (/^Khách/.test(name) ? "" : (name.trim().split(/\s+/).pop() ?? ""));

function ChannelBadge({ channel, small }: { channel: string; small?: boolean }) {
  const c = CH[channel as keyof typeof CH] ?? { label: channel, bg: "#676879" };
  return (
    <span className={`inline-flex flex-none items-center rounded font-semibold text-white ${small ? "px-1 text-[10px] leading-[16px]" : "px-1.5 text-[11px] leading-[18px]"}`} style={{ background: c.bg }}>
      {c.label}
    </span>
  );
}

function Face({ c, size = 36 }: { c: Pick<ConversationDTO, "name" | "avatar" | "channel">; size?: number }) {
  const ch = CH[c.channel as keyof typeof CH];
  return (
    <span className="relative inline-block flex-none" style={{ width: size, height: size }}>
      {c.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.avatar} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <Avatar name={c.name} size={size} />
      )}
      {ch && (
        <span className="absolute -bottom-0.5 -right-0.5 grid h-[15px] w-[15px] place-items-center rounded-full border-2 border-surface text-[8px] font-bold text-white" style={{ background: ch.bg }} title={ch.label}>
          {c.channel === "zalo" ? "Z" : "m"}
        </span>
      )}
    </span>
  );
}

async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `Lỗi ${res.status}`);
  return j as T;
}

export function Inbox({ me, team, contactLabel, initial, initialId, setup }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [channel, setChannel] = useState<string>("");
  const [q, setQ] = useState("");
  const [list, setList] = useState<ListData>(initial);
  const [selId, setSelId] = useState<string | null>(initialId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pane, setPane] = useState<Pane>(initialId ? "thread" : "list");
  const [loadErr, setLoadErr] = useState("");
  const query = useRef({ filter, channel, q });
  query.current = { filter, channel, q };
  const selRef = useRef(selId);
  selRef.current = selId;

  const loadList = useCallback(async () => {
    const { filter, channel, q } = query.current;
    const u = new URLSearchParams({ filter, channel, q });
    try {
      setList(await api<ListData>(`/api/inbox?${u}`));
      setLoadErr("");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Không tải được hộp thư");
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api<Detail>(`/api/inbox/${id}`);
      if (selRef.current === id) setDetail(d);
    } catch {
      if (selRef.current === id) setDetail(null);
    }
  }, []);

  // Đổi bộ lọc: tải lại ngay (ô tìm chờ 300ms).
  useEffect(() => {
    const t = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [filter, channel, q, loadList]);

  useEffect(() => {
    setDetail(null);
    if (!selId) return;
    loadDetail(selId).then(loadList);
    const u = new URL(window.location.href);
    u.searchParams.set("c", selId);
    window.history.replaceState(null, "", u);
  }, [selId, loadDetail, loadList]);

  // Tự làm mới mỗi 10 giây khi tab đang mở.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      loadList();
      if (selRef.current) loadDetail(selRef.current);
    }, 10000);
    return () => clearInterval(t);
  }, [loadList, loadDetail]);

  useEffect(() => {
    document.title = list.unreadTotal ? `(${list.unreadTotal}) ${TITLE}` : TITLE;
  }, [list.unreadTotal]);
  useEffect(() => () => void (document.title = TITLE), []);

  const refresh = useCallback(async () => {
    if (selRef.current) await loadDetail(selRef.current);
    await loadList();
  }, [loadDetail, loadList]);

  const empty = !list.counts.all && !list.counts.done && !q && !channel;
  const sel = detail?.conversation.id === selId ? detail : null;
  const listItem = list.items.find((c) => c.id === selId);

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-surface md:rounded-tl-lg">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Cột trái: danh sách hội thoại */}
        <section className={`${pane === "list" ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col border-line-soft md:border-r`} aria-label="Danh sách hội thoại">
          <div className="border-b border-line-soft px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-[20px] font-semibold">Hộp thư</h1>
              <button type="button" onClick={refresh} className="btn-ghost h-8 w-8 justify-center px-0" title="Làm mới" aria-label="Làm mới">
                <Icon name="refresh" size={16} />
              </button>
            </div>
            <div className="relative mt-2">
              <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
              <input className="input h-8 pl-8 text-[13px]" placeholder="Tìm tên khách hoặc nội dung" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm hội thoại" />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto" role="tablist" aria-label="Lọc hội thoại">
              {FILTERS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={filter === k}
                  onClick={() => setFilter(k)}
                  className={`flex h-7 flex-none items-center gap-1 rounded-full px-2.5 text-[12.5px] ${filter === k ? "bg-primary-selected font-medium text-ink" : "text-ink-2 hover:bg-hover"}`}
                >
                  {label}
                  {k !== "all" && list.counts[k] > 0 && <span className="tnum text-[11px] text-ink-2">{list.counts[k]}</span>}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              {[["", "Mọi kênh"], ["zalo", "Zalo"], ["messenger", "Messenger"]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setChannel(k)} className={`flex h-6 items-center gap-1 rounded border px-2 text-[12px] ${channel === k ? "border-primary text-ink" : "border-line-soft text-ink-2 hover:bg-hover"}`}>
                  {k && <span className="h-2 w-2 rounded-full" style={{ background: CH[k as keyof typeof CH].bg }} />}
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loadErr && <p className="mx-4 mt-2 rounded bg-[#ffe5e9] px-2 py-1 text-[12px] text-[#a1172d]">{loadErr}</p>}
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {list.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelId(c.id);
                    setPane("thread");
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left ${c.id === selId ? "bg-primary-selected" : "hover:bg-hover"}`}
                >
                  <Face c={c} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <b className={`min-w-0 flex-1 truncate text-[14px] ${c.unread ? "font-semibold" : "font-medium"}`}>{c.name}</b>
                      <span className={`flex-none text-[11.5px] tnum ${c.unread ? "font-medium text-primary" : "text-ink-2"}`}>{short(c.lastAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${c.unread ? "text-ink" : "text-ink-2"}`}>{c.lastText || "Chưa có tin"}</span>
                      {c.unread > 0 && (
                        <span className="grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white tnum" aria-label={`${c.unread} tin chưa đọc`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-2">
                      <ChannelBadge channel={c.channel} small />
                      {c.status === "done" && <span className="rounded bg-[#00c875] px-1 text-[10px] leading-[16px] text-white">Đã xong</span>}
                      {c.assignee ? <span className="truncate">· {c.assignee}</span> : <span className="truncate italic">· chưa giao</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {!list.items.length && !empty && (
              <li className="px-4 py-10 text-center text-[13px] text-ink-2">
                {filter === "unread" ? "Đã đọc hết, không còn tin nào chờ." : filter === "mine" ? "Chưa có hội thoại nào giao cho bạn." : filter === "done" ? "Chưa có hội thoại nào đánh dấu xong." : "Không có hội thoại khớp bộ lọc."}
              </li>
            )}
            {empty && (
              <li className="px-4 py-8 text-center text-[13px] text-ink-2">
                <Icon name="inbox" size={26} className="mx-auto mb-2" />
                Chưa có tin nhắn nào. Kết nối Zalo OA hoặc Messenger để tin của khách về đây.
              </li>
            )}
          </ul>
        </section>

        {/* Cột giữa: luồng tin */}
        <section className={`${pane === "thread" ? "flex" : pane === "info" ? "hidden xl:flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`} aria-label="Hội thoại">
          {selId && (sel || listItem) ? (
            <Thread
              key={selId}
              conv={sel?.conversation ?? listItem!}
              messages={sel?.messages ?? null}
              me={me}
              team={team}
              onBack={() => setPane("list")}
              onInfo={() => setPane("info")}
              onChanged={refresh}
            />
          ) : empty ? (
            <SetupGuide setup={setup} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-ink-2">
              <div>
                <Icon name="chat" size={30} className="mx-auto mb-2" />
                <b className="block text-ink">Chọn một hội thoại</b>
                <p className="mt-1 text-[13px]">Tin Zalo OA và Messenger của khách hiện ở cột bên trái, tự làm mới mỗi 10 giây.</p>
              </div>
            </div>
          )}
        </section>

        {/* Cột phải: thông tin khách */}
        <aside className={`${pane === "info" ? "flex" : "hidden xl:flex"} min-h-0 min-w-0 flex-col overflow-y-auto border-line-soft bg-surface-2 xl:border-l`} aria-label="Thông tin khách">
          {sel ? (
            <CustomerPanel detail={sel} contactLabel={contactLabel} onBack={() => setPane("thread")} onChanged={refresh} />
          ) : (
            <div className="p-6 text-center text-[13px] text-ink-2">{selId ? "Đang tải…" : `Thông tin ${contactLabel.toLowerCase()} sẽ hiện ở đây.`}</div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ───────────────────────────── Luồng tin ───────────────────────────── */

function Thread({ conv, messages, me, team, onBack, onInfo, onChanged }: { conv: ConversationDTO; messages: MessageDTO[] | null; me: string; team: string[]; onBack: () => void; onInfo: () => void; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = messages?.[messages.length - 1]?.id;

  // Cuộn xuống cuối khi có tin mới.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr("");
    try {
      await api(`/api/inbox/${conv.id}`, { method: "PATCH", json: body });
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy("");
    }
  }

  const members = useMemo(() => [...new Set([...team, me].filter(Boolean))], [team, me]);
  const groups = useMemo(() => {
    const out: { day: string; items: MessageDTO[] }[] = [];
    for (const m of messages ?? []) {
      const day = dayLabel(m.at);
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(m);
    }
    return out;
  }, [messages]);

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5 sm:px-4">
        <button type="button" onClick={onBack} className="btn-ghost h-8 w-8 justify-center px-0 md:hidden" aria-label="Quay lại danh sách">
          <Icon name="chevron" size={18} className="rotate-90" />
        </button>
        <Face c={conv} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <b className="truncate text-[15px]">{conv.name}</b>
            <ChannelBadge channel={conv.channel} />
          </div>
          <p className="truncate text-[12px] text-ink-2">{conv.recordTitle ? `Đã gắn hồ sơ: ${conv.recordTitle}` : "Chưa gắn hồ sơ khách"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor="assignee">Giao cho</label>
          <select id="assignee" className="input h-8 w-auto max-w-[150px] py-0 pr-7 text-[13px]" value={conv.assignee} disabled={!!busy} onChange={(e) => patch({ assignee: e.target.value }, "assign")}>
            <option value="">Chưa giao</option>
            {members.map((m) => (
              <option key={m} value={m}>
                {m === me ? `${m} (bạn)` : m}
              </option>
            ))}
            {conv.assignee && !members.includes(conv.assignee) && <option value={conv.assignee}>{conv.assignee}</option>}
          </select>
          {conv.status === "done" ? (
            <button type="button" className="btn-outline h-8 text-[13px]" disabled={!!busy} onClick={() => patch({ status: "open" }, "status")}>
              <Icon name="refresh" size={14} /> Mở lại
            </button>
          ) : (
            <button type="button" className="btn h-8 bg-[#00c875] text-[13px] text-white hover:brightness-95" disabled={!!busy} onClick={() => patch({ status: "done" }, "status")}>
              <Icon name="check" size={14} /> Đã xong
            </button>
          )}
          <button type="button" onClick={onInfo} className="btn-outline h-8 text-[13px] xl:hidden" aria-label="Thông tin khách">
            <Icon name="person" size={14} /> <span className="hidden sm:inline">Khách</span>
          </button>
        </div>
      </header>
      {err && <p className="mx-4 mt-2 rounded bg-[#ffe5e9] px-2 py-1 text-[12px] text-[#a1172d]">{err}</p>}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-surface-2 px-3 py-4 sm:px-6">
        {!messages ? (
          <p className="py-10 text-center text-[13px] text-ink-2">Đang tải tin nhắn…</p>
        ) : !messages.length ? (
          <p className="py-10 text-center text-[13px] text-ink-2">Chưa có tin nhắn.</p>
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <div className="my-3 flex items-center gap-3 text-[11.5px] text-ink-2">
                <span className="h-px flex-1 bg-line-soft" />
                {g.day}
                <span className="h-px flex-1 bg-line-soft" />
              </div>
              <ul className="space-y-1.5">
                {g.items.map((m) => (
                  <Bubble key={m.id} m={m} conv={conv} onResent={onChanged} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      <Composer conv={conv} onSent={onChanged} />
    </>
  );
}

function Attach({ a }: { a: Attachment }) {
  if (a.type === "location" && a.lat != null && a.lng != null)
    return (
      <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1.5 underline">
        <Icon name="target" size={14} /> Vị trí đã chia sẻ
      </a>
    );
  if ((a.type === "image" || a.type === "sticker" || a.type === "gif") && a.url)
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.type === "sticker" ? "Sticker" : "Ảnh khách gửi"} className={`rounded-md object-cover ${a.type === "sticker" ? "max-h-24" : "max-h-56 max-w-full"}`} />
      </a>
    );
  const label = { image: "Ảnh", sticker: "Sticker", file: "Tệp", audio: "Ghi âm", video: "Video", gif: "Ảnh GIF", location: "Vị trí", link: "Liên kết" }[a.type] ?? "Tệp đính kèm";
  return a.url ? (
    <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1.5 underline">
      <Icon name="doc" size={14} /> {a.name || label}
    </a>
  ) : (
    <span className="mt-1 block italic opacity-80">[{label}]</span>
  );
}

function Bubble({ m, conv, onResent }: { m: MessageDTO; conv: ConversationDTO; onResent: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const event = m.attachments.some((a) => a.type === "event");
  if (event)
    return (
      <li className="flex justify-center">
        <span className="rounded-full bg-surface px-3 py-1 text-[12px] text-ink-2">
          {m.text} · {hhmm(m.at)}
        </span>
      </li>
    );
  async function resend(humanAgent?: boolean) {
    setBusy(true);
    try {
      await api(`/api/inbox/${conv.id}/messages`, { method: "POST", json: { text: m.text, humanAgent } });
      await onResent();
    } finally {
      setBusy(false);
    }
  }
  const mine = m.direction !== "in";
  const note = m.direction === "note";
  const failed = m.status === "failed";
  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] leading-snug ${
            note
              ? "rounded-br-md border border-[#f5d66b] bg-[#fff4cc] text-[#5c4400]"
              : mine
                ? `rounded-br-md bg-primary text-white ${failed ? "opacity-70 ring-2 ring-[#df2f4a]" : ""}`
                : "rounded-bl-md border border-line-soft bg-surface text-ink"
          }`}
        >
          {note && (
            <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
              <Icon name="lock" size={11} /> Ghi chú nội bộ
            </span>
          )}
          {m.text}
          {m.attachments.map((a, i) => (
            <Attach key={i} a={a} />
          ))}
        </div>
        <span className="mt-0.5 px-1 text-[11px] text-ink-2">
          {mine && m.author ? `${m.author} · ` : ""}
          {hhmm(m.at)}
          {failed && <b className="ml-1 font-medium text-[#df2f4a]">· Gửi lỗi</b>}
        </span>
        {failed && (
          <div className="mt-1 max-w-full rounded-md border border-[#f3b4bf] bg-[#ffe5e9] px-2.5 py-1.5 text-[12px] text-[#a1172d]">
            {m.error}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button type="button" className="rounded bg-white/70 px-2 py-0.5 font-medium hover:bg-white" disabled={busy} onClick={() => resend()}>
                Gửi lại
              </button>
              {conv.channel === "messenger" && /HUMAN_AGENT/.test(m.error) && (
                <button type="button" className="rounded bg-white/70 px-2 py-0.5 font-medium hover:bg-white" disabled={busy} onClick={() => resend(true)}>
                  Gửi với tag HUMAN_AGENT
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/* ───────────────────────────── Ô soạn tin ───────────────────────────── */

function loadQuick(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(QUICK_KEY) ?? "null");
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : DEFAULT_QUICK;
  } catch {
    return DEFAULT_QUICK;
  }
}
function saveQuick(list: string[]) {
  try {
    localStorage.setItem(QUICK_KEY, JSON.stringify(list));
  } catch {
    // trình duyệt chặn lưu: bỏ qua
  }
}

function Composer({ conv, onSent }: { conv: ConversationDTO; onSent: () => Promise<void> }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState<string[]>(DEFAULT_QUICK);
  const [newQuick, setNewQuick] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setQuick(loadQuick()), []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [text]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy("send");
    setErr("");
    try {
      const r = await api<{ ok: boolean; error?: string }>(`/api/inbox/${conv.id}/messages`, { method: "POST", json: { text: t, note: mode === "note" } });
      setText("");
      if (!r.ok && r.error) setErr(r.error);
      await onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không gửi được");
    } finally {
      setBusy("");
      box.current?.focus();
    }
  }

  async function draft() {
    setBusy("draft");
    setErr("");
    try {
      const r = await api<{ text: string; intentLabel: string; source: "ai" | "rule" }>(`/api/inbox/${conv.id}/draft`, { method: "POST" });
      setMode("reply");
      setText(r.text);
      setHint(r.source === "ai" ? `Claude soạn · ý định: ${r.intentLabel}. Kiểm tra lại trước khi gửi.` : `Mẫu câu theo ý định “${r.intentLabel}” (chưa có AI). Sửa phần [ ] trước khi gửi.`);
      box.current?.focus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không soạn được");
    } finally {
      setBusy("");
    }
  }

  const fill = (t: string) => t.replace(/\{ten\}/g, given(conv.name)).replace(/\s{2,}/g, " ").replace(/ ,/g, ",");

  return (
    <div className={`border-t border-line-soft p-2.5 sm:p-3 ${mode === "note" ? "bg-surface-2" : "bg-surface"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => setMode("reply")} className={`h-7 rounded px-2.5 text-[12.5px] ${mode === "reply" ? "bg-primary-selected font-medium text-ink" : "text-ink-2 hover:bg-hover"}`}>
          Trả lời qua {CH[conv.channel as keyof typeof CH]?.label ?? conv.channel}
        </button>
        <button type="button" onClick={() => setMode("note")} className={`flex h-7 items-center gap-1 rounded px-2.5 text-[12.5px] ${mode === "note" ? "bg-[#fff4cc] font-medium text-[#5c4400]" : "text-ink-2 hover:bg-hover"}`}>
          <Icon name="lock" size={12} /> Ghi chú nội bộ
        </button>
        <span className="flex-1" />
        <div className="relative">
          <button type="button" onClick={() => setQuickOpen((v) => !v)} className="btn-ghost h-7 px-2 text-[12.5px]" aria-expanded={quickOpen}>
            <Icon name="bolt" size={13} /> Mẫu nhanh
          </button>
          {quickOpen && (
            <div className="absolute bottom-9 right-0 z-20 w-[min(340px,calc(100vw-24px))] rounded-lg border border-line bg-surface p-1.5 shadow-lg">
              <ul className="max-h-64 overflow-y-auto">
                {quick.map((t, i) => (
                  <li key={i} className="group flex items-start gap-1 rounded hover:bg-hover">
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-2 py-1.5 text-left text-[13px]"
                      onClick={() => {
                        setText((cur) => (cur.trim() ? cur.trimEnd() + " " : "") + fill(t));
                        setQuickOpen(false);
                        box.current?.focus();
                      }}
                    >
                      {fill(t)}
                    </button>
                    <button
                      type="button"
                      className="mt-1 hidden h-6 w-6 flex-none place-items-center rounded text-ink-2 hover:text-[#df2f4a] group-hover:grid"
                      aria-label="Xoá mẫu"
                      onClick={() => {
                        const next = quick.filter((_, k) => k !== i);
                        setQuick(next);
                        saveQuick(next);
                      }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="mt-1 flex gap-1 border-t border-line-soft pt-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = newQuick.trim();
                  if (!t) return;
                  const next = [...quick, t];
                  setQuick(next);
                  saveQuick(next);
                  setNewQuick("");
                }}
              >
                <input className="input h-8 text-[12.5px]" placeholder="Thêm mẫu, dùng {ten} cho tên khách" value={newQuick} onChange={(e) => setNewQuick(e.target.value)} />
                <button className="btn-outline h-8 px-2 text-[12.5px]" type="submit">
                  Thêm
                </button>
              </form>
            </div>
          )}
        </div>
        <button type="button" onClick={draft} disabled={!!busy} className="btn-ghost h-7 px-2 text-[12.5px] text-primary">
          <Icon name="spark" size={13} /> {busy === "draft" ? "Đang soạn…" : "AI soạn trả lời"}
        </button>
      </div>
      {hint && text && <p className="mb-1.5 text-[11.5px] text-ink-2">{hint}</p>}
      {err && <p className="mb-1.5 rounded bg-[#ffe5e9] px-2 py-1 text-[12px] text-[#a1172d]">{err}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={mode === "note" ? "Ghi chú chỉ đội ngũ thấy, khách không nhận được…" : "Nhập tin nhắn · Enter để gửi, Shift+Enter xuống dòng"}
          className={`textarea min-h-[40px] resize-none ${mode === "note" ? "border-[#f5d66b]" : ""}`}
          aria-label={mode === "note" ? "Ghi chú nội bộ" : "Tin nhắn trả lời"}
        />
        <button type="button" onClick={send} disabled={!text.trim() || !!busy} className={`${mode === "note" ? "btn bg-[#ffcb00] text-[#3d2d00] hover:brightness-95" : "btn-primary"} h-10 flex-none`}>
          <Icon name={mode === "note" ? "edit" : "send"} size={15} />
          <span className="hidden sm:inline">{busy === "send" ? "Đang gửi…" : mode === "note" ? "Lưu ghi chú" : "Gửi"}</span>
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Thẻ khách ───────────────────────────── */

function CustomerPanel({ detail, contactLabel, onBack, onChanged }: { detail: Detail; contactLabel: string; onBack: () => void; onChanged: () => Promise<void> }) {
  const { conversation: conv, record: r, activities } = detail;
  const [mode, setMode] = useState<"" | "create" | "link">("");
  const [title, setTitle] = useState(conv.name);
  const [phone, setPhone] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; title: string; phone: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const term = contactLabel.toLowerCase();

  useEffect(() => {
    if (mode !== "link") return;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: typeof found }>(`/api/inbox/${conv.id}/link?q=${encodeURIComponent(q)}`);
        setFound(res.items);
      } catch {
        setFound([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode, conv.id]);

  async function link(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/inbox/${conv.id}/link`, { method: "POST", json: body });
      setMode("");
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm(`Bỏ gắn hội thoại này khỏi hồ sơ ${r?.title}?`)) return;
    await api(`/api/inbox/${conv.id}`, { method: "PATCH", json: { recordId: null } }).catch(() => {});
    await onChanged();
  }

  const st = r ? color(r.statusColor) : null;
  return (
    <div className="p-4">
      <button type="button" onClick={onBack} className="btn-ghost -ml-2 mb-2 h-8 px-2 text-[13px] xl:hidden">
        <Icon name="chevron" size={16} className="rotate-90" /> Quay lại hội thoại
      </button>
      <div className="flex items-center gap-3">
        <Face c={conv} size={44} />
        <div className="min-w-0">
          <b className="block truncate text-[15px]">{r?.title ?? conv.name}</b>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-2">
            <ChannelBadge channel={conv.channel} small /> {conv.assignee ? `Phụ trách: ${conv.assignee}` : "Chưa giao"}
          </span>
        </div>
      </div>

      {r ? (
        <div className="card mt-4 p-3">
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-2 text-[13px]">
            <dt className="text-ink-2">Điện thoại</dt>
            <dd className="truncate tnum">{r.phone || <span className="text-ink-2">Chưa có</span>}</dd>
            <dt className="text-ink-2">Điểm</dt>
            <dd>
              <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-white tnum" style={{ background: r.score >= 70 ? "#df2f4a" : r.score >= 40 ? "#fdab3d" : "#579bfc" }}>
                {r.score}
              </span>
            </dd>
            <dt className="text-ink-2">Trạng thái</dt>
            <dd>
              <span className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[12px]" style={{ background: st!.bg, color: st!.fg }}>
                {r.status}
              </span>
            </dd>
            <dt className="text-ink-2">Nguồn</dt>
            <dd className="truncate">{r.source || <span className="text-ink-2">Không rõ</span>}</dd>
            <dt className="text-ink-2">Phụ trách</dt>
            <dd className="truncate">{r.owner || <span className="text-ink-2">Chưa có</span>}</dd>
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href={`/w/b/contacts?open=${r.id}`} className="btn-outline h-8 justify-center text-[13px]">
              <Icon name="open" size={14} /> Mở hồ sơ
            </Link>
            <Link href={`/w/telesales?record=${r.id}`} className="btn-primary h-8 justify-center text-[13px]">
              <Icon name="phone" size={14} /> Gọi
            </Link>
          </div>
          <button type="button" onClick={unlink} className="mt-2 w-full text-center text-[12px] text-ink-2 hover:text-ink hover:underline">
            Bỏ gắn hồ sơ
          </button>
        </div>
      ) : (
        <div className="card mt-4 p-3">
          <p className="text-[13px] text-ink-2">Hội thoại chưa gắn với {term} nào. Gắn để xem lịch sử, chấm điểm và gọi điện.</p>
          {mode === "" && (
            <div className="mt-3 grid gap-2">
              <button type="button" className="btn-primary justify-center" onClick={() => setMode("create")}>
                <Icon name="plus" size={14} /> Tạo {term}
              </button>
              <button type="button" className="btn-outline justify-center" onClick={() => setMode("link")}>
                <Icon name="link" size={14} /> Gắn với {term} có sẵn
              </button>
            </div>
          )}
          {mode === "create" && (
            <form
              className="mt-3 grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                link({ mode: "create", title, phone });
              }}
            >
              <label className="label" htmlFor="nc-name">Tên</label>
              <input id="nc-name" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <label className="label" htmlFor="nc-phone">Số điện thoại</label>
              <input id="nc-phone" className="input" inputMode="tel" placeholder="Không bắt buộc" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <div className="mt-1 flex gap-2">
                <button className="btn-primary flex-1 justify-center" disabled={busy}>
                  {busy ? "Đang tạo…" : `Tạo ${term}`}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMode("")}>
                  Huỷ
                </button>
              </div>
            </form>
          )}
          {mode === "link" && (
            <div className="mt-3">
              <input className="input" autoFocus placeholder="Tìm theo tên hoặc số điện thoại" value={q} onChange={(e) => setQ(e.target.value)} />
              <ul className="mt-2 max-h-60 overflow-y-auto">
                {found.map((f) => (
                  <li key={f.id}>
                    <button type="button" disabled={busy} onClick={() => link({ mode: "existing", recordId: f.id })} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover">
                      <Avatar name={f.title} size={24} />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px] font-medium">{f.title}</b>
                        <span className="block truncate text-[11.5px] text-ink-2">{[f.phone, f.status].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {!found.length && <li className="px-2 py-2 text-[12.5px] text-ink-2">Không tìm thấy {term} phù hợp.</li>}
              </ul>
              <button type="button" className="btn-ghost mt-1 h-7 text-[12.5px]" onClick={() => setMode("")}>
                Huỷ
              </button>
            </div>
          )}
          {err && <p className="mt-2 text-[12px] text-[#df2f4a]">{err}</p>}
        </div>
      )}

      {r && (
        <div className="mt-5">
          <h3 className="label">Hoạt động gần đây</h3>
          {activities.length ? (
            <ol className="mt-2 space-y-2.5 border-l border-line pl-3">
              {activities.map((a) => (
                <li key={a.id} className="relative text-[12.5px]">
                  <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full border-2 border-surface-2 bg-primary" />
                  <p className="line-clamp-3 whitespace-pre-line break-words">{a.body}</p>
                  <span className="text-[11px] text-ink-2">
                    {a.author} · {ago(a.at)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-2">Chưa có hoạt động.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Hướng dẫn khi trống ───────────────────────────── */

function CopyUrl({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded border border-line-soft bg-surface-2 px-2 py-1.5 text-[12px]">{url}</code>
      <button
        type="button"
        className="btn-outline h-8 flex-none px-2 text-[12.5px]"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        <Icon name={done ? "check" : "copy"} size={13} /> {done ? "Đã chép" : "Chép"}
      </button>
    </div>
  );
}

function SetupGuide({ setup }: { setup: Setup }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <Icon name="inbox" size={30} className="text-primary" />
        <h2 className="mt-2 text-[22px] font-semibold">Gom tin Zalo OA và Messenger về một chỗ</h2>
        <p className="mt-1 text-ink-2">Bật webhook tin nhắn ở hai nền tảng, khách nhắn là tin hiện ngay tại đây, tự gắn với hồ sơ khách và báo cho người phụ trách.</p>

        <section className="card mt-5 p-4">
          <div className="flex items-center gap-2">
            <ChannelBadge channel="zalo" />
            <b>Zalo Official Account</b>
            {setup.zalo && <span className="ml-auto text-[12px] text-[#00a35c]">Đã có token</span>}
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px]">
            <li>Vào developers.zalo.me → ứng dụng của bạn → Webhook, dán URL bên dưới.</li>
            <li>
              Bật các sự kiện: <code>user_send_text</code>, <code>user_send_image</code>, <code>user_send_file</code>, <code>user_send_sticker</code>, <code>user_send_location</code>, <code>follow</code> và <code>oa_send_text</code>.
            </li>
            <li>Ở trang Nguồn khách → Zalo OA: điền App ID, OA Secret Key (kiểm tra chữ ký) và Access/Refresh token để trả lời từ CRM.</li>
          </ol>
          <CopyUrl url={setup.zaloUrl} />
        </section>

        <section className="card mt-3 p-4">
          <div className="flex items-center gap-2">
            <ChannelBadge channel="messenger" />
            <b>Facebook Messenger</b>
            {setup.messenger && <span className="ml-auto text-[12px] text-[#00a35c]">Đã có Page token</span>}
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px]">
            <li>Meta for Developers → App → Messenger → Cài đặt webhook: dán URL bên dưới và Verify token (đặt ở trang Nguồn khách).</li>
            <li>
              Đăng ký Trang với các trường <code>messages</code>, <code>messaging_postbacks</code> (thêm <code>message_echoes</code> nếu muốn thấy cả tin trả lời từ Meta Business Suite).
            </li>
            <li>Cấp Page Access Token có quyền pages_messaging. Facebook chỉ cho trả lời trong 24 giờ kể từ tin cuối của khách.</li>
          </ol>
          <CopyUrl url={setup.fbUrl} />
        </section>

        <Link href="/w/sources" className="btn-primary mt-5">
          <Icon name="settings" size={15} /> Mở trang Nguồn khách để điền khoá
        </Link>
      </div>
    </div>
  );
}
