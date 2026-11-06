"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/Icon";
import { Drawer, Skeleton, toast } from "@/components/ui";
import { color } from "@/lib/colors";
import { viMessage } from "@/lib/format";
import { fold, renderQuickReply, VARIABLES, type InboxTag, type QuickReplyDTO, type Topic } from "@/lib/quick-replies";
import { InboxNav } from "./InboxNav";
import { TopicEditor } from "./TopicEditor";
import { api, type Perms } from "./shared";

type Tab = "replies" | "topics" | "tags";
type Draft = { id?: string; shortcut: string; topic: string; content: string; attachments: string };

const SAMPLE = { ten: "Lan", ten_day_du: "Nguyễn Thị Lan", trang: "Trang của bạn", sdt: "0912 345 678" };

function Row({ r, topic, canEdit, sortable, onEdit, onDelete }: { r: QuickReplyDTO; topic?: Topic; canEdit: boolean; sortable: boolean; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id, disabled: !sortable });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-start gap-2 rounded-md border border-line-soft bg-surface px-2.5 py-2 ${isDragging ? "z-10 shadow-lg" : ""}`}>
      {sortable && (
        <button type="button" className="mt-0.5 cursor-grab touch-none text-ink-2 hover:text-ink" aria-label="Kéo để sắp xếp" {...attributes} {...listeners}>
          <Icon name="grip" size={16} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.shortcut ? <b className="text-[13px] text-primary">/{r.shortcut}</b> : <span className="text-[12px] italic text-ink-2">không phím tắt</span>}
          {topic && (
            <span className="rounded-full px-2 text-[11px] leading-[18px]" style={{ background: color(topic.color).bg, color: color(topic.color).fg }}>
              {topic.name}
            </span>
          )}
          {r.attachments.length > 0 && (
            <span className="flex items-center gap-0.5 text-[11.5px] text-ink-2">
              <Icon name="upload" size={11} /> {r.attachments.length} ảnh
            </span>
          )}
          <span className="ml-auto text-[11.5px] text-ink-2 tnum" title="Số lần dùng">
            {r.uses} lần dùng
          </span>
        </div>
        <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[13.5px]">{r.content}</p>
      </div>
      {canEdit && (
        <div className="flex flex-none gap-0.5">
          <button type="button" className="grid h-8 w-8 place-items-center rounded text-ink-2 hover:bg-hover hover:text-ink" onClick={onEdit} aria-label="Sửa mẫu">
            <Icon name="edit" size={15} />
          </button>
          <button type="button" className="grid h-8 w-8 place-items-center rounded text-ink-2 hover:bg-hover hover:text-danger" onClick={onDelete} aria-label="Xoá mẫu">
            <Icon name="trash" size={15} />
          </button>
        </div>
      )}
    </li>
  );
}

export function QuickRepliesManager({ me, perms, initialTab, initialTags }: { me: string; perms: Perms; initialTab: Tab; initialTags: InboxTag[] }) {
  const canEdit = perms.manageQuick;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<QuickReplyDTO[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [tags, setTags] = useState<InboxTag[]>(initialTags);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const load = async () => {
    try {
      const r = await api<{ items: QuickReplyDTO[]; topics: Topic[] }>("/api/inbox/quick-replies");
      setItems(r.items);
      setTopics(r.topics);
    } catch (e) {
      setItems([]);
      toast(viMessage(e, "Không tải được mẫu"), "error");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (tab === "replies") u.searchParams.delete("tab");
    else u.searchParams.set("tab", tab);
    window.history.replaceState(null, "", u);
  }, [tab]);

  const tmap = useMemo(() => new Map(topics.map((t) => [t.key, t])), [topics]);
  const filtered = useMemo(() => {
    const f = fold(q.trim());
    return (items ?? []).filter((r) => (!topic || r.topic === topic || (topic === "-" && !r.topic)) && (!f || fold(`${r.shortcut} ${r.content}`).includes(f)));
  }, [items, q, topic]);
  const counts = useMemo(() => Object.fromEntries(topics.map((t) => [t.key, (items ?? []).filter((r) => r.topic === t.key).length])), [topics, items]);
  const sortable = canEdit && !q && !topic;

  async function onDragEnd(e: DragEndEvent) {
    if (!items || !e.over || e.active.id === e.over.id) return;
    const prev = items;
    const next = arrayMove(items, items.findIndex((r) => r.id === e.active.id), items.findIndex((r) => r.id === e.over!.id));
    setItems(next);
    try {
      await api("/api/inbox/quick-replies/order", { method: "PUT", json: { ids: next.map((r) => r.id) } });
    } catch (er) {
      setItems(prev);
      toast(viMessage(er, "Không lưu được thứ tự"), "error");
    }
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setErr("");
    const body = { shortcut: draft.shortcut, topic: draft.topic, content: draft.content, attachments: draft.attachments.split(/\s+/).filter(Boolean) };
    try {
      const r = draft.id ? await api<QuickReplyDTO>(`/api/inbox/quick-replies/${draft.id}`, { method: "PATCH", json: body }) : await api<QuickReplyDTO>("/api/inbox/quick-replies", { method: "POST", json: body });
      setItems((xs) => (draft.id ? (xs ?? []).map((x) => (x.id === r.id ? r : x)) : [...(xs ?? []), r]));
      toast(draft.id ? "Đã lưu mẫu" : "Đã thêm mẫu");
      setDraft(null);
    } catch (e) {
      setErr(viMessage(e, "Không lưu được"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: QuickReplyDTO) {
    if (!confirm(`Xoá mẫu${r.shortcut ? ` /${r.shortcut}` : ""}?`)) return;
    const prev = items;
    setItems((xs) => (xs ?? []).filter((x) => x.id !== r.id));
    try {
      await api(`/api/inbox/quick-replies/${r.id}`, { method: "DELETE" });
      toast("Đã xoá mẫu");
    } catch (e) {
      setItems(prev);
      toast(viMessage(e, "Không xoá được"), "error");
    }
  }

  async function doImport() {
    if (busy || !importText.trim()) return;
    if (importMode === "replace" && !confirm("Xoá toàn bộ mẫu hiện có rồi nhập mới?")) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; updated: number }>("/api/inbox/quick-replies/import", { method: "POST", json: { text: importText, mode: importMode } });
      toast(`Đã nhập: ${r.created} mẫu mới, ${r.updated} cập nhật`);
      setImportOpen(false);
      setImportText("");
      await load();
    } catch (e) {
      toast(viMessage(e, "Không nhập được"), "error");
    } finally {
      setBusy(false);
    }
  }

  function insertVar(k: string) {
    if (!draft) return;
    const el = boxRef.current;
    const s = el?.selectionStart ?? draft.content.length;
    const e2 = el?.selectionEnd ?? s;
    const v = `{${k}}`;
    setDraft({ ...draft, content: draft.content.slice(0, s) + v + draft.content.slice(e2) });
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(s + v.length, s + v.length);
    }, 0);
  }

  const TABS: [Tab, string][] = [
    ["replies", "Mẫu trả lời"],
    ["topics", "Chủ đề"],
    ["tags", "Thẻ hội thoại"],
  ];

  return (
    <div className="canvas px-4 pb-16 pt-5 sm:px-8">
      <h1 className="text-[24px] font-semibold">Trả lời nhanh & thẻ</h1>
      <InboxNav perms={perms} />
      <p className="mt-2 max-w-2xl text-[13.5px] text-ink-2">
        Khi chat, gõ <kbd>/</kbd> + phím tắt để chèn mẫu. Biến {VARIABLES.map((v) => `{${v.key}}`).join(" ")} tự thay theo khách và nhân viên. {!canEdit && "Bạn đang xem: nhờ quản lý cấp quyền “Quản lý trả lời nhanh & thẻ” để sửa."}
      </p>
      <div className="mt-4 flex gap-1 border-b border-line-soft" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-[14px] ${tab === k ? "border-primary font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "replies" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
              <input className="input pl-8" placeholder="Tìm phím tắt hoặc nội dung" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm mẫu" />
            </div>
            <a href="/api/inbox/quick-replies/export?format=json" className="btn-outline" download>
              <Icon name="download" size={14} /> JSON
            </a>
            <a href="/api/inbox/quick-replies/export?format=csv" className="btn-outline" download>
              <Icon name="download" size={14} /> CSV
            </a>
            {canEdit && (
              <>
                <button type="button" className="btn-outline" onClick={() => setImportOpen(true)}>
                  <Icon name="upload" size={14} /> Nhập
                </button>
                <button type="button" className="btn-primary" onClick={() => setDraft({ shortcut: "", topic: topic && topic !== "-" ? topic : "", content: "", attachments: "" })}>
                  <Icon name="plus" size={14} /> Thêm mẫu
                </button>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {[{ key: "", name: `Tất cả (${items?.length ?? 0})`, color: "" }, ...topics.map((t) => ({ ...t, name: `${t.name} (${counts[t.key] ?? 0})` })), { key: "-", name: "Chưa phân loại", color: "gray" }].map((t) => (
              <button key={t.key || "all"} type="button" onClick={() => setTopic(t.key)} className={`chip h-7 gap-1 px-2.5 text-[12.5px] ${topic === t.key ? "chip-on" : ""}`}>
                {t.color && <span className="h-2 w-2 rounded-full" style={{ background: color(t.color).bg }} />}
                {t.name}
              </button>
            ))}
          </div>
          {!sortable && canEdit && (items?.length ?? 0) > 1 && <p className="mt-2 text-[12px] text-ink-2">Bỏ tìm kiếm và lọc chủ đề để kéo thả sắp xếp.</p>}
          {items === null ? (
            <div className="mt-3 grid gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={filtered.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="mt-3 grid gap-1.5">
                  {filtered.map((r) => (
                    <Row key={r.id} r={r} topic={tmap.get(r.topic)} canEdit={canEdit} sortable={sortable} onEdit={() => setDraft({ id: r.id, shortcut: r.shortcut, topic: r.topic, content: r.content, attachments: r.attachments.join("\n") })} onDelete={() => void remove(r)} />
                  ))}
                  {!filtered.length && (
                    <li className="rounded-md border border-dashed border-line py-10 text-center text-[13px] text-ink-2">
                      {items.length ? "Không có mẫu khớp." : canEdit ? "Chưa có mẫu nào. Bấm “Thêm mẫu” hoặc nhập từ tệp." : "Chưa có mẫu nào."}
                    </li>
                  )}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {tab === "topics" && (
        <div className="mt-4 max-w-3xl">
          <TopicEditor title="Chủ đề mẫu trả lời" hint="Nhóm mẫu theo chủ đề để nhân viên tìm nhanh trong ô chọn mẫu. Kéo để đổi thứ tự hiển thị." items={topics} canEdit={canEdit} endpoint="/api/inbox/quick-replies/topics" field="topics" counts={counts} onSaved={(t) => { setTopics(t); void load(); }} />
        </div>
      )}
      {tab === "tags" && (
        <div className="mt-4 max-w-3xl">
          <TopicEditor title="Thẻ hội thoại" hint="Gắn thẻ ở đầu hội thoại hoặc gắn hàng loạt; lọc danh sách theo thẻ (có / không có). Xoá thẻ sẽ gỡ thẻ khỏi mọi hội thoại." items={tags} canEdit={canEdit} endpoint="/api/inbox/tags" field="tags" onSaved={setTags} />
        </div>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Sửa mẫu trả lời" : "Thêm mẫu trả lời"}
        width={520}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              Huỷ
            </button>
            <button type="button" className="btn-primary" disabled={busy || !draft?.content.trim()} aria-busy={busy} onClick={save}>
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-3 px-5 py-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12.5px] text-ink-2">
                Phím tắt
                <div className="relative mt-0.5">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2">/</span>
                  <input className="input pl-5" value={draft.shortcut} maxLength={40} placeholder="chao" onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })} />
                </div>
              </label>
              <label className="text-[12.5px] text-ink-2">
                Chủ đề
                <select className="input mt-0.5" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })}>
                  <option value="">Chưa phân loại</option>
                  {topics.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-[12.5px] text-ink-2">
              Nội dung
              <textarea ref={boxRef} className="textarea mt-0.5 text-[14px]" rows={6} maxLength={2000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
            </label>
            <div className="flex flex-wrap gap-1">
              {VARIABLES.map((v) => (
                <button key={v.key} type="button" className="chip h-7 px-2 text-[12px]" title={v.label} onClick={() => insertVar(v.key)}>
                  {`{${v.key}}`}
                </button>
              ))}
            </div>
            <label className="text-[12.5px] text-ink-2">
              Ảnh đính kèm (mỗi dòng một link https)
              <textarea className="textarea mt-0.5 text-[13px]" rows={2} value={draft.attachments} onChange={(e) => setDraft({ ...draft, attachments: e.target.value })} placeholder="https://…/bang-gia.jpg" />
              <span className="mt-0.5 block text-[11.5px]">Kênh chat hiện gửi chữ, nên ảnh được gửi kèm dạng link ở cuối tin.</span>
            </label>
            <div>
              <div className="label">Xem trước</div>
              <p className="mt-1 whitespace-pre-line rounded bg-surface-2 px-3 py-2 text-[13.5px]">{draft.content.trim() ? renderQuickReply(draft.content, { ...SAMPLE, nhan_vien: me }) : <span className="text-ink-2">Nhập nội dung để xem trước.</span>}</p>
            </div>
            {err && (
              <p className="rounded bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
                {err}
              </p>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Nhập mẫu trả lời"
        subtitle="Tệp JSON (xuất từ đây) hoặc CSV / dán từ Excel với cột phim_tat, chu_de, noi_dung, anh"
        width={520}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setImportOpen(false)}>
              Huỷ
            </button>
            <button type="button" className="btn-primary" disabled={busy || !importText.trim()} aria-busy={busy} onClick={doImport}>
              {busy ? "Đang nhập…" : "Nhập"}
            </button>
          </div>
        }
      >
        <div className="grid gap-3 px-5 py-4">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.txt,text/csv,application/json"
            className="text-[13px]"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2_000_000) return toast("Tệp quá lớn (tối đa 2MB)", "error");
              setImportText(await f.text());
            }}
          />
          <textarea className="textarea font-mono text-[12.5px]" rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"phim_tat,chu_de,noi_dung\nchao,Chào hỏi,Dạ em chào {ten} ạ"} aria-label="Nội dung nhập" />
          <div className="flex flex-wrap gap-3 text-[13px]">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="imode" checked={importMode === "append"} onChange={() => setImportMode("append")} /> Thêm vào (trùng phím tắt thì cập nhật)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="imode" checked={importMode === "replace"} onChange={() => setImportMode("replace")} /> Thay toàn bộ
            </label>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
