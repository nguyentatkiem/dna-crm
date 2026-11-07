"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui/Toast";
import { TEAMCHAT_UNREAD_EVENT } from "@/components/teamchat/TeamChatButton";
import { EDIT_WINDOW_MS, type RefCard, type RefKind } from "@/lib/teamchat/shared";
import type { MessageDTO, ThreadDTO } from "@/lib/teamchat/server";

type Member = { id: string; name: string };
type AttachTab = { key: string; label: string; kind: RefKind; object?: string };
type Pending = { kind: RefKind; id: string; title: string };

const THREADS_MS = 5000;
const MESSAGES_MS = 3000;
const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const timeVN = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const dayVN = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
function shortAgo(iso: string | null) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} ph`;
  if (s < 86400) return timeVN(iso);
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}
const tKey = (t: ThreadDTO) => t.id ?? `dm:${t.dmWith}`;

export function ChatApp({ me, initialThread, attachTabs }: { me: { id: string; name: string }; initialThread: string | null; attachTabs: AttachTab[] }) {
  const [threads, setThreads] = useState<ThreadDTO[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialThread);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; threadId: string; threadTitle: string; userName: string; body: string; createdAt: string }[] | null>(null);
  const [newGroup, setNewGroup] = useState(false);
  const listSeq = useRef(0);

  const listBusy = useRef(false);
  // Lượt hỏi định kỳ bỏ qua khi lượt trước chưa xong; tải lại chủ động (sau khi gửi/sửa) thì vượt lên và làm cũ lượt đang chạy.
  const loadThreads = useCallback(async (background = false) => {
    if (background && listBusy.current) return;
    const my = ++listSeq.current;
    listBusy.current = true;
    const res = await fetch("/api/teamchat/threads").catch(() => null);
    if (my === listSeq.current) listBusy.current = false;
    if (!res?.ok || my !== listSeq.current) return;
    const d = await res.json().catch(() => null);
    if (!d || my !== listSeq.current) return;
    setThreads(d.threads);
    setMembers(d.members);
    window.dispatchEvent(new CustomEvent(TEAMCHAT_UNREAD_EVENT, { detail: d.totalUnread }));
  }, []);

  useEffect(() => {
    loadThreads();
    const t = setInterval(() => !document.hidden && loadThreads(true), THREADS_MS);
    return () => clearInterval(t);
  }, [loadThreads]);

  // Đồng bộ ?t= trên thanh địa chỉ (không tải lại trang).
  useEffect(() => {
    const u = new URL(window.location.href);
    if (activeId) u.searchParams.set("t", activeId);
    else u.searchParams.delete("t");
    window.history.replaceState(null, "", u.toString());
  }, [activeId]);

  // Tìm tin nhắn (giãn 300ms, bỏ kết quả cũ).
  const searchSeq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setHits(null);
    const my = ++searchSeq.current;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/teamchat/search?q=${encodeURIComponent(term)}`).catch(() => null);
      const d = res?.ok ? await res.json() : { items: [] };
      if (my === searchSeq.current) setHits(d.items);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function open(t: ThreadDTO) {
    if (t.id) return setActiveId(t.id);
    const res = await fetch("/api/teamchat/threads", { method: "POST", ...json({ kind: "dm", userId: t.dmWith }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast(d.error ?? "Không mở được hội thoại", "error");
    setActiveId(d.id);
    loadThreads();
  }

  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const active = activeId ? (threads?.find((t) => t.id === activeId) ?? null) : null;
  const term = q.trim().toLowerCase();
  const shown = (threads ?? []).filter((t) => !term || t.title.toLowerCase().includes(term));
  const groups = shown.filter((t) => t.kind === "group");
  const dms = shown.filter((t) => t.kind === "dm").sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || a.title.localeCompare(b.title, "vi"));

  return (
    <div className="flex h-full min-h-[480px] bg-surface md:rounded-tl-lg">
      {/* Nút Trợ lý AI nổi góc phải đè lên nút Gửi: trên trang chat đẩy nó lên trên ô soạn tin. */}
      <style>{`[data-tour="copilot"]{bottom:calc(132px + env(safe-area-inset-bottom))!important}@media (min-width:768px){[data-tour="copilot"]{bottom:84px!important}}`}</style>
      {/* Danh sách hội thoại: ẩn trên điện thoại khi đang mở một hội thoại */}
      <aside className={`${activeId ? "hidden md:flex" : "flex"} w-full flex-none flex-col border-r border-line-soft md:w-[300px]`}>
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <h1 className="flex-1 text-[18px] font-semibold">Chat nội bộ</h1>
          <button className="btn-outline h-8 px-2.5 text-[13px]" onClick={() => setNewGroup(true)}>
            <Icon name="plus" size={15} /> Nhóm
          </button>
        </div>
        <div className="relative px-3 pb-2">
          <Icon name="search" size={14} className="absolute left-5 top-1/2 -translate-y-[calc(50%+4px)] text-ink-2" />
          <input className="input h-8 pl-8 text-[13px]" placeholder="Tìm người, nhóm hoặc tin nhắn" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm hội thoại hoặc tin nhắn" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {!threads ? (
            <div className="space-y-2 px-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}</div>
          ) : (
            <>
              {hits && (
                <Section title={`Tin nhắn (${hits.length})`}>
                  {hits.length === 0 && <p className="px-3 py-2 text-[13px] text-ink-2">Không thấy tin nào khớp.</p>}
                  {hits.map((h) => (
                    <button key={h.id} className="block w-full px-3 py-2 text-left hover:bg-hover" onClick={() => setActiveId(h.threadId)}>
                      <p className="truncate text-[12px] text-ink-2">
                        {h.threadTitle} · {h.userName} · {shortAgo(h.createdAt)}
                      </p>
                      <p className="line-clamp-2 text-[13px]">{h.body}</p>
                    </button>
                  ))}
                </Section>
              )}
              <Section title="Nhóm">
                {groups.length === 0 && <p className="px-3 py-1 text-[13px] text-ink-2">Chưa có nhóm nào.</p>}
                {groups.map((t) => (
                  <ThreadRow key={tKey(t)} t={t} active={t.id === activeId} onClick={() => open(t)} />
                ))}
              </Section>
              <Section title="Tin nhắn riêng">
                {dms.map((t) => (
                  <ThreadRow key={tKey(t)} t={t} active={!!t.id && t.id === activeId} onClick={() => open(t)} />
                ))}
                {dms.length === 0 && <p className="px-3 py-1 text-[13px] text-ink-2">Workspace chưa có thành viên khác.</p>}
              </Section>
            </>
          )}
        </div>
      </aside>

      <section className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {activeId && !threads ? (
          <div className="flex-1 space-y-3 p-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className={`skeleton h-10 ${i % 2 ? "ml-auto w-1/2" : "w-2/3"}`} />)}</div>
        ) : activeId && threads && !active ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-ink-2">
            <div>
              <p>Không tìm thấy hội thoại hoặc bạn không còn là thành viên.</p>
              <button className="btn-outline mt-3" onClick={() => setActiveId(null)}>
                Về danh sách
              </button>
            </div>
          </div>
        ) : active ? (
          <ThreadView key={active.id} thread={active} me={me} names={names} members={members} attachTabs={attachTabs} onBack={() => setActiveId(null)} onChanged={() => loadThreads()} onLeft={() => (setActiveId(null), void loadThreads())} />
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <Icon name="chat" size={36} className="mx-auto text-ink-2" />
              <p className="mt-2 font-medium">Chọn một hội thoại</p>
              <p className="mt-1 max-w-sm text-[13px] text-ink-2">Nhắn riêng với từng thành viên hoặc lập nhóm. Gõ @tên để nhắc, dán link khách/đơn/việc hoặc bấm Đính kèm để chia sẻ.</p>
            </div>
          </div>
        )}
      </section>

      {newGroup && <GroupDialog members={members.filter((m) => m.id !== me.id)} onClose={() => setNewGroup(false)} onCreated={(id) => (setNewGroup(false), setActiveId(id), loadThreads())} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="section-title px-3 pb-1">{title}</p>
      {children}
    </div>
  );
}

