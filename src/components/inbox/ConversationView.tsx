"use client";

import Link from "next/link";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Skeleton, toast } from "@/components/ui";
import { CreateTicketButton } from "@/components/care/CreateTicketButton";
import type { InboxDetail, InboxItem, InboxMessage } from "@/lib/inbox-types";
import type { InboxTag, QuickReplyDTO, Topic } from "@/lib/quick-replies";
import { Composer, type ComposerHandle } from "./Composer";
import { CommentThread, MessageList, PostHeader, type CommentAction } from "./Messages";
import { AngryBadge, api, ApiError, ChannelBadge, Face, StaffAvatar, TagChip, type Perms } from "./shared";

export type ConvPatch = Partial<Pick<InboxItem, "status" | "assignee" | "tags" | "orderMarked" | "recordId">> & { read?: boolean };

type Props = {
  conv: InboxItem;
  detail: InboxDetail | null;
  me: string;
  team: string[];
  perms: Perms;
  tags: InboxTag[];
  quick: QuickReplyDTO[];
  topics: Topic[];
  businessName: string;
  onBack: () => void;
  onInfo: () => void;
  onPatch: (patch: ConvPatch) => Promise<boolean>;
  onReload: () => Promise<void>;
  onSavePhone: (phone: string) => void;
  onFilterPost: (postId: string) => void;
  online: Set<string>;
};

/** Gọi API bình luận (nhóm kênh hiện thực). 404 không phải JSON = tính năng chưa có: báo nhẹ nhàng. */
async function commentApi(convId: string, body: { action: CommentAction; messageId?: string; text?: string }) {
  try {
    await api(`/api/inbox/${convId}/comment`, { method: "POST", json: body });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && !e.json) toast("Tính năng xử lý bình luận đang được hoàn thiện, thử lại sau nhé", "error");
    else toast(e instanceof Error && /[À-ỹ]/.test(e.message) ? e.message : "Không thực hiện được, thử lại nhé", "error");
    return false;
  }
}

