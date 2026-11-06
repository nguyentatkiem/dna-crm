"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/ui";
import { activeFilterCount, isWaiting, waitLabel, waitLevel, type InboxQuery } from "@/lib/inbox-query";
import type { InboxItem, InboxList, InboxPage } from "@/lib/inbox-types";
import type { InboxTag } from "@/lib/quick-replies";
import { FilterPanel, type PostOpt } from "./FilterPanel";
import { InboxNav } from "./InboxNav";
import { AngryBadge, ChannelBadge, Face, short, StaffAvatar, TagChip, type Perms } from "./shared";

export type BulkAction = { action: "read" | "unread" | "done" | "open" | "tag_add" | "tag_remove" | "assign"; tag?: string; assignee?: string };

type Props = {
  list: InboxList;
  loading: boolean;
  err: string;
  query: InboxQuery;
  setQuery: (patch: Partial<InboxQuery>) => void;
  search: string;
  setSearch: (s: string) => void;
  selId: string | null;
  cursorId: string | null;
  onOpen: (id: string) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onBulk: (b: BulkAction) => Promise<void>;
  bulkBusy: boolean;
  pages: InboxPage[];
  tags: InboxTag[];
  team: string[];
  me: string;
  perms: Perms;
  posts: PostOpt[];
  channels: string[];
  searchRef: React.RefObject<HTMLInputElement | null>;
  refreshing: boolean;
  onRefresh: () => void;
  empty: boolean;
  online: Set<string>;
};

const WAIT_CLS = ["text-ink-2", "text-warning", "text-danger", "rounded bg-danger-soft px-1 font-semibold text-danger"];

