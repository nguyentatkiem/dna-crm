"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import type { InboxAttachment, InboxItem, InboxMessage, InboxPost } from "@/lib/inbox-types";
import { MessageText } from "./MessageText";
import { api, dayLabel, hhmm } from "./shared";

export function Attach({ a }: { a: InboxAttachment }) {
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
        <img src={a.url} alt={a.type === "sticker" ? "Sticker" : "Ảnh khách gửi"} loading="lazy" className={`rounded-md object-cover ${a.type === "sticker" ? "max-h-24" : "max-h-56 max-w-full"}`} />
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

/** Một tin nhắn dạng bong bóng (tin nhắn thường, nhắn riêng, ghi chú). */
export function Bubble({ m, conv, onResent, onSavePhone }: { m: InboxMessage; conv: InboxItem; onResent: () => Promise<void>; onSavePhone?: (p: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (m.attachments.some((a) => a.type === "event"))
    return (
      <li className="flex justify-center">
        <span className="rounded-full bg-surface px-3 py-1 text-[12px] text-ink-2">
          {m.text} · {hhmm(m.at)}
        </span>
      </li>
    );
  async function resend(humanAgent?: boolean) {
    if (busy) return;
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
  const pending = m.status === "sending";
  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] leading-snug ${
            note ? "rounded-br-md border border-warning/40 bg-warning-soft text-ink" : mine ? `rounded-br-md bg-primary text-white ${failed ? "opacity-70 ring-2 ring-danger" : ""} ${pending ? "opacity-70" : ""}` : "rounded-bl-md border border-line-soft bg-surface text-ink"
          }`}
        >
          {note && (
            <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warning">
              <Icon name="lock" size={11} /> Ghi chú nội bộ
            </span>
          )}
          {m.kind === "message" && conv.kind === "comment" && mine && !note && <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide opacity-80">Nhắn riêng</span>}
          <MessageText text={m.text} onSavePhone={m.direction === "in" ? onSavePhone : undefined} light={mine && !note} />
          {m.attachments.map((a, i) => (
            <Attach key={i} a={a} />
          ))}
        </div>
        <span className="mt-0.5 px-1 text-[11px] text-ink-2">
          {mine && m.author ? `${m.author} · ` : ""}
          {pending ? "Đang gửi…" : hhmm(m.at)}
          {failed && <b className="ml-1 font-medium text-danger">· Gửi lỗi</b>}
        </span>
        {failed && (
          <div className="mt-1 max-w-full rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
            {m.error}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button type="button" className="rounded bg-surface/70 px-2 py-0.5 font-medium hover:bg-surface" disabled={busy} onClick={() => resend()}>
                {busy ? "Đang gửi…" : "Gửi lại"}
              </button>
              {conv.channel === "messenger" && /HUMAN_AGENT/.test(m.error) && (
                <button type="button" className="rounded bg-surface/70 px-2 py-0.5 font-medium hover:bg-surface" disabled={busy} onClick={() => resend(true)}>
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

/** Luồng tin nhắn thường, chia theo ngày. */
export function MessageList({ messages, conv, onResent, onSavePhone }: { messages: InboxMessage[]; conv: InboxItem; onResent: () => Promise<void>; onSavePhone?: (p: string) => void }) {
  const groups: { day: string; items: InboxMessage[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.at);
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
    groups[groups.length - 1].items.push(m);
  }
  return (
    <>
      {groups.map((g) => (
        <div key={g.day}>
          <div className="my-3 flex items-center gap-3 text-[11.5px] text-ink-2">
            <span className="h-px flex-1 bg-line-soft" />
            {g.day}
            <span className="h-px flex-1 bg-line-soft" />
          </div>
          <ul className="space-y-1.5">
            {g.items.map((m) => (
              <Bubble key={m.id} m={m} conv={conv} onResent={onResent} onSavePhone={onSavePhone} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/* ───────────── Bình luận ───────────── */

export type CommentAction = "reply" | "private_reply" | "hide" | "unhide" | "like" | "delete" | "mark_order";

export function PostHeader({ post, postId, onFilterPost }: { post: InboxPost | null; postId: string; onFilterPost?: (postId: string) => void }) {
  if (!post && !postId) return null;
  return (
    <div className="card mb-3 flex gap-3 p-2.5">
      {post?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image} alt="" loading="lazy" className="h-16 w-16 flex-none rounded object-cover" />
      ) : (
        <span className="grid h-16 w-16 flex-none place-items-center rounded bg-surface-2 text-ink-2">
          <Icon name="feed" size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
          {post?.live && <span className="rounded bg-danger px-1 text-[10px] font-semibold text-white">LIVE</span>}
          <span>Bài viết{post ? ` · ${new Date(post.postedAt).toLocaleDateString("vi-VN")}` : ""}</span>
          {post && post.commentsCount > 0 && <span>· {post.commentsCount} bình luận</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[13px]">{post?.message || <span className="italic text-ink-2">Chưa tải được nội dung bài viết</span>}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-[12px]">
          {post?.permalink && (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              <Icon name="open" size={12} /> Xem trên Facebook
            </a>
          )}
          {onFilterPost && (
            <button type="button" className="flex items-center gap-1 text-ink-2 hover:text-ink hover:underline" onClick={() => onFilterPost(post?.postId ?? postId)}>
              <Icon name="filter" size={12} /> Hội thoại của bài này
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type CommentProps = {
  m: InboxMessage;
  replies: InboxMessage[];
  conv: InboxItem;
  canModerate: boolean;
  busyId: string;
  onAction: (a: CommentAction, m: InboxMessage) => void;
  onSavePhone?: (p: string) => void;
};

function CommentItem({ m, replies, conv, canModerate, busyId, onAction, onSavePhone, nested }: CommentProps & { nested?: boolean }) {
  const page = m.direction !== "in";
  const busy = busyId === m.id;
  // Đã xoá trên Facebook (bởi trang hoặc người bình luận): giữ lại để đọc ngữ cảnh, không còn thao tác.
  const gone = m.status === "deleted" || m.status === "removed";
  const Act = ({ a, label, icon, danger }: { a: CommentAction; label: string; icon: string; danger?: boolean }) => (
    <button type="button" disabled={busy} onClick={() => onAction(a, m)} className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover disabled:opacity-50 ${danger ? "hover:text-danger" : "hover:text-ink"}`}>
      <Icon name={icon} size={12} /> {label}
    </button>
  );
  return (
    <li className={nested ? "mt-2" : ""}>
      <div className={`flex gap-2 ${m.hidden || gone ? "opacity-55" : ""}`}>
        <Avatar name={page ? conv.pageName || "Trang" : m.author || conv.name} size={nested ? 24 : 30} />
        <div className="min-w-0 flex-1">
          <div className={`inline-block max-w-full rounded-2xl px-3 py-1.5 ${page ? "bg-primary-selected" : "bg-surface"} border border-line-soft`}>
            <span className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <b className="font-semibold">{page ? conv.pageName || "Trang" : m.author || conv.name}</b>
              {page && <span className="text-[11px] text-ink-2">· {m.author}</span>}
              {gone ? <span className="badge-danger text-[10px]">Đã xoá</span> : m.hidden && <span className="badge-warning text-[10px]">Đã ẩn</span>}
              {m.liked && (
                <span className="text-[11px] text-primary" title="Trang đã thích">
                  ♥ Đã thích
                </span>
              )}
            </span>
            <p className={`whitespace-pre-wrap break-words text-[14px] leading-snug ${gone ? "line-through" : ""}`}>
              <MessageText text={m.text} onSavePhone={page || gone ? undefined : onSavePhone} />
            </p>
            {m.attachments.map((a, i) => (
              <Attach key={i} a={a} />
            ))}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-0.5 text-[11.5px] text-ink-2">
            <span className="px-1.5">{hhmm(m.at)}</span>
            {m.status === "failed" && <span className="px-1 text-danger">Lỗi: {m.error}</span>}
            {!page && !gone && (
              <>
                <Act a="reply" label="Trả lời" icon="chat" />
                <Act a="private_reply" label="Nhắn riêng" icon="send" />
                <Act a="like" label={m.liked ? "Bỏ thích" : "Thích"} icon="check" />
                {canModerate && <Act a={m.hidden ? "unhide" : "hide"} label={m.hidden ? "Hiện" : "Ẩn"} icon={m.hidden ? "eye" : "lock"} />}
                {!conv.orderMarked && <Act a="mark_order" label="Tạo đơn" icon="cart" />}
              </>
            )}
            {canModerate && !gone && <Act a="delete" label="Xoá" icon="trash" danger />}
            {busy && <span className="px-1">Đang xử lý…</span>}
          </div>
          {replies.length > 0 && (
            <ul className="border-l-2 border-line-soft pl-3">
              {replies.map((r) => (
                <CommentItem key={r.id} m={r} replies={[]} conv={conv} canModerate={canModerate} busyId={busyId} onAction={onAction} onSavePhone={onSavePhone} nested />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Luồng bình luận: bình luận gốc theo thời gian, trả lời lồng bên dưới (theo parentId = commentId cha).
 * Tin nhắn riêng / ghi chú xen theo thời gian dạng bong bóng.
 */
export function CommentThread({ messages, conv, canModerate, busyId, onAction, onResent, onSavePhone }: { messages: InboxMessage[]; conv: InboxItem; canModerate: boolean; busyId: string; onAction: (a: CommentAction, m: InboxMessage) => void; onResent: () => Promise<void>; onSavePhone?: (p: string) => void }) {
  const comments = messages.filter((m) => m.kind === "comment");
  const byCid = new Map(comments.filter((m) => m.commentId).map((m) => [m.commentId, m]));
  const children = new Map<string, InboxMessage[]>();
  const roots: InboxMessage[] = [];
  for (const m of messages) {
    if (m.kind === "comment" && m.parentId && byCid.has(m.parentId)) {
      // Trả lời của trả lời vẫn gom về bình luận gốc (Facebook chỉ lồng một cấp).
      let root = byCid.get(m.parentId)!;
      for (let i = 0; i < 5 && root.parentId && byCid.has(root.parentId); i++) root = byCid.get(root.parentId)!;
      const arr = children.get(root.id) ?? [];
      arr.push(m);
      children.set(root.id, arr);
    } else roots.push(m);
  }
  return (
    <ul className="space-y-3">
      {roots.map((m) =>
        m.kind === "comment" ? (
          <CommentItem key={m.id} m={m} replies={children.get(m.id) ?? []} conv={conv} canModerate={canModerate} busyId={busyId} onAction={onAction} onSavePhone={onSavePhone} />
        ) : (
          <Bubble key={m.id} m={m} conv={conv} onResent={onResent} onSavePhone={onSavePhone} />
        ),
      )}
    </ul>
  );
}