function TagPicker({ conv, tags, canManage, onChange }: { conv: InboxItem; tags: InboxTag[]; canManage: boolean; onChange: (t: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const on = new Set(conv.tags);
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-ghost h-6 px-1.5 text-[12px] text-ink-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="plus" size={12} /> Thẻ
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-30 w-56 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <ul className="max-h-60 overflow-y-auto">
            {tags.map((t) => (
              <li key={t.key}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
                  <input type="checkbox" checked={on.has(t.key)} onChange={() => onChange(on.has(t.key) ? conv.tags.filter((k) => k !== t.key) : [...conv.tags, t.key])} />
                  <TagChip tag={t} small />
                </label>
              </li>
            ))}
            {!tags.length && <li className="px-2 py-2 text-[12.5px] text-ink-2">Chưa có thẻ nào.</li>}
          </ul>
          {canManage && (
            <Link href="/w/inbox/quick-replies?tab=tags" className="mt-1 block border-t border-line-soft px-2 pt-1.5 text-[12px] text-primary hover:underline">
              Quản lý thẻ…
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export const ConversationView = forwardRef<ComposerHandle, Props>(function ConversationView(p, composerRef) {
  const { conv, detail } = p;
  const [busy, setBusy] = useState("");
  const [busyId, setBusyId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, Partial<InboxMessage> | "deleted">>({});
  const [optimistic, setOptimistic] = useState<InboxMessage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const localRef = useRef<ComposerHandle | null>(null);

  const messages = useMemo(() => {
    if (!detail) return null;
    const base = detail.messages.filter((m) => overrides[m.id] !== "deleted").map((m) => (overrides[m.id] ? { ...m, ...(overrides[m.id] as Partial<InboxMessage>) } : m));
    return optimistic ? [...base, optimistic] : base;
  }, [detail, overrides, optimistic]);

  // Tin tạm biến mất khi máy chủ đã có tin thật tương ứng (không nhấp nháy khi lần làm mới chen vào giữa).
  useEffect(() => {
    if (!optimistic || !detail) return;
    const t0 = new Date(optimistic.at).getTime() - 5000;
    // Máy chủ có thể thêm chữ ký trang vào cuối tin Messenger → so khớp phần đầu.
    if (detail.messages.some((m) => m.text.startsWith(optimistic.text) && m.direction === optimistic.direction && new Date(m.at).getTime() >= t0)) setOptimistic(null);
  }, [detail, optimistic]);

  const lastId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const lastInboundComment = useMemo(() => [...(detail?.messages ?? [])].reverse().find((m) => m.kind === "comment" && m.direction === "in") ?? null, [detail]);

  async function patch(body: ConvPatch, label: string) {
    if (busy) return;
    setBusy(label);
    try {
      await p.onPatch(body);
    } finally {
      setBusy("");
    }
  }

  async function onCommentAction(a: CommentAction, m: InboxMessage) {
    if (a === "reply" || a === "private_reply") {
      const h = localRef.current;
      h?.setTarget(m, a === "reply" ? "reply" : "private");
      return;
    }
    if (a === "delete" && !confirm("Xoá bình luận này trên trang? Không khôi phục được.")) return;
    if (busyId) return;
    setBusyId(m.id);
    // Lạc quan: đổi ngay, lỗi thì trả lại.
    const before = overrides[m.id];
    const optimisticPatch: Partial<InboxMessage> | "deleted" | null = a === "hide" ? { hidden: true } : a === "unhide" ? { hidden: false } : a === "like" ? { liked: !m.liked } : a === "delete" ? "deleted" : null;
    if (optimisticPatch) setOverrides((o) => ({ ...o, [m.id]: optimisticPatch }));
    const okk = await commentApi(conv.id, { action: a, messageId: m.id });
    setBusyId("");
    if (!okk) {
      setOverrides((o) => {
        const n = { ...o };
        if (before === undefined) delete n[m.id];
        else n[m.id] = before;
        return n;
      });
      return;
    }
    if (a === "mark_order") toast("Đã đánh dấu tạo đơn");
    await p.onReload();
    setOverrides((o) => {
      const n = { ...o };
      delete n[m.id];
      return n;
    });
  }

  async function sendComment(action: "reply" | "private_reply", text: string, messageId?: string) {
    const target = messageId ?? lastInboundComment?.id;
    const okk = await commentApi(conv.id, { action, messageId: target, text });
    if (okk) toast(action === "reply" ? "Đã trả lời bình luận" : "Đã nhắn riêng cho khách");
    return okk;
  }

  const members = useMemo(() => [...new Set([...p.team, p.me].filter(Boolean))], [p.team, p.me]);
  const tagMap = new Map(p.tags.map((t) => [t.key, t]));
  const tagObjs = conv.tags.map((k) => tagMap.get(k)).filter((t): t is InboxTag => !!t);

  return (
    <>
      <header className="border-b border-line-soft px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={p.onBack} className="btn-ghost h-8 w-8 flex-none justify-center px-0 md:hidden" aria-label="Quay lại danh sách">
            <Icon name="chevron" size={18} className="rotate-90" />
          </button>
          <Face c={conv} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <b className="truncate text-[15px]">{conv.name}</b>
              {conv.kind === "comment" && <span className="badge-info flex-none text-[10.5px]">Bình luận</span>}
              {conv.sentiment === "negative" && <AngryBadge />}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2">
              <ChannelBadge channel={conv.channel} small page={conv.pageName || undefined} />
              <span className="truncate">{conv.recordTitle ? `Khách: ${conv.recordTitle}` : "Chưa gắn hồ sơ khách"}</span>
            </div>
          </div>
          <button type="button" onClick={p.onInfo} className="btn-outline h-8 flex-none px-2 text-[13px] xl:hidden" aria-label="Thông tin khách">
            <Icon name="person" size={14} /> <span className="hidden sm:inline">Khách</span>
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {p.perms.assign ? (
            <>
              <label className="sr-only" htmlFor="conv-assignee">
                Người phụ trách
              </label>
              <select id="conv-assignee" className="input h-7 w-auto max-w-[150px] py-0 pr-7 text-[12.5px]" value={conv.assignee} disabled={!!busy} onChange={(e) => patch({ assignee: e.target.value }, "assign")}>
                <option value="">Chưa giao</option>
                {members.map((m) => (
                  <option key={m} value={m}>
                    {m === p.me ? `${m} (bạn)` : m}
                    {p.online.has(m) ? " · đang trực" : ""}
                  </option>
                ))}
                {conv.assignee && !members.includes(conv.assignee) && <option value={conv.assignee}>{conv.assignee}</option>}
              </select>
            </>
          ) : conv.assignee ? (
            <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
              <StaffAvatar name={conv.assignee} online={p.online.has(conv.assignee)} /> {conv.assignee === p.me ? "Bạn phụ trách" : conv.assignee}
            </span>
          ) : (
            <button type="button" className="btn-outline h-7 px-2 text-[12.5px]" disabled={!!busy} onClick={() => patch({ assignee: p.me }, "assign")}>
              <Icon name="person" size={13} /> Nhận hội thoại
            </button>
          )}
          {tagObjs.map((t) => (
            <TagChip key={t.key} tag={t} onRemove={() => patch({ tags: conv.tags.filter((k) => k !== t.key) }, "tags")} />
          ))}
          <TagPicker conv={conv} tags={p.tags} canManage={p.perms.manageQuick} onChange={(tags) => patch({ tags }, "tags")} />
          <span className="flex-1" />
          <button type="button" className="btn-ghost h-7 px-2 text-[12.5px] text-ink-2" disabled={!!busy} onClick={() => patch({ read: false }, "read")} title="Đánh dấu chưa đọc">
            <Icon name="mail" size={13} /> <span className="hidden lg:inline">Chưa đọc</span>
          </button>
          <CreateTicketButton conversationId={conv.id} recordId={conv.recordId ?? undefined} className="btn-ghost h-7 px-2 text-[12.5px]" label="Phiếu" />
          {conv.status === "done" ? (
            <button type="button" className="btn-outline h-7 px-2 text-[12.5px]" disabled={!!busy} onClick={() => patch({ status: "open" }, "status")}>
              <Icon name="refresh" size={13} /> Mở lại
            </button>
          ) : (
            <button type="button" className="btn h-7 bg-success px-2 text-[12.5px] text-white hover:brightness-95" disabled={!!busy} onClick={() => patch({ status: "done" }, "status")} title="Đánh dấu xong (phím e)">
              <Icon name="check" size={13} /> Xong
            </button>
          )}
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-surface-2 px-3 py-4 sm:px-6">
        {conv.kind === "comment" && <PostHeader post={detail?.post ?? null} postId={conv.postId} onFilterPost={p.onFilterPost} />}
        {!messages ? (
          <div className="space-y-3" aria-busy="true" aria-label="Đang tải tin nhắn">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <div className="flex justify-end">
              <Skeleton className="h-10 w-1/2 rounded-2xl" />
            </div>
            <Skeleton className="h-14 w-3/5 rounded-2xl" />
          </div>
        ) : !messages.length ? (
          <p className="py-10 text-center text-[13px] text-ink-2">Chưa có tin nhắn.</p>
        ) : conv.kind === "comment" ? (
          <CommentThread messages={messages} conv={conv} canModerate={p.perms.moderate} busyId={busyId} onAction={onCommentAction} onResent={p.onReload} onSavePhone={p.onSavePhone} />
        ) : (
          <MessageList messages={messages} conv={conv} onResent={p.onReload} onSavePhone={p.onSavePhone} />
        )}
      </div>
      <Composer
        ref={(h) => {
          localRef.current = h;
          if (typeof composerRef === "function") composerRef(h);
          else if (composerRef) composerRef.current = h;
        }}
        conv={conv}
        me={p.me}
        businessName={p.businessName}
        quick={p.quick}
        topics={p.topics}
        canManageQuick={p.perms.manageQuick}
        onComment={conv.kind === "comment" ? sendComment : undefined}
        onSent={p.onReload}
        onOptimistic={setOptimistic}
        defaultTarget={null}
      />
    </>
  );
});