const Row = memo(function Row({ c, active, cursor, checked, selecting, tagMap, now, online, onOpen, onCheck }: { c: InboxItem; active: boolean; cursor: boolean; checked: boolean; selecting: boolean; tagMap: Map<string, InboxTag>; now: number; online: boolean; onOpen: (id: string) => void; onCheck: (id: string) => void }) {
  const waiting = isWaiting(c);
  const ms = waiting && c.lastInAt ? now - new Date(c.lastInAt).getTime() : 0;
  const tags = c.tags.map((k) => tagMap.get(k)).filter((t): t is InboxTag => !!t);
  return (
    <li data-id={c.id} className={`group relative rounded-md ${active ? "bg-primary-selected" : cursor ? "bg-hover ring-1 ring-inset ring-primary/40" : "hover:bg-hover"}`}>
      <label className={`absolute left-1 top-1/2 z-10 -translate-y-1/2 items-center p-1.5 ${selecting || checked ? "flex" : "hidden md:group-hover:flex"}`}>
        <input type="checkbox" checked={checked} onChange={() => onCheck(c.id)} aria-label={`Chọn ${c.name}`} className="h-4 w-4" />
      </label>
      <button type="button" onClick={() => onOpen(c.id)} className={`flex w-full items-start gap-2.5 px-2.5 py-2.5 text-left ${selecting || checked ? "pl-8" : ""}`} aria-current={active ? "true" : undefined}>
        <Face c={c} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {c.kind === "comment" ? <span title="Bình luận" className="flex-none text-ink-2"><Icon name="feed" size={13} /><span className="sr-only">Bình luận</span></span> : null}
            <b className={`min-w-0 flex-1 truncate text-[14px] ${c.unread ? "font-semibold" : "font-medium"}`}>{c.name}</b>
            {c.phones.length > 0 && <span title="Có số điện thoại" className="flex-none text-success"><Icon name="phone" size={12} /><span className="sr-only">Có SĐT</span></span>}
            {/* Giờ tương đối tính lúc vẽ: máy chủ và trình duyệt có thể lệch qua mốc phút/giờ → không báo lỗi hydrate. */}
            <span suppressHydrationWarning className={`flex-none text-[11.5px] tnum ${c.unread ? "font-medium text-primary" : "text-ink-2"}`}>
              {short(c.lastAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={`min-w-0 flex-1 truncate text-[12.5px] ${c.unread ? "text-ink" : "text-ink-2"}`}>{c.lastText || "Chưa có tin"}</span>
            {c.unread > 0 && (
              <span className="grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white tnum" aria-label={`${c.unread} tin chưa đọc`}>
                {c.unread}
              </span>
            )}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-2">
            <ChannelBadge channel={c.channel} small page={c.pageName || undefined} />
            {waiting && (
              <span suppressHydrationWarning className={`flex flex-none items-center gap-0.5 tnum ${WAIT_CLS[waitLevel(ms)]}`} title="Khách đang chờ trả lời">
                <Icon name="clock" size={11} /> <span suppressHydrationWarning>{waitLabel(ms)}</span>
              </span>
            )}
            {c.status === "done" && <span className="badge-success flex-none text-[10px]">Đã xong</span>}
            {c.orderMarked && <span className="badge-info flex-none text-[10px]">Đơn</span>}
            {c.sentiment === "negative" && <AngryBadge small />}
            <span className="min-w-0 flex-1" />
            {c.assignee ? <StaffAvatar name={c.assignee} online={online} /> : <span className="flex-none whitespace-nowrap italic">chưa giao</span>}
          </span>
          {tags.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {tags.slice(0, 4).map((t) => (
                <TagChip key={t.key} tag={t} small />
              ))}
              {tags.length > 4 && <span className="text-[10.5px] text-ink-2">+{tags.length - 4}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
});

function Menu({ label, icon, children, disabled }: { label: string; icon: Parameters<typeof Icon>[0]["name"]; children: (close: () => void) => React.ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} className="btn-ghost h-7 px-2 text-[12.5px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={icon} size={13} /> {label}
      </button>
      {open && <div className="absolute left-0 top-8 z-30 max-h-64 w-52 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function ConversationList(p: Props) {
  const { list, query, setQuery, selected, setSelected, tags, perms } = p;
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ul = useRef<HTMLUListElement>(null);
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.key, t])), [tags]);
  const nFilters = activeFilterCount(query);

  // Đồng hồ chờ cập nhật mỗi 30 giây.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Con trỏ bàn phím luôn trong tầm nhìn.
  useEffect(() => {
    if (!p.cursorId) return;
    ul.current?.querySelector(`[data-id="${CSS.escape(p.cursorId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [p.cursorId]);

  const check = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const allIds = list.items.map((c) => c.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const members = [...new Set([p.me, ...p.team].filter(Boolean))];

  const TABS: [InboxQuery["kind"], string, number][] = [
    ["", "Tất cả", list.counts.all],
    ["inbox", "Tin nhắn", list.counts.inbox],
    ["comment", "Bình luận", list.counts.comment],
  ];

  return (
    <>
      <div className="border-b border-line-soft px-3 pb-2.5 pt-3 sm:px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[20px] font-semibold">Hộp thư</h1>
          <span className="flex-1" />
          <button type="button" onClick={p.onRefresh} disabled={p.refreshing} aria-busy={p.refreshing} className="btn-ghost h-8 w-8 justify-center px-0" title="Làm mới" aria-label="Làm mới">
            <Icon name="refresh" size={16} className={p.refreshing ? "animate-spin" : ""} />
          </button>
        </div>
        <InboxNav perms={perms} />
        {p.pages.length > 0 && (
          <select className="input mt-2 h-8 py-0 text-[13px]" value={query.page} onChange={(e) => setQuery({ page: e.target.value })} aria-label="Chọn trang">
            <option value="">Gộp trang · tất cả {p.pages.length} trang</option>
            {p.pages.map((pg) => (
              <option key={pg.pageId} value={pg.pageId}>
                {pg.name}
                {pg.active ? "" : " (tạm dừng)"}
              </option>
            ))}
          </select>
        )}
        <div className="relative mt-2 flex gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
            <input ref={p.searchRef} className="input h-8 pl-8 text-[13px]" placeholder="Tìm tên, SĐT hoặc nội dung" value={p.search} onChange={(e) => p.setSearch(e.target.value)} aria-label="Tìm hội thoại" />
          </div>
          <button type="button" onClick={() => setFilterOpen((v) => !v)} className={`btn-outline h-8 flex-none px-2 text-[13px] ${nFilters ? "border-primary text-primary" : ""}`} aria-expanded={filterOpen} aria-label="Bộ lọc nâng cao">
            <Icon name="filter" size={14} />
            <span className="hidden sm:inline">Lọc</span>
            {nFilters > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10.5px] font-semibold text-white tnum">{nFilters}</span>}
          </button>
          {filterOpen && <FilterPanel q={query} onChange={setQuery} tags={tags} team={p.team} me={p.me} posts={p.posts} channels={p.channels} onClose={() => setFilterOpen(false)} />}
        </div>
        <div className="mt-2 flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Loại hội thoại">
          {TABS.map(([k, label, n]) => (
            <button
              key={k || "all"}
              type="button"
              role="tab"
              aria-selected={query.kind === k}
              onClick={() => setQuery({ kind: k })}
              className={`flex h-7 flex-none items-center gap-1 rounded-full px-2.5 text-[12.5px] ${query.kind === k ? "bg-primary-selected font-medium text-ink" : "text-ink-2 hover:bg-hover"}`}
            >
              {label}
              {n > 0 && <span className="tnum text-[11px] text-ink-2">{n}</span>}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setQuery({ read: query.read === "unreplied" ? "" : "unreplied", sort: query.read === "unreplied" ? "newest" : "oldest_wait" })}
            className={`flex h-7 flex-none items-center gap-1 rounded-full px-2 text-[12px] ${query.read === "unreplied" ? "bg-warning-soft font-medium text-warning" : "text-ink-2 hover:bg-hover"}`}
            title="Chưa trả lời, đợi lâu nhất lên đầu"
          >
            <Icon name="clock" size={12} /> Chờ {list.counts.unreplied > 0 && <span className="tnum">{list.counts.unreplied}</span>}
          </button>
        </div>
        {(nFilters > 0 || query.post) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11.5px] text-ink-2">
            Đang lọc{query.post ? " theo bài viết" : ""} · {list.items.length}
            {list.hasMore ? "+" : ""} hội thoại
          </div>
        )}
      </div>

      {(selecting || selected.size > 0) && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line-soft bg-surface-2 px-2 py-1" role="toolbar" aria-label="Thao tác hàng loạt">
          <label className="flex items-center gap-1.5 px-1.5 text-[12.5px]">
            <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(allIds))} aria-label="Chọn tất cả" />
            <b className="tnum">{selected.size}</b> đã chọn
          </label>
          <span className="flex-1" />
          {selected.size > 0 && (
            <>
              <button type="button" disabled={p.bulkBusy} className="btn-ghost h-7 px-2 text-[12.5px]" onClick={() => p.onBulk({ action: "read" })}>
                <Icon name="eye" size={13} /> Đã đọc
              </button>
              <Menu label="Gắn thẻ" icon="segment" disabled={p.bulkBusy}>
                {(close) =>
                  tags.length ? (
                    tags.map((t) => (
                      <div key={t.key} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-hover">
                        <button
                          type="button"
                          className="min-w-0 flex-1 py-1 text-left"
                          onClick={() => {
                            close();
                            p.onBulk({ action: "tag_add", tag: t.key });
                          }}
                        >
                          <TagChip tag={t} small />
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-ink-2 hover:text-danger"
                          onClick={() => {
                            close();
                            p.onBulk({ action: "tag_remove", tag: t.key });
                          }}
                        >
                          Gỡ
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="p-2 text-[12.5px] text-ink-2">Chưa có thẻ.</p>
                  )
                }
              </Menu>
              {perms.assign && (
                <Menu label="Phân công" icon="person" disabled={p.bulkBusy}>
                  {(close) =>
                    [...members, ""].map((m) => (
                      <button
                        key={m || "-"}
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                        onClick={() => {
                          close();
                          p.onBulk({ action: "assign", assignee: m });
                        }}
                      >
                        {m ? <StaffAvatar name={m} size={20} online={p.online.has(m)} /> : <Avatar name="" size={20} />} {m ? (m === p.me ? `${m} (bạn)` : m) : "Bỏ giao"}
                        {m && p.online.has(m) && <span className="ml-auto text-[11px] text-success">đang trực</span>}
                      </button>
                    ))
                  }
                </Menu>
              )}
              <button type="button" disabled={p.bulkBusy} className="btn-ghost h-7 px-2 text-[12.5px] text-success" onClick={() => p.onBulk({ action: query.status === "done" ? "open" : "done" })}>
                <Icon name={query.status === "done" ? "refresh" : "check"} size={13} /> {query.status === "done" ? "Mở lại" : "Xong"}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-ghost h-7 w-7 justify-center px-0"
            aria-label="Thoát chọn nhiều"
            onClick={() => {
              setSelecting(false);
              setSelected(new Set());
            }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {p.err && <p className="mx-3 mt-2 rounded bg-danger-soft px-2 py-1 text-[12px] text-danger">{p.err}</p>}
      <ul ref={ul} className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Hội thoại" aria-busy={p.loading}>
        {p.loading && !list.items.length
          ? Array.from({ length: 7 }, (_, i) => (
              <li key={i} className="flex gap-2.5 px-2.5 py-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1">
                  <Skeleton lines={2} />
                </div>
              </li>
            ))
          : list.items.map((c) => <Row key={c.id} c={c} active={c.id === p.selId} cursor={c.id === p.cursorId} checked={selected.has(c.id)} selecting={selecting} tagMap={tagMap} now={now} online={!!c.assignee && p.online.has(c.assignee)} onOpen={p.onOpen} onCheck={check} />)}
        {list.hasMore && (
          <li className="p-2 text-center">
            <button type="button" className="btn-outline h-8 text-[12.5px]" disabled={p.loading} onClick={() => setQuery({ limit: Math.min(500, query.limit + 100) })}>
              {p.loading ? "Đang tải…" : "Tải thêm"}
            </button>
          </li>
        )}
        {!p.loading && !list.items.length && !p.empty && (
          <li className="px-4 py-10 text-center text-[13px] text-ink-2">
            {query.read === "unread" ? "Đã đọc hết, không còn tin nào chờ." : query.read === "unreplied" ? "Không còn khách nào chờ trả lời." : query.status === "done" ? "Chưa có hội thoại nào đánh dấu xong." : "Không có hội thoại khớp bộ lọc."}
          </li>
        )}
        {p.empty && (
          <li className="px-4 py-8 text-center text-[13px] text-ink-2">
            <Icon name="inbox" size={26} className="mx-auto mb-2" />
            Chưa có tin nhắn nào. Kết nối Zalo OA, Messenger hoặc fanpage để tin và bình luận của khách về đây.
          </li>
        )}
      </ul>
      <div className="hidden items-center gap-2 border-t border-line-soft px-3 py-1.5 text-[11px] text-ink-2 md:flex">
        <button type="button" className="hover:text-ink hover:underline" onClick={() => setSelecting((v) => !v)}>
          {selecting ? "Xong chọn" : "Chọn nhiều"}
        </button>
        <span className="flex-1" />
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> di chuyển · <kbd>Enter</kbd> mở · <kbd>e</kbd> xong · <kbd>/</kbd> trả lời
        </span>
      </div>
      <div className="flex border-t border-line-soft px-3 py-1.5 md:hidden">
        <button type="button" className="text-[12px] text-ink-2" onClick={() => setSelecting((v) => !v)}>
          {selecting ? "Xong chọn" : "Chọn nhiều"}
        </button>
      </div>
    </>
  );
}
