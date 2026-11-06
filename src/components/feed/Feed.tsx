"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { MentionTextarea, WithMentions } from "@/components/board/Mentions";
import { ago } from "@/lib/format";
import type { PostDTO, PostKind, Reaction } from "@/lib/feed";

// Lặp lại hằng số để không kéo Prisma (src/lib/feed.ts) vào bundle trình duyệt.
const REACTIONS: Reaction[] = ["👍", "❤️", "🎉", "👏", "😂"];
const KIND: Record<PostKind, { label: string; cls: string; icon: string }> = {
  post: { label: "Bài viết", cls: "badge", icon: "chat" },
  announcement: { label: "Thông báo", cls: "badge-accent", icon: "megaphone" },
  win: { label: "Chốt đơn", cls: "badge-success", icon: "award" },
};
const fold = (s: string) => s.trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 30);

type Comment = PostDTO["comments"][number];

/** Biểu tượng ghim (Icon.tsx chưa có). */
const Pin = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z" />
  </svg>
);

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, data: d as T } : { ok: false, error: (d as { error?: string }).error ?? "Có lỗi, thử lại sau" };
}

function Composer({ me, manager, team, channels, channel, onPosted }: { me: string; manager: boolean; team: string[]; channels: string[]; channel: string; onPosted: (p: PostDTO) => void }) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<PostKind>("post");
  const [ch, setCh] = useState(channel || "chung");
  const [newCh, setNewCh] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setCh(channel || "chung"), [channel]);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setErr("");
    const target = adding && newCh.trim() ? fold(newCh) : ch;
    const r = await api<PostDTO>("/api/feed", { method: "POST", body: JSON.stringify({ body, kind, channel: target }) });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setBody("");
    setKind("post");
    setAdding(false);
    setNewCh("");
    onPosted(r.data);
  }

  const kinds: PostKind[] = manager ? ["post", "announcement", "win"] : ["post", "win"];
  return (
    <section className="card" aria-label="Viết bài mới">
      <div className="flex items-center gap-3 px-4 pt-3">
        <Avatar name={me} size={28} />
        <div className="segmented" role="group" aria-label="Loại bài">
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              <Icon name={KIND[k].icon} size={14} /> <span className="hidden min-[380px]:inline">{KIND[k].label}</span>
            </button>
          ))}
        </div>
      </div>
      <MentionTextarea
        id="feed-composer"
        value={body}
        onChange={setBody}
        team={team}
        onSubmit={submit}
        placeholder={kind === "announcement" ? "Thông báo tới cả đội…" : kind === "win" ? "Khoe đơn vừa chốt 🎉" : "Chia sẻ với cả đội… gõ @ để nhắc tên"}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink-2">Kênh</span>
          {adding ? (
            <input className="input h-8 w-36" autoFocus placeholder="tên kênh mới" value={newCh} onChange={(e) => setNewCh(e.target.value)} maxLength={30} aria-label="Tên kênh mới" />
          ) : (
            <select className="input h-8 w-36" value={ch} onChange={(e) => setCh(e.target.value)} aria-label="Chọn kênh">
              {channels.map((c) => (
                <option key={c} value={c}>
                  #{c}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn-ghost h-8 px-2 text-[13px]" onClick={() => setAdding((v) => !v)}>
            {adding ? "Chọn kênh có sẵn" : <><Icon name="plus" size={14} /> Kênh mới</>}
          </button>
        </div>
        <button className="btn-primary" onClick={submit} disabled={busy || !body.trim()}>
          <Icon name="send" size={14} /> {busy ? "Đang đăng…" : "Đăng"}
        </button>
      </div>
      {err && <p className="px-4 pb-3 text-[13px] text-danger">{err}</p>}
    </section>
  );
}

function PostCard({ post, me, manager, team, onChange, onDelete }: { post: PostDTO; me: string; manager: boolean; team: string[]; onChange: (p: PostDTO) => void; onDelete: (id: string) => void }) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(post.comments.length > 0 && post.comments.length <= 3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const k = KIND[post.kind];
  const canDel = manager || post.author === me;

  async function react(e: Reaction) {
    const r = await api<{ reactions: PostDTO["reactions"] }>(`/api/feed/${post.id}/react`, { method: "POST", body: JSON.stringify({ emoji: e }) });
    if (r.ok) onChange({ ...post, reactions: r.data.reactions });
    else setErr(r.error);
  }
  async function pin() {
    const r = await api<PostDTO>(`/api/feed/${post.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !post.pinned }) });
    if (r.ok) onChange(r.data);
    else setErr(r.error);
  }
  async function del() {
    if (!confirm("Xoá bài này? Bình luận cũng bị xoá.")) return;
    const r = await api(`/api/feed/${post.id}`, { method: "DELETE" });
    if (r.ok) onDelete(post.id);
    else setErr(r.error);
  }
  async function comment() {
    if (!reply.trim() || busy) return;
    setBusy(true);
    const r = await api<Comment>(`/api/feed/${post.id}/comments`, { method: "POST", body: JSON.stringify({ body: reply }) });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setReply("");
    onChange({ ...post, comments: [...post.comments, r.data] });
  }
  async function delComment(cid: string) {
    const r = await api(`/api/feed/${post.id}/comments?cid=${cid}`, { method: "DELETE" });
    if (r.ok) onChange({ ...post, comments: post.comments.filter((c) => c.id !== cid) });
    else setErr(r.error);
  }

  return (
    <article id={`post-${post.id}`} className={`card scroll-mt-4 p-4 ${post.kind === "announcement" ? "border-accent" : post.kind === "win" ? "border-success" : ""}`}>
      <header className="flex items-start gap-3">
        <Avatar name={post.author} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{post.author}</span>
            {post.kind !== "post" && (
              <span className={k.cls}>
                <Icon name={k.icon} size={12} /> {k.label}
              </span>
            )}
            {post.pinned && (
              <span className="badge-warning">
                <Pin size={11} /> Đã ghim
              </span>
            )}
          </div>
          <div className="text-[12px] text-ink-2">
            #{post.channel} · <time dateTime={post.createdAt}>{ago(post.createdAt)}</time>
          </div>
        </div>
        <div className="flex flex-none items-center gap-1">
          {manager && (
            <button className="btn-ghost h-8 px-2" onClick={pin} aria-label={post.pinned ? "Bỏ ghim" : "Ghim bài"} title={post.pinned ? "Bỏ ghim" : "Ghim lên đầu"}>
              <Pin />
              <span className="hidden text-[13px] sm:inline">{post.pinned ? "Bỏ ghim" : "Ghim"}</span>
            </button>
          )}
          {canDel && (
            <button className="btn-ghost h-8 px-2 text-ink-2" onClick={del} aria-label="Xoá bài" title="Xoá bài">
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      </header>

      <div className={`mt-3 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed ${post.kind === "win" ? "rounded-md bg-success-soft px-3 py-2" : ""}`}>
        <WithMentions text={post.body} team={team} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {REACTIONS.map((e) => {
          const who = post.reactions[e] ?? [];
          const mine = who.includes(me);
          return (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              aria-pressed={mine}
              title={who.length ? who.join(", ") : "Bày tỏ cảm xúc"}
              className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[13px] transition-colors ${mine ? "border-primary bg-primary-selected" : who.length ? "border-line" : "border-transparent text-ink-2 hover:border-line"} hover:bg-hover`}
            >
              <span aria-hidden>{e}</span>
              {who.length > 0 && <span className="tnum">{who.length}</span>}
              <span className="sr-only">{mine ? "Bỏ cảm xúc" : "Thả cảm xúc"}</span>
            </button>
          );
        })}
        <button type="button" className="btn-ghost ml-auto h-7 px-2 text-[13px] text-ink-2" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Icon name="chat" size={14} /> {post.comments.length ? `${post.comments.length} bình luận` : "Bình luận"}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-line-soft pt-3">
          <ul className="grid gap-2.5">
            {post.comments.map((c) => (
              <li key={c.id} className="group flex items-start gap-2">
                <Avatar name={c.author} size={26} />
                <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-semibold">{c.author}</span>
                    <span className="text-ink-2">{ago(c.createdAt)}</span>
                    {(manager || c.author === me) && (
                      <button className="ml-auto text-ink-2 opacity-70 hover:text-danger group-hover:opacity-100" onClick={() => delComment(c.id)} aria-label="Xoá bình luận">
                        <Icon name="x" size={13} />
                      </button>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[13.5px]">
                    <WithMentions text={c.body} team={team} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 rounded-lg border border-line">
            <MentionTextarea id={`reply-${post.id}`} value={reply} onChange={setReply} team={team} onSubmit={comment} placeholder="Viết bình luận… (Ctrl/⌘ + Enter để gửi)" />
            <div className="flex justify-end border-t border-line-soft px-2 py-1.5">
              <button className="btn-primary h-7 text-[13px]" onClick={comment} disabled={busy || !reply.trim()}>
                Gửi
              </button>
            </div>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}
    </article>
  );
}

export function Feed({ initialPosts, initialChannels, me, manager, team }: { initialPosts: PostDTO[]; initialChannels: string[]; me: string; manager: boolean; team: string[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [channels, setChannels] = useState(initialChannels);
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(false);

  // Mở từ thông báo (/w/feed#post-…): cuộn tới bài và tô sáng.
  useEffect(() => {
    const h = window.location.hash;
    if (!h.startsWith("#post-")) return;
    const el = document.getElementById(h.slice(1));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-primary");
    const t = setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2500);
    return () => clearTimeout(t);
  }, []);

  async function pick(c: string) {
    setChannel(c);
    setLoading(true);
    const r = await api<{ posts: PostDTO[]; channels: string[] }>(`/api/feed${c ? `?channel=${encodeURIComponent(c)}` : ""}`);
    setLoading(false);
    if (r.ok) {
      setPosts(r.data.posts);
      setChannels(r.data.channels);
    }
  }

  const sorted = [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="anim-fade mx-auto max-w-5xl">
      <h1 className="flex items-center gap-2 text-[26px] font-semibold">
        <Icon name="feed" size={24} className="text-primary" /> Bảng tin nội bộ
      </h1>
      <p className="mt-1 text-ink-2">Thông báo, khoe đơn và trao đổi chung của cả đội. Gõ @ để nhắc tên đồng đội.</p>

      <div className="mt-5 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Kênh" className="min-w-0">
          <h2 className="section-title mb-2 hidden md:block">Kênh</h2>
          <ul className="no-scrollbar flex gap-1.5 overflow-x-auto md:flex-col md:gap-0.5">
            {["", ...channels].map((c) => (
              <li key={c || "_all"} className="flex-none">
                <button
                  type="button"
                  onClick={() => pick(c)}
                  aria-current={channel === c ? "page" : undefined}
                  className={`md:w-full md:justify-start md:rounded-md md:border-0 ${channel === c ? "chip chip-on md:bg-primary-selected" : "chip md:hover:bg-hover"}`}
                >
                  {c ? `#${c}` : "Tất cả"}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 content-start gap-4">
          <Composer
            me={me}
            manager={manager}
            team={team}
            channels={channels}
            channel={channel}
            onPosted={(p) => {
              if (!channels.includes(p.channel)) setChannels((cs) => [...cs, p.channel]);
              if (!channel || channel === p.channel) setPosts((ps) => [p, ...ps]);
            }}
          />
          {loading && <div className="skeleton h-28" />}
          {!loading && sorted.length === 0 && (
            <div className="card grid place-items-center gap-2 p-10 text-center text-ink-2">
              <Icon name="feed" size={28} />
              <p>Chưa có bài nào{channel ? ` trong #${channel}` : ""}. Hãy là người mở màn!</p>
            </div>
          )}
          {!loading &&
            sorted.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                me={me}
                manager={manager}
                team={team}
                onChange={(np) => setPosts((ps) => ps.map((x) => (x.id === np.id ? np : x)))}
                onDelete={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
