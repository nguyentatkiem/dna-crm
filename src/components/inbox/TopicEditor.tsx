"use client";

import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { viMessage } from "@/lib/format";
import type { Topic } from "@/lib/quick-replies";
import { ColorDots, TagChip } from "./shared";

type Row = Topic & { _id: string };

function Item({ r, canEdit, onChange, onDelete, extra }: { r: Row; canEdit: boolean; onChange: (p: Partial<Topic>) => void; onDelete: () => void; extra?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r._id, disabled: !canEdit });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex flex-wrap items-center gap-2 rounded-md border border-line-soft bg-surface px-2 py-2 ${isDragging ? "z-10 shadow-lg" : ""}`}>
      {canEdit && (
        <button type="button" className="cursor-grab touch-none text-ink-2 hover:text-ink" aria-label={`Kéo để sắp xếp ${r.name}`} {...attributes} {...listeners}>
          <Icon name="grip" size={16} />
        </button>
      )}
      <TagChip tag={r} />
      {canEdit ? (
        <>
          <input className="input h-8 min-w-[140px] flex-1 text-[13px]" value={r.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })} aria-label="Tên" />
          <ColorDots value={r.color} onChange={(color) => onChange({ color })} label={`Màu của ${r.name}`} />
          <button type="button" className="grid h-8 w-8 place-items-center rounded text-ink-2 hover:bg-hover hover:text-danger" onClick={onDelete} aria-label={`Xoá ${r.name}`}>
            <Icon name="trash" size={15} />
          </button>
        </>
      ) : (
        <span className="flex-1" />
      )}
      {extra && <span className="w-full pl-7 text-[11.5px] text-ink-2 sm:w-auto sm:pl-0">{extra}</span>}
    </li>
  );
}

/** Sửa danh sách thẻ / chủ đề: thêm, đổi tên, màu, kéo thả thứ tự, xoá; bấm Lưu để ghi cả danh sách. */
export function TopicEditor({ title, hint, items, canEdit, endpoint, field, counts, onSaved }: { title: string; hint: string; items: Topic[]; canEdit: boolean; endpoint: string; field: "tags" | "topics"; counts?: Record<string, number>; onSaved: (t: Topic[]) => void }) {
  const toRows = (xs: Topic[]) => xs.map((t, i) => ({ ...t, _id: `${t.key}-${i}` }));
  const [rows, setRows] = useState<Row[]>(toRows(items));
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => setRows(toRows(items)), [items]);
  const dirty = JSON.stringify(rows.map(({ _id, ...t }) => t)) !== JSON.stringify(items);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rows.findIndex((r) => r._id === e.active.id);
    const to = rows.findIndex((r) => r._id === e.over!.id);
    setRows(arrayMove(rows, from, to));
  }
  async function save() {
    if (busy) return;
    if (rows.some((r) => !r.name.trim())) return toast("Tên không được để trống", "error");
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: rows.map(({ _id, ...t }) => t) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Không lưu được");
      onSaved(j[field]);
      toast("Đã lưu");
    } catch (e) {
      toast(viMessage(e, "Không lưu được"), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <span className="flex-1" />
        {canEdit && (
          <button type="button" className="btn-primary" disabled={!dirty || busy} aria-busy={busy} onClick={save}>
            <Icon name="check" size={15} /> {busy ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{hint}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r._id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-3 grid gap-1.5">
            {rows.map((r) => (
              <Item
                key={r._id}
                r={r}
                canEdit={canEdit}
                extra={counts ? `${counts[r.key] ?? 0} mẫu` : undefined}
                onChange={(p) => setRows((rs) => rs.map((x) => (x._id === r._id ? { ...x, ...p } : x)))}
                onDelete={() => {
                  if ((counts?.[r.key] ?? 0) > 0 && !confirm(`Xoá “${r.name}”? Các mẫu thuộc chủ đề này sẽ về “Chưa phân loại”.`)) return;
                  if (field === "tags" && !confirm(`Xoá thẻ “${r.name}”? Thẻ sẽ được gỡ khỏi mọi hội thoại sau khi lưu.`)) return;
                  setRows((rs) => rs.filter((x) => x._id !== r._id));
                }}
              />
            ))}
            {!rows.length && <li className="py-4 text-center text-[13px] text-ink-2">Chưa có mục nào.</li>}
          </ul>
        </SortableContext>
      </DndContext>
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            if (rows.some((r) => r.name.trim().toLowerCase() === n.toLowerCase())) return toast("Tên này đã có", "error");
            const colors = ["blue", "green", "orange", "purple", "red", "sky", "pink", "grass", "berry", "darkblue", "yellow"];
            setRows((rs) => [...rs, { key: "", name: n, color: colors[rs.length % colors.length], _id: `new-${Date.now()}` }]);
            setName("");
          }}
        >
          <input className="input h-9" placeholder="Tên mới…" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-label="Tên mới" />
          <button className="btn-outline h-9 flex-none" type="submit">
            <Icon name="plus" size={14} /> Thêm
          </button>
        </form>
      )}
      {canEdit && dirty && <p className="mt-2 text-[12px] text-warning">Có thay đổi chưa lưu.</p>}
    </section>
  );
}
