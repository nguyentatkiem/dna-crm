"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { viMessage } from "@/lib/format";
import { toSearchParams, type InboxQuery } from "@/lib/inbox-query";
import type { InboxDetail, InboxItem, InboxList, InboxPage } from "@/lib/inbox-types";
import type { InboxTag, QuickReplyDTO, Topic } from "@/lib/quick-replies";
import type { ComposerHandle } from "./Composer";
import { ConversationList, type BulkAction } from "./ConversationList";
import { ConversationView, type ConvPatch } from "./ConversationView";
import { CrmPanel, type CrmLabels, type StatusOpt } from "./CrmPanel";
import type { PostOpt } from "./FilterPanel";
import { SetupGuide, type Setup } from "./SetupGuide";
import { api, ApiError, typing, type Perms } from "./shared";
import { usePresence } from "@/lib/chat/usePresence";

export type InboxAppProps = {
  me: string;
  team: string[];
  labels: CrmLabels;
  statuses: StatusOpt[];
  hasAppointments: boolean;
  hasDeals: boolean;
  businessName: string;
  initial: InboxList;
  initialQuery: InboxQuery;
  initialId: string | null;
  setup: Setup;
  pages: InboxPage[];
  tags: InboxTag[];
  perms: Perms;
  posts: PostOpt[];
  channels: string[];
};
type Pane = "list" | "thread" | "info";