function ThreadRow({ t, active, onClick }: { t: ThreadDTO; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-hover ${active ? "bg-primary-selected" : ""}`} aria-current={active ? "true" : undefined}>
      {t.kind === "group" ? (
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-2 text-ink-2">
          <Icon name="users" size={17} />
        </span>
      ) : (
        <Avatar name={t.title} size={36} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14px] ${t.unread ? "font-semibold" : ""}`}>{t.title}</span>
          <span className="flex-none text-[11px] text-ink-2">{shortAgo(t.lastAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${t.unread ? "text-ink" : "text-ink-2"}`}>{t.lastText || (t.kind === "dm" ? "Bắt đầu trò chuyện" : `${t.members.length} thành viên`)}</span>
          {t.unread > 0 && <span className="count-dot">{t.unread > 99 ? "99+" : t.unread}</span>}
        </span>
      </span>
    </button>
  );
}

// ───────────────────────────── Một hội thoại ─────────────────────────────

function ThreadView({
  thread,
  me,
  names,
  members,
  attachTabs,
  onBack,
  onChanged,
  onLeft,
}: {
  thread: ThreadDTO;
  me: { id: string; name: string };
  names: Map<string, string>;
  members: Member[];
  attachTabs: AttachTab[];
  onBack: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const id = thread.id!;
  const [msgs, setMsgs] = useState<MessageDTO[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const unreadSeen = useRef(thread.unread);

  // Gộp cửa sổ tin mới nhất với các trang cũ đã tải (giữ tin cũ, cập nhật sửa/thu hồi/đã xem).
  const merge = (incoming: MessageDTO[], prev: MessageDTO[] | null) => {
    const map = new Map((prev ?? []).map((m) => [m.id, m]));
    for (const m of incoming) map.set(m.id, m);
    return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  };

  const pollBusy = useRef(false);
  const poll = useCallback(async () => {
    if (pollBusy.current) return;
    const my = ++seq.current;
    pollBusy.current = true;
    const res = await fetch(`/api/teamchat/threads/${id}/messages`).catch(() => null);
    pollBusy.current = false;
    if (my !== seq.current || !res) return;
    if (!res.ok) return;
    const d = await res.json();
    if (my !== seq.current || d.threadId !== id) return;
    setMsgs((p) => merge(d.messages, p));
    setHasMore((h) => (msgsRef.current ? h : d.hasMore));
  }, [id]);
  const msgsRef = useRef<MessageDTO[] | null>(null);
  msgsRef.current = msgs;

  useEffect(() => {
    poll().then(() => {
      if (unreadSeen.current) onChanged();
    });
    const t = setInterval(() => !document.hidden && poll(), MESSAGES_MS);
    return () => {
      clearInterval(t);
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll]);

  // Cuộn xuống cuối khi có tin mới nếu người dùng đang ở cuối.
  const lastId = msgs?.[msgs.length - 1]?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  async function older() {
    if (!msgs?.length) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const h = el?.scrollHeight ?? 0;
    const res = await fetch(`/api/teamchat/threads/${id}/messages?peek=1&before=${encodeURIComponent(msgs[0].createdAt)}`).catch(() => null);
    setLoadingOlder(false);
    if (!res?.ok) return;
    const d = await res.json();
    setMsgs((p) => merge(d.messages, p));
    setHasMore(d.hasMore);
    requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - h));
  }

  async function send(body: string, refs: Pending[]) {
    seq.current++; // bỏ lượt hỏi đang chạy để không ghi đè tin vừa gửi
    const res = await fetch(`/api/teamchat/threads/${id}/messages`, { method: "POST", ...json({ body, refs: refs.map((r) => ({ kind: r.kind, id: r.id })) }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(d.error ?? "Không gửi được", "error");
      return false;
    }
    stick.current = true;
    setMsgs((p) => merge([d], p));
    onChanged();
    return true;
  }
  async function saveEdit(m: MessageDTO, body: string) {
    const res = await fetch(`/api/teamchat/messages/${m.id}`, { method: "PATCH", ...json({ body }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast(d.error ?? "Không sửa được", "error");
    setEditing(null);
    setMsgs((p) => merge([d], p));
  }
  async function recall(m: MessageDTO) {
    if (!confirm("Thu hồi tin nhắn này? Mọi người sẽ thấy “Tin nhắn đã được thu hồi”.")) return;
    const res = await fetch(`/api/teamchat/messages/${m.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? "Không thu hồi được", "error");
    setMsgs((p) => merge([{ ...m, body: "", refs: [], deleted: true, canModify: false }], p));
    onChanged();
  }

  const threadMembers = members.filter((m) => thread.members.includes(m.id));
  const myLast = [...(msgs ?? [])].reverse().find((m) => m.userId === me.id && !m.deleted);
  const otherIds = thread.members.filter((u) => u !== me.id);

  return (
    <>
      <header className="flex h-14 flex-none items-center gap-2 border-b border-line-soft px-2 sm:px-4">
        <button className="btn-ghost h-8 w-8 justify-center p-0 md:hidden" onClick={onBack} aria-label="Về danh sách hội thoại">
          <Icon name="chevron" size={18} className="rotate-90" />
        </button>
        {thread.kind === "group" ? (
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-2 text-ink-2">
            <Icon name="users" size={17} />
          </span>
        ) : (
          <Avatar name={thread.title} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{thread.title}</p>
          <p className="truncate text-[12px] text-ink-2">{thread.kind === "group" ? `${thread.members.length} thành viên: ${threadMembers.map((m) => m.name).join(", ")}` : "Tin nhắn riêng"}</p>
        </div>
        {thread.kind === "group" && (
          <button className="btn-ghost h-8 px-2" onClick={() => setManage(true)} aria-label="Cài đặt nhóm" title="Cài đặt nhóm">
            <Icon name="settings" size={17} />
          </button>
        )}
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!msgs ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className={`skeleton h-10 ${i % 2 ? "ml-auto w-1/2" : "w-2/3"}`} />)}</div>
        ) : (
          <>
            {hasMore && (
              <div className="mb-2 text-center">
                <button className="btn-ghost h-7 text-[12.5px]" onClick={older} disabled={loadingOlder}>
                  {loadingOlder ? "Đang tải…" : "Tải tin cũ hơn"}
                </button>
              </div>
            )}
            {msgs.length === 0 && <p className="py-10 text-center text-[13px] text-ink-2">Chưa có tin nhắn. Gửi lời chào đầu tiên nhé!</p>}
            {msgs.map((m, i) => {
              const prev = msgs[i - 1];
              const newDay = !prev || dayVN(prev.createdAt) !== dayVN(m.createdAt);
              const grouped = !newDay && prev && prev.userId === m.userId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60e3;
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-2 text-[11.5px] text-ink-2">
                      <span className="h-px flex-1 bg-line-soft" />
                      {dayVN(m.createdAt)}
                      <span className="h-px flex-1 bg-line-soft" />
                    </div>
                  )}
                  <Bubble
                    m={m}
                    mine={m.userId === me.id}
                    grouped={!!grouped}
                    names={names}
                    editing={editing === m.id}
                    onEdit={() => setEditing(m.id)}
                    onCancelEdit={() => setEditing(null)}
                    onSaveEdit={(b) => saveEdit(m, b)}
                    onRecall={() => recall(m)}
                    receipt={myLast?.id === m.id ? receiptText(m, otherIds, names, thread.kind) : ""}
                  />
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      <Composer members={threadMembers.filter((m) => m.id !== me.id)} attachTabs={attachTabs} onSend={send} />

      {manage && <ManageGroup thread={thread} me={me} members={members} onClose={() => setManage(false)} onChanged={onChanged} onLeft={onLeft} />}
    </>
  );
}

function receiptText(m: MessageDTO, others: string[], names: Map<string, string>, kind: ThreadDTO["kind"]) {
  const seen = others.filter((u) => m.readBy.includes(u));
  if (!seen.length) return "Đã gửi";
  if (kind === "dm") return "Đã xem";
  if (seen.length === others.length) return "Mọi người đã xem";
  return `Đã xem: ${seen.map((u) => names.get(u) ?? "?").join(", ")}`;
}

/** Chữ tin nhắn: tô @tên, biến link thành liên kết (link CRM mở trong app). */
function RichText({ text, names }: { text: string; names: Map<string, string> }) {
  const nameList = [...names.values()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(https?:\\/\\/[^\\s<]*[^\\s<.,;:!?)]|\\/w\\/[^\\s<]*[^\\s<.,;:!?)]${nameList.length ? `|@(?:${nameList.join("|")}|all|tatca)` : "|@(?:all|tatca)"})`, "giu");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        if (p.startsWith("@")) return <span key={i} className="rounded bg-primary-selected px-0.5 font-medium text-primary">{p}</span>;
        const internal = p.startsWith("/w/") || (typeof window !== "undefined" && p.startsWith(window.location.origin + "/w/"));
        const href = internal && !p.startsWith("/") ? p.slice(window.location.origin.length) : p;
        return internal ? (
          <Link key={i} href={href} className="break-all text-primary underline">
            {p}
          </Link>
        ) : (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline">
            {p}
          </a>
        );
      })}
    </>
  );
}

const REF_ICON: Record<RefKind, string> = { record: "person", order: "cart", task: "check", ticket: "ticket" };
const REF_LABEL: Record<RefKind, string> = { record: "Khách / giao dịch", order: "Đơn hàng", task: "Việc", ticket: "Phiếu hỗ trợ" };

function RefCardView({ c }: { c: RefCard }) {
  if (!c.ok)
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink-2">
        <Icon name="lock" size={14} /> {REF_LABEL[c.kind]} · Không có quyền xem
      </div>
    );
  return (
    <Link href={c.href} className="flex items-center gap-2.5 rounded-md border border-line-soft bg-surface px-2.5 py-2 hover:border-line hover:bg-hover">
      <span className="grid h-8 w-8 flex-none place-items-center rounded bg-primary-selected text-primary">
        <Icon name={REF_ICON[c.kind]} size={15} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink">{c.title}</span>
        {c.sub && <span className="block truncate text-[12px] text-ink-2">{c.sub}</span>}
      </span>
    </Link>
  );
}

function Bubble(p: {
  m: MessageDTO;
  mine: boolean;
  grouped: boolean;
  names: Map<string, string>;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (b: string) => void;
  onRecall: () => void;
  receipt: string;
}) {
  const { m, mine } = p;
  const [draft, setDraft] = useState(m.body);
  const [menu, setMenu] = useState(false);
  // Hết 15 phút thì ẩn nút sửa/thu hồi mà không cần chờ lượt hỏi máy chủ.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!m.canModify) return;
    const left = new Date(m.createdAt).getTime() + EDIT_WINDOW_MS - Date.now();
    const t = setTimeout(() => tick((x) => x + 1), Math.max(0, left) + 500);
    return () => clearTimeout(t);
  }, [m.canModify, m.createdAt]);
  const modifiable = m.canModify && Date.now() - new Date(m.createdAt).getTime() <= EDIT_WINDOW_MS;

  return (
    <div className={`group flex gap-2 ${mine ? "flex-row-reverse" : ""} ${p.grouped ? "mt-0.5" : "mt-3"}`}>
      <div className="w-8 flex-none">{!mine && !p.grouped && <Avatar name={m.userName} size={32} />}</div>
      <div className={`flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
        {!p.grouped && (
          <p className="mb-0.5 px-1 text-[11.5px] text-ink-2">
            {mine ? "Bạn" : m.userName} · {timeVN(m.createdAt)}
          </p>
        )}
        <div className="relative flex items-center gap-1">
          {mine && modifiable && !p.editing && (
            <div className="relative order-first opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button className="btn-ghost h-7 w-7 justify-center p-0" onClick={() => setMenu(!menu)} aria-label="Tuỳ chọn tin nhắn" aria-expanded={menu}>
                ⋯
              </button>
              {menu && (
                <div className="absolute right-0 top-8 z-10 w-32 rounded-md border border-line bg-surface p-1 shadow-panel" onMouseLeave={() => setMenu(false)}>
                  <button className="block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-hover" onClick={() => (setMenu(false), setDraft(m.body), p.onEdit())}>
                    Sửa
                  </button>
                  <button className="block w-full rounded px-2 py-1 text-left text-[13px] text-danger hover:bg-hover" onClick={() => (setMenu(false), p.onRecall())}>
                    Thu hồi
                  </button>
                </div>
              )}
            </div>
          )}
          {m.deleted ? (
            <div className="rounded-2xl border border-dashed border-line px-3 py-1.5 text-[13px] italic text-ink-2">Tin nhắn đã được thu hồi</div>
          ) : p.editing ? (
            <div className="w-[min(420px,80vw)]">
              <textarea className="textarea min-h-[64px] text-[14px]" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={4000} />
              <div className="mt-1 flex justify-end gap-1">
                <button className="btn-ghost h-7 text-[13px]" onClick={p.onCancelEdit}>
                  Huỷ
                </button>
                <button className="btn-primary h-7 text-[13px]" disabled={!draft.trim()} onClick={() => p.onSaveEdit(draft.trim())}>
                  Lưu
                </button>
              </div>
            </div>
          ) : (
            m.body && (
              <div className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[14px] ${mine ? "bg-primary text-white [&_a]:text-white [&_span.text-primary]:bg-white/20 [&_span.text-primary]:text-white" : "bg-surface-2 text-ink"}`}>
                <RichText text={m.body} names={p.names} />
              </div>
            )
          )}
        </div>
        {!m.deleted && m.refs.length > 0 && (
          <div className="mt-1 grid w-[min(320px,80vw)] gap-1">
            {m.refs.map((c) => (
              <RefCardView key={`${c.kind}:${c.id}`} c={c} />
            ))}
          </div>
        )}
        {(m.edited || p.receipt) && (
          <p className="mt-0.5 px-1 text-[11px] text-ink-2">
            {m.edited && !m.deleted ? "đã sửa" : ""}
            {m.edited && !m.deleted && p.receipt ? " · " : ""}
            {p.receipt}
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Ô soạn tin ─────────────────────────────

function Composer({ members, attachTabs, onSend }: { members: Member[]; attachTabs: AttachTab[]; onSend: (body: string, refs: Pending[]) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [refs, setRefs] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null);
  const [mi, setMi] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);

  const suggestions = mention ? [...members.filter((m) => m.name.toLowerCase().includes(mention.q.toLowerCase())), ...(members.length > 1 && "all".startsWith(mention.q.toLowerCase()) ? [{ id: "all", name: "all" }] : [])].slice(0, 6) : [];

  function onChange(v: string) {
    setText(v);
    const pos = ta.current?.selectionStart ?? v.length;
    const before = v.slice(0, pos);
    const m = before.match(/(^|\s)@([\p{L}\p{N}_ ]{0,24})$/u);
    if (m && !m[2].includes("  ")) {
      setMention({ q: m[2], start: pos - m[2].length - 1 });
      setMi(0);
    } else setMention(null);
  }
  function pick(name: string) {
    if (!mention) return;
    const pos = ta.current?.selectionStart ?? text.length;
    const v = `${text.slice(0, mention.start)}@${name} ${text.slice(pos)}`;
    setText(v);
    setMention(null);
    requestAnimationFrame(() => {
      const p = mention.start + name.length + 2;
      ta.current?.focus();
      ta.current?.setSelectionRange(p, p);
    });
  }
  async function submit() {
    const body = text.trim();
    if ((!body && !refs.length) || busy) return;
    setBusy(true);
    const ok = await onSend(body, refs);
    setBusy(false);
    if (ok) {
      setText("");
      setRefs([]);
      ta.current?.focus();
    }
  }

  return (
    <div className="relative flex-none border-t border-line-soft p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-60 rounded-md border border-line bg-surface p-1 shadow-panel" role="listbox" aria-label="Nhắc thành viên">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              role="option"
              aria-selected={i === mi}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] ${i === mi ? "bg-hover" : ""}`}
              onMouseDown={(e) => (e.preventDefault(), pick(s.name))}
            >
              {s.id === "all" ? <Icon name="users" size={16} /> : <Avatar name={s.name} size={20} />}
              {s.id === "all" ? "all — cả nhóm" : s.name}
            </button>
          ))}
        </div>
      )}
      {refs.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {refs.map((r) => (
            <span key={`${r.kind}:${r.id}`} className="badge h-6 gap-1 bg-primary-selected text-ink">
              <Icon name={REF_ICON[r.kind]} size={12} /> <span className="max-w-[160px] truncate">{r.title}</span>
              <button aria-label={`Bỏ ${r.title}`} onClick={() => setRefs(refs.filter((x) => x !== r))}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button className="btn-ghost h-9 flex-none px-2" onClick={() => setPicker(true)} disabled={refs.length >= 5} title="Đính kèm khách, đơn, việc" aria-label="Đính kèm">
          <Icon name="link" size={17} />
          <span className="hidden text-[13px] sm:inline">Đính kèm</span>
        </button>
        <textarea
          ref={ta}
          rows={1}
          className="textarea max-h-40 min-h-9 flex-1 resize-none py-1.5 text-[14px]"
          placeholder="Nhắn tin… (@ để nhắc)" title="Enter để gửi, Shift+Enter xuống dòng"
          value={text}
          maxLength={4000}
          onChange={(e) => onChange(e.target.value)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(160, el.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === "ArrowDown") return e.preventDefault(), setMi((mi + 1) % suggestions.length);
              if (e.key === "ArrowUp") return e.preventDefault(), setMi((mi - 1 + suggestions.length) % suggestions.length);
              if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), pick(suggestions[mi].name);
              if (e.key === "Escape") return setMention(null);
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Nội dung tin nhắn"
        />
        <button className="btn-primary h-9 flex-none px-3" onClick={submit} disabled={busy || (!text.trim() && !refs.length)} aria-label="Gửi">
          <Icon name="send" size={16} />
        </button>
      </div>
      {picker && <AttachPicker tabs={attachTabs} onClose={() => setPicker(false)} onPick={(r) => (setRefs((x) => (x.some((y) => y.kind === r.kind && y.id === r.id) ? x : [...x, r].slice(0, 5))), setPicker(false))} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-overlay sm:place-items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-slide-up max-h-[85dvh] w-full overflow-y-auto rounded-t-xl bg-surface p-4 shadow-panel sm:w-[440px] sm:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AttachPicker({ tabs, onClose, onPick }: { tabs: AttachTab[]; onClose: () => void; onPick: (r: Pending) => void }) {
  const [tab, setTab] = useState(tabs[0]);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ kind: RefKind; id: string; title: string; sub: string }[] | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    setItems(null);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/teamchat/attach?kind=${tab.kind}${tab.object ? `&object=${tab.object}` : ""}&q=${encodeURIComponent(q.trim())}`).catch(() => null);
      const d = res?.ok ? await res.json() : { items: [] };
      if (my === seq.current) setItems(d.items);
    }, 250);
    return () => clearTimeout(t);
  }, [tab, q]);
  return (
    <Modal title="Đính kèm" onClose={onClose}>
      <div className="segmented mb-2 flex w-full overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} aria-pressed={tab.key === t.key} className="flex-1 justify-center whitespace-nowrap" onClick={() => setTab(t)}>
            {t.label}
          </button>
        ))}
      </div>
      <input className="input mb-2" placeholder="Tìm theo tên, số…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Tìm mục để đính kèm" />
      <div className="min-h-[200px]">
        {!items ? (
          <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-2">Không có mục nào (chỉ hiện mục trong phạm vi bạn được xem).</p>
        ) : (
          items.map((it) => (
            <button key={it.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => onPick({ kind: it.kind, id: it.id, title: it.title })}>
              <Icon name={REF_ICON[it.kind]} size={15} className="text-ink-2" />
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{it.title}</span>
                {it.sub && <span className="block truncate text-[12px] text-ink-2">{it.sub}</span>}
              </span>
            </button>
          ))
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-2">Mẹo: có thể dán thẳng link /w/... của khách, đơn, việc vào tin nhắn. Ai không có quyền xem sẽ thấy “Không có quyền xem”.</p>
    </Modal>
  );
}

function MemberPicker({ members, selected, onToggle }: { members: Member[]; selected: string[]; onToggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = members.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <input className="input mb-2 h-8 text-[13px]" placeholder="Tìm thành viên" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm thành viên" />
      <div className="max-h-56 overflow-y-auto rounded border border-line-soft">
        {shown.map((m) => (
          <label key={m.id} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-hover">
            <input type="checkbox" checked={selected.includes(m.id)} onChange={() => onToggle(m.id)} />
            <Avatar name={m.name} size={22} />
            <span className="text-[14px]">{m.name}</span>
          </label>
        ))}
        {shown.length === 0 && <p className="p-3 text-[13px] text-ink-2">Không có thành viên phù hợp.</p>}
      </div>
    </div>
  );
}

function GroupDialog({ members, onClose, onCreated }: { members: Member[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await fetch("/api/teamchat/threads", { method: "POST", ...json({ kind: "group", name, members: sel }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(d.error ?? "Không tạo được nhóm", "error");
    onCreated(d.id);
  }
  return (
    <Modal title="Tạo nhóm chat" onClose={onClose}>
      <label className="label">Tên nhóm</label>
      <input className="input mb-3 mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="VD: Đội bán hàng miền Bắc" autoFocus />
      <p className="label mb-1">Thành viên ({sel.length})</p>
      <MemberPicker members={members} selected={sel} onToggle={(id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        <button className="btn-primary" disabled={busy || !name.trim() || !sel.length} onClick={create}>
          {busy ? "Đang tạo…" : "Tạo nhóm"}
        </button>
      </div>
    </Modal>
  );
}

function ManageGroup({ thread, me, members, onClose, onChanged, onLeft }: { thread: ThreadDTO; me: { id: string }; members: Member[]; onClose: () => void; onChanged: () => void; onLeft: () => void }) {
  const [name, setName] = useState(thread.title);
  const [add, setAdd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inGroup = members.filter((m) => thread.members.includes(m.id));
  const outside = members.filter((m) => !thread.members.includes(m.id));
  async function patch(body: Record<string, unknown>, done?: () => void) {
    setBusy(true);
    const res = await fetch(`/api/teamchat/threads/${thread.id}`, { method: "PATCH", ...json(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(d.error ?? "Không lưu được", "error");
    onChanged();
    done?.();
  }
  return (
    <Modal title="Cài đặt nhóm" onClose={onClose}>
      {thread.canManage ? (
        <>
          <label className="label">Tên nhóm</label>
          <div className="mb-4 mt-1 flex gap-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <button className="btn-outline flex-none" disabled={busy || !name.trim() || name.trim() === thread.title} onClick={() => patch({ name: name.trim() }, () => toast("Đã đổi tên nhóm"))}>
              Lưu
            </button>
          </div>
        </>
      ) : (
        <p className="mb-3 text-[13px] text-ink-2">Chỉ người tạo nhóm hoặc chủ workspace đổi tên và thành viên được.</p>
      )}
      <p className="label mb-1">Thành viên ({inGroup.length})</p>
      <ul className="mb-4 divide-y divide-line-soft rounded border border-line-soft">
        {inGroup.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-2 py-1.5">
            <Avatar name={m.name} size={22} />
            <span className="flex-1 text-[14px]">
              {m.name}
              {m.id === me.id ? " (bạn)" : ""}
              {m.id === thread.createdBy ? <span className="badge ml-1.5">Người tạo</span> : null}
            </span>
            {thread.canManage && m.id !== me.id && (
              <button className="btn-ghost h-7 px-2 text-[12.5px] text-danger" disabled={busy} onClick={() => confirm(`Bớt ${m.name} khỏi nhóm?`) && patch({ remove: [m.id] })}>
                Bớt
              </button>
            )}
          </li>
        ))}
      </ul>
      {thread.canManage && outside.length > 0 && (
        <>
          <p className="label mb-1">Thêm thành viên</p>
          <MemberPicker members={outside} selected={add} onToggle={(id) => setAdd((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
          <button className="btn-outline mt-2" disabled={busy || !add.length} onClick={() => patch({ add }, () => (setAdd([]), toast("Đã thêm thành viên")))}>
            Thêm {add.length || ""} người
          </button>
        </>
      )}
      <div className="mt-5 border-t border-line-soft pt-3">
        <button className="btn-ghost text-danger" disabled={busy} onClick={() => confirm("Rời nhóm này? Bạn sẽ không xem được tin trong nhóm nữa.") && patch({ leave: true }, onLeft)}>
          <Icon name="logout" size={15} /> Rời nhóm
        </button>
      </div>
    </Modal>
  );
}