const TITLE = "Hộp thư · DNA CRM";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function InboxApp(props: InboxAppProps) {
  const { me, perms } = props;
  const [query, setQueryState] = useState<InboxQuery>(props.initialQuery);
  const [search, setSearch] = useState(props.initialQuery.q);
  const [list, setList] = useState<InboxList>(props.initial);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [selId, setSelId] = useState<string | null>(props.initialId);
  const [cursorId, setCursorId] = useState<string | null>(props.initialId);
  const [detail, setDetail] = useState<InboxDetail | null>(null);
  const [pane, setPane] = useState<Pane>(props.initialId ? "thread" : "list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [quick, setQuick] = useState<QuickReplyDTO[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [tags] = useState<InboxTag[]>(props.tags);
  const [savePhone, setSavePhone] = useState<{ phone: string; n: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Báo "đang trực" + biết ai đang trực (chấm xanh trên người phụ trách).
  const presence = usePresence();
  const online = useMemo(() => new Set(presence.online.map((x) => x.name)), [presence.online]);
  const composer = useRef<ComposerHandle | null>(null);

  const queryRef = useRef(query);
  queryRef.current = query;
  const selRef = useRef(selId);
  selRef.current = selId;

  // Thay đổi đang chờ máy chủ xác nhận: áp lên mọi dữ liệu tải về để lần làm mới không “giật” ngược.
  const pending = useRef(new Map<string, Partial<InboxItem>>());
  const applyPending = useCallback((c: InboxItem) => {
    const p = pending.current.get(c.id);
    return p ? { ...c, ...p } : c;
  }, []);

  /* ───────────── Tải danh sách ───────────── */

  const listSeq = useRef(0);
  const loadList = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      const seq = ++listSeq.current;
      if (!opts.quiet) setLoading(true);
      try {
        const data = await api<InboxList>(`/api/inbox?${toSearchParams(queryRef.current)}`);
        if (seq !== listSeq.current) return;
        const next = { ...data, items: data.items.map(applyPending) };
        setList((cur) => (same(cur, next) ? cur : next));
        setLoadErr("");
      } catch (e) {
        if (seq === listSeq.current) setLoadErr(viMessage(e, "Không tải được hộp thư"));
      } finally {
        if (seq === listSeq.current) setLoading(false);
      }
    },
    [applyPending],
  );

  const setQuery = useCallback((patch: Partial<InboxQuery>) => {
    setQueryState((q) => {
      const next = { ...q, ...patch };
      // Đổi bộ lọc (không phải "Tải thêm") thì quay về trang đầu.
      if (!("limit" in patch)) next.limit = 100;
      return next;
    });
    setSelected(new Set());
  }, []);

  // Ô tìm: chờ 300ms sau khi ngừng gõ.
  useEffect(() => {
    if (search === query.q) return;
    const t = setTimeout(() => setQuery({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search, query.q, setQuery]);

  const firstLoad = useRef(true);
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    void loadList();
  }, [query, loadList]);

  /* ───────────── Chi tiết ───────────── */

  const detailSeq = useRef(0);
  const loadDetail = useCallback(
    async (id: string) => {
      const seq = ++detailSeq.current;
      try {
        const d = await api<InboxDetail>(`/api/inbox/${id}`);
        if (selRef.current !== id || seq !== detailSeq.current) return;
        const next = { ...d, conversation: applyPending(d.conversation) };
        setDetail((cur) => (same(cur, next) ? cur : next));
      } catch (e) {
        if (selRef.current !== id || seq !== detailSeq.current) return;
        setDetail(null);
        // Hội thoại không còn (đã xoá / đã giao cho người khác mà mình chỉ xem được của mình): đóng lại, về danh sách
        // — trên điện thoại không thì kẹt ở khung trống không có nút quay lại.
        if (e instanceof ApiError && e.status === 404) {
          setSelId(null);
          setCursorId(null);
          setPane("list");
          toast("Không mở được hội thoại này (không còn hoặc bạn không có quyền xem)", "error");
        }
      }
    },
    [applyPending],
  );

  const markRead = useCallback(async (c: Pick<InboxItem, "id" | "unread" | "readAt" | "lastInAt">) => {
    const stale = c.unread > 0 || (c.lastInAt && (!c.readAt || new Date(c.readAt) < new Date(c.lastInAt)));
    if (!stale) return;
    setList((l) => ({ ...l, unreadTotal: Math.max(0, l.unreadTotal - c.unread), items: l.items.map((x) => (x.id === c.id ? { ...x, unread: 0, readAt: new Date().toISOString() } : x)) }));
    await api(`/api/inbox/${c.id}`, { method: "PATCH", json: { read: true } }).catch(() => {});
  }, []);

  // Mở hội thoại: tải chi tiết, đánh dấu đã đọc, ghi ?c= lên URL.
  useEffect(() => {
    setDetail(null);
    if (!selId) return;
    void loadDetail(selId);
    const item = list.items.find((c) => c.id === selId);
    if (item) void markRead(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, loadDetail, markRead]);

  // URL phản ánh bộ lọc + hội thoại đang mở (chia sẻ link, F5 không mất).
  useEffect(() => {
    const u = toSearchParams(query);
    u.delete("limit");
    if (selId) u.set("c", selId);
    const s = u.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [query, selId]);

  // Người dùng vừa bấm "Chưa đọc" trên hội thoại đang mở: không tự đánh dấu đọc lại cho tới khi khách nhắn tin mới / mở hội thoại khác.
  const keepUnread = useRef<{ id: string; lastInAt: string | null } | null>(null);
  useEffect(() => {
    if (keepUnread.current && keepUnread.current.id !== selId) keepUnread.current = null;
  }, [selId]);

  // Có tin mới trong hội thoại đang mở (tab đang xem): đánh dấu đọc tiếp.
  useEffect(() => {
    const c = detail?.conversation;
    if (!c || document.hidden || c.id !== selId) return;
    const keep = keepUnread.current;
    if (keep && keep.id === c.id && keep.lastInAt === c.lastInAt) return;
    keepUnread.current = null;
    if (c.unread > 0) void markRead(c);
  }, [detail, selId, markRead]);

  /* ───────────── Làm mới định kỳ ───────────── */

  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      void loadList({ quiet: true });
      if (selRef.current) void loadDetail(selRef.current);
    }, 10000);
    return () => clearInterval(t);
  }, [loadList, loadDetail]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadList({ quiet: true }), selRef.current ? loadDetail(selRef.current) : null]);
    } finally {
      setRefreshing(false);
    }
  }, [loadList, loadDetail]);

  useEffect(() => {
    document.title = list.unreadTotal ? `(${list.unreadTotal}) ${TITLE}` : TITLE;
  }, [list.unreadTotal]);
  useEffect(() => () => void (document.title = TITLE), []);

  // Mẫu trả lời nhanh: tải một lần, tải lại khi quay lại tab (có thể vừa sửa ở trang quản lý).
  useEffect(() => {
    const load = () =>
      api<{ items: QuickReplyDTO[]; topics: Topic[] }>("/api/inbox/quick-replies")
        .then((r) => {
          setQuick(r.items);
          setTopics(r.topics);
        })
        .catch(() => {});
    void load();
    const v = () => !document.hidden && load();
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, []);

  /* ───────────── Sửa hội thoại (lạc quan) ───────────── */

  const patchLocal = useCallback((id: string, patch: Partial<InboxItem>) => {
    setList((l) => ({ ...l, items: l.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    setDetail((d) => (d && d.conversation.id === id ? { ...d, conversation: { ...d.conversation, ...patch } } : d));
  }, []);

  const onPatch = useCallback(
    async (id: string, body: ConvPatch) => {
      const cur = list.items.find((x) => x.id === id) ?? (detail?.conversation.id === id ? detail.conversation : undefined);
      const { read, ...rest } = body;
      if (read === false) keepUnread.current = { id, lastInAt: cur?.lastInAt ?? null };
      const local: Partial<InboxItem> = { ...rest, ...(read === true ? { unread: 0 } : read === false ? { unread: Math.max(1, cur?.unread ?? 0) } : {}) };
      const before: Partial<InboxItem> = cur ? Object.fromEntries(Object.keys(local).map((k) => [k, cur[k as keyof InboxItem]])) : {};
      pending.current.set(id, { ...pending.current.get(id), ...local });
      patchLocal(id, local);
      try {
        await api(`/api/inbox/${id}`, { method: "PATCH", json: body });
        pending.current.delete(id);
        void loadList({ quiet: true });
        if (selRef.current === id) void loadDetail(id);
        return true;
      } catch (e) {
        pending.current.delete(id);
        patchLocal(id, before);
        toast(viMessage(e, "Không lưu được thay đổi"), "error");
        return false;
      }
    },
    [list.items, detail, patchLocal, loadList, loadDetail],
  );

  const onBulk = useCallback(
    async (b: BulkAction) => {
      const ids = [...selected];
      if (!ids.length || bulkBusy) return;
      setBulkBusy(true);
      // Lạc quan cho các thao tác hiển thị rõ.
      for (const id of ids) {
        const c = list.items.find((x) => x.id === id);
        if (!c) continue;
        if (b.action === "read") patchLocal(id, { unread: 0 });
        else if (b.action === "done") patchLocal(id, { status: "done", unread: 0 });
        else if (b.action === "open") patchLocal(id, { status: "open" });
        else if (b.action === "assign") patchLocal(id, { assignee: b.assignee ?? "" });
        else if (b.action === "tag_add" && b.tag) patchLocal(id, { tags: [...new Set([...c.tags, b.tag])] });
        else if (b.action === "tag_remove" && b.tag) patchLocal(id, { tags: c.tags.filter((t) => t !== b.tag) });
      }
      try {
        const r = await api<{ count: number }>("/api/inbox/bulk", { method: "POST", json: { ids, ...b } });
        toast(`Đã cập nhật ${r.count} hội thoại`);
        setSelected(new Set());
      } catch (e) {
        toast(viMessage(e, "Không thực hiện được"), "error");
      } finally {
        setBulkBusy(false);
        void loadList({ quiet: true });
        if (selRef.current) void loadDetail(selRef.current);
      }
    },
    [selected, bulkBusy, list.items, patchLocal, loadList, loadDetail],
  );

  const open = useCallback((id: string) => {
    setSelId(id);
    setCursorId(id);
    setPane("thread");
  }, []);

  // Điều hướng mới tới /w/inbox?... trong khi đang ở Hộp thư (bấm thông báo, link "Mở hội thoại"): Next giữ nguyên
  // component, chỉ đổi props → mở hội thoại / áp bộ lọc mới (state ban đầu chỉ đọc props lúc mount).
  const navInit = useRef({ id: props.initialId, q: JSON.stringify(props.initialQuery) });
  useEffect(() => {
    const qs = JSON.stringify(props.initialQuery);
    if (qs !== navInit.current.q) {
      navInit.current.q = qs;
      if (qs !== JSON.stringify(queryRef.current)) {
        setQueryState(props.initialQuery);
        setSearch(props.initialQuery.q);
        setSelected(new Set());
      }
    }
    if (props.initialId !== navInit.current.id) {
      navInit.current.id = props.initialId;
      if (props.initialId && props.initialId !== selRef.current) open(props.initialId);
    }
  }, [props.initialId, props.initialQuery, open]);

  /* ───────────── Phím tắt ───────────── */

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      const items = list.items;
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "j" || e.key === "k") {
        if (!items.length) return;
        e.preventDefault();
        const i = items.findIndex((c) => c.id === (cursorId ?? selId));
        const dn = e.key === "ArrowDown" || e.key === "j";
        const ni = i < 0 ? 0 : Math.min(items.length - 1, Math.max(0, i + (dn ? 1 : -1)));
        setCursorId(items[ni].id);
      } else if (e.key === "Enter" && cursorId) {
        e.preventDefault();
        open(cursorId);
      } else if (e.key === "e" && selId) {
        e.preventDefault();
        const c = items.find((x) => x.id === selId) ?? detail?.conversation;
        if (c && c.status !== "done") {
          void onPatch(selId, { status: "done" }).then((ok) => ok && toast("Đã đánh dấu xong"));
        }
      } else if (e.key === "/") {
        e.preventDefault();
        if (selId) composer.current?.focus();
        else searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [list.items, cursorId, selId, detail, open, onPatch]);

  /* ───────────── Bố cục ───────────── */

  const empty = !list.counts.all && !list.items.length && !query.q && !query.page && query.status === "open" && !query.kind;
  const sel = detail?.conversation.id === selId ? detail : null;
  const listItem = list.items.find((c) => c.id === selId);
  const conv = sel?.conversation ?? listItem ?? null;
  const onSavePhone = useCallback((phone: string) => {
    setSavePhone((s) => ({ phone, n: (s?.n ?? 0) + 1 }));
    setPane("info");
  }, []);
  const onFilterPost = useCallback((postId: string) => setQuery({ post: postId, kind: "comment", status: "all" }), [setQuery]);
  const channels = useMemo(() => props.channels, [props.channels]);

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-surface md:rounded-tl-lg">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_290px] 2xl:grid-cols-[340px_minmax(0,1fr)_340px]">
        <section data-tour="inbox-list" className={`${pane === "list" ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col border-line-soft md:border-r`} aria-label="Danh sách hội thoại">
          <ConversationList
            list={list}
            loading={loading}
            err={loadErr}
            query={query}
            setQuery={setQuery}
            search={search}
            setSearch={setSearch}
            selId={selId}
            cursorId={cursorId}
            onOpen={open}
            selected={selected}
            setSelected={setSelected}
            onBulk={onBulk}
            bulkBusy={bulkBusy}
            pages={props.pages}
            tags={tags}
            team={props.team}
            me={me}
            perms={perms}
            posts={props.posts}
            channels={channels}
            searchRef={searchRef}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            empty={empty}
            online={online}
          />
        </section>

        <section className={`${pane === "thread" ? "flex" : pane === "info" ? "hidden xl:flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`} aria-label="Hội thoại">
          {selId && conv ? (
            <ConversationView
              key={selId}
              ref={composer}
              conv={conv}
              detail={sel}
              me={me}
              team={props.team}
              perms={perms}
              tags={tags}
              quick={quick}
              topics={topics}
              businessName={props.businessName}
              onBack={() => setPane("list")}
              onInfo={() => setPane("info")}
              onPatch={(b) => onPatch(selId, b)}
              onReload={async () => {
                await Promise.all([loadDetail(selId), loadList({ quiet: true })]);
              }}
              onSavePhone={onSavePhone}
              onFilterPost={onFilterPost}
              online={online}
            />
          ) : empty ? (
            <SetupGuide setup={props.setup} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-ink-2">
              <div>
                <Icon name="chat" size={30} className="mx-auto mb-2" />
                <b className="block text-ink">Chọn một hội thoại</b>
                <p className="mt-1 text-[13px]">Tin nhắn và bình luận của khách hiện ở cột bên trái, tự làm mới mỗi 10 giây.</p>
                <p className="mt-2 hidden text-[12px] md:block">
                  Phím tắt: <kbd>↑</kbd>
                  <kbd>↓</kbd> chọn · <kbd>Enter</kbd> mở · <kbd>e</kbd> xong · <kbd>/</kbd> trả lời
                </p>
              </div>
            </div>
          )}
        </section>

        <aside data-tour="inbox-crm" className={`${pane === "info" ? "flex" : "hidden xl:flex"} min-h-0 min-w-0 flex-col overflow-y-auto border-line-soft bg-surface-2 xl:border-l`} aria-label="Thông tin khách">
          {sel ? (
            <CrmPanel
              detail={sel}
              me={me}
              labels={props.labels}
              statuses={props.statuses}
              hasAppointments={props.hasAppointments}
              hasDeals={props.hasDeals}
              perms={perms}
              businessName={props.businessName}
              savePhone={savePhone}
              onBack={() => setPane("thread")}
              onChanged={async () => {
                await Promise.all([selRef.current ? loadDetail(selRef.current) : null, loadList({ quiet: true })]);
              }}
            />
          ) : (
            <div className="p-6 text-center text-[13px] text-ink-2">{selId ? "Đang tải…" : `Thông tin ${props.labels.contact.toLowerCase()} sẽ hiện ở đây.`}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
