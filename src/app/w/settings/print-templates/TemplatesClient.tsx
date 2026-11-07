"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/Icon";
import { Tabs } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { PRINT_CSS } from "@/components/sales/print";
import { BLOCKS, BLOCK_TYPES, DOC_LABEL, DOC_TYPES, VARIABLES, builtinLayout, newBlock, opt, type Block, type BlockType, type DocType, type OptVal, type PrintCompany, type PrintData } from "@/lib/print/blocks";
import { PrintDoc, TEMPLATE_PRINT_CSS } from "@/lib/print/render";

export type Tpl = { id: string; name: string; docType: DocType; isDefault: boolean; layout: Block[] };
const BUILTIN = "builtin";

function Row({ b, on, onPick, onToggle, onMove, onRemove, first, last, disabled }: { b: Block; on: boolean; onPick: () => void; onToggle: () => void; onMove: (d: -1 | 1) => void; onRemove: () => void; first: boolean; last: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[13.5px] ${on ? "border-[var(--primary)] bg-primary-selected" : "border-line-soft bg-surface"} ${isDragging ? "z-10 shadow-panel" : ""} ${b.hidden ? "opacity-55" : ""}`}>
      {!disabled && (
        <button type="button" className="grid h-7 w-6 flex-none cursor-grab place-items-center text-ink-2 active:cursor-grabbing" aria-label={`Kéo để sắp xếp ${BLOCKS[b.type].label}`} {...attributes} {...listeners}>
          <Icon name="grip" size={14} />
        </button>
      )}
      <button type="button" className="min-w-0 flex-1 truncate py-1 text-left" onClick={onPick}>
        {BLOCKS[b.type].label}
        {b.type === "text" && opt<string>(b, "title") ? <span className="text-ink-2"> · {opt<string>(b, "title")}</span> : null}
      </button>
      {!disabled && (
        <>
          <button type="button" className="btn-ghost h-7 w-7 justify-center p-0 text-ink-2" aria-label="Lên" disabled={first} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className="btn-ghost h-7 w-7 justify-center p-0 text-ink-2" aria-label="Xuống" disabled={last} onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" className="btn-ghost h-7 w-7 justify-center p-0 text-ink-2" aria-label={b.hidden ? "Hiện khối" : "Ẩn khối"} aria-pressed={!b.hidden} onClick={onToggle}>
            <Icon name={b.hidden ? "lock" : "eye"} size={14} />
          </button>
          <button type="button" className="btn-ghost h-7 w-7 justify-center p-0 text-ink-2" aria-label="Xoá khối" onClick={onRemove}>
            <Icon name="x" size={14} />
          </button>
        </>
      )}
    </li>
  );
}

function Options({ b, set, disabled }: { b: Block; set: (patch: Partial<Block>) => void; disabled: boolean }) {
  const m = BLOCKS[b.type];
  const setOpt = (k: string, v: OptVal) => set({ opts: { ...(b.opts ?? {}), [k]: v } });
  return (
    <fieldset disabled={disabled} className="grid gap-2.5">
      <p className="text-[12.5px] text-ink-2">{m.desc}</p>
      {(m.align || m.size) && (
        <div className="flex flex-wrap gap-2">
          {m.align && (
            <div className="segmented" role="group" aria-label="Căn lề">
              {(
                [
                  ["left", "Trái"],
                  ["center", "Giữa"],
                  ["right", "Phải"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={(b.align ?? (b.type === "footer" ? "center" : b.type === "totals" ? "right" : "left")) === k} onClick={() => set({ align: k })}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {m.size && (
            <div className="segmented" role="group" aria-label="Cỡ chữ">
              {(
                [
                  ["sm", "Nhỏ"],
                  ["md", "Vừa"],
                  ["lg", "Lớn"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={(b.size ?? "md") === k} onClick={() => set({ size: k })}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {m.opts.map((o) =>
        o.kind === "bool" ? (
          <label key={o.key} className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={!!opt<boolean>(b, o.key)} onChange={(e) => setOpt(o.key, e.target.checked)} />
            {o.label}
          </label>
        ) : (
          <label key={o.key} className="grid gap-1">
            <span className="label">{o.label}</span>
            {o.kind === "textarea" ? (
              <textarea className="textarea min-h-[110px]" value={String(opt(b, o.key) ?? "")} maxLength={5000} onChange={(e) => setOpt(o.key, e.target.value)} />
            ) : (
              <input className="input" type={o.kind === "number" ? "number" : "text"} value={String(opt(b, o.key) ?? "")} placeholder={o.hint} maxLength={300} onChange={(e) => setOpt(o.key, o.kind === "number" ? Number(e.target.value) || 0 : e.target.value)} />
            )}
          </label>
        ),
      )}
      {(b.type === "text" || b.type === "signatures" || b.type === "title" || b.type === "customer" || b.type === "footer") && (
        <details className="text-[12.5px]">
          <summary className="cursor-pointer text-ink-2">Biến dùng được</summary>
          <ul className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
            {VARIABLES.map(([k, l]) => (
              <li key={k}>
                <code className="rounded bg-surface-2 px-1">{`{${k}}`}</code> <span className="text-ink-2">{l}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </fieldset>
  );
}

export function TemplatesClient({ initial, company, real, fake, canEdit, initialType }: { initial: Tpl[]; company: PrintCompany; real: Record<DocType, PrintData | null>; fake: Record<DocType, PrintData>; canEdit: boolean; initialType: DocType }) {
  const [tpls, setTpls] = useState(initial);
  const [type, setType] = useState<DocType>(initialType);
  const [sel, setSel] = useState<Record<DocType, string>>(() => {
    const pick = (t: DocType) => initial.find((x) => x.docType === t && x.isDefault)?.id ?? initial.find((x) => x.docType === t)?.id ?? BUILTIN;
    return { quote: pick("quote"), order: pick("order"), contract: pick("contract") };
  });
  const [draft, setDraft] = useState<{ id: string; name: string; layout: Block[] } | null>(null);
  const [block, setBlock] = useState<string | null>(null);
  const [useReal, setUseReal] = useState(true);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const list = tpls.filter((t) => t.docType === type);
  const curId = sel[type];
  const cur = list.find((t) => t.id === curId) ?? null;
  const isBuiltin = !cur;
  const layout = draft && draft.id === curId ? draft.layout : cur ? cur.layout : builtinLayout(type);
  const name = draft && draft.id === curId ? draft.name : cur?.name ?? "Mẫu gốc";
  const dirty = !!draft && draft.id === curId && !!cur && (JSON.stringify(draft.layout) !== JSON.stringify(cur.layout) || draft.name !== cur.name);
  const editable = canEdit && !isBuiltin;
  const data = (useReal && real[type]) || fake[type];
  const selBlock = layout.find((b) => b.id === block) ?? null;
  const anyDefault = list.some((t) => t.isDefault);

  const edit = (fn: (l: Block[]) => Block[]) => {
    if (!editable || !cur) return;
    setDraft({ id: cur.id, name, layout: fn(layout) });
  };
  const patchBlock = (id: string, p: Partial<Block>) => edit((l) => l.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const confirmLeave = () => !dirty || window.confirm("Mẫu đang sửa chưa lưu. Bỏ thay đổi?");

  function choose(id: string) {
    if (!confirmLeave()) return;
    setDraft(null);
    setBlock(null);
    setSel((s) => ({ ...s, [type]: id }));
  }

  async function create(fromId?: string) {
    if (!confirmLeave()) return;
    setBusy(true);
    const base = fromId ? tpls.find((t) => t.id === fromId) : null;
    const body = { docType: type, name: base ? `${base.name} (bản sao)` : `${DOC_LABEL[type]} – mẫu mới`, ...(fromId ? { fromId } : { layout: builtinLayout(type) }) };
    const res = await fetch("/api/print-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(j.error ?? "Không tạo được mẫu", "error");
    const t: Tpl = { id: j.id, name: j.name, docType: type, isDefault: j.isDefault, layout: JSON.parse(j.layoutJson) };
    setTpls((xs) => [t, ...xs]);
    setDraft(null);
    setSel((s) => ({ ...s, [type]: t.id }));
  }

  async function patch(body: Record<string, unknown>, okMsg?: string) {
    if (!cur) return;
    setBusy(true);
    const res = await fetch(`/api/print-templates/${cur.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(j.error ?? "Không lưu được", "error"), false;
    setTpls((xs) => xs.map((t) => (t.id === cur.id ? { ...t, name: j.name, layout: JSON.parse(j.layoutJson), isDefault: j.isDefault } : body.isDefault && t.docType === type ? { ...t, isDefault: false } : t)));
    if (okMsg) toast(okMsg);
    return true;
  }

  async function save() {
    if (!draft || !cur) return;
    if (await patch({ name: draft.name.trim() || cur.name, layout: draft.layout }, "Đã lưu mẫu")) setDraft(null);
  }

  async function setDefault(on: boolean) {
    if (cur) await patch({ isDefault: on }, on ? "Đã đặt làm mẫu mặc định" : "Đã bỏ mặc định");
  }

  async function remove() {
    if (!cur || !window.confirm(`Xoá mẫu “${cur.name}”?`)) return;
    const res = await fetch(`/api/print-templates/${cur.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast("Không xoá được", "error");
    setTpls((xs) => xs.filter((t) => t.id !== cur.id));
    setDraft(null);
    setSel((s) => ({ ...s, [type]: BUILTIN }));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    edit((l) => arrayMove(l, l.findIndex((b) => b.id === active.id), l.findIndex((b) => b.id === over.id)));
  }

  const addBlock = (t: BlockType) => {
    const nb = newBlock(t, t === "text" ? { title: "", text: "Kính gửi {ten_khach}," } : undefined);
    const i = selBlock ? layout.findIndex((b) => b.id === selBlock.id) + 1 : layout.length;
    edit((l) => [...l.slice(0, i), nb, ...l.slice(i)]);
    setBlock(nb.id);
  };

  const preview = useMemo(() => <PrintDoc layout={layout} data={data} company={company} preview selected={block} onSelect={(id) => setBlock(id)} />, [layout, data, company, block]);

  return (
    <div className="mt-4">
      <style>{PRINT_CSS + TEMPLATE_PRINT_CSS}</style>
      <Tabs
        className="no-print"
        items={DOC_TYPES.map((t) => ({ key: t, label: DOC_LABEL[t], count: tpls.filter((x) => x.docType === t).length || undefined }))}
        value={type}
        onChange={(k) => {
          if (!confirmLeave()) return;
          setDraft(null);
          setBlock(null);
          setType(k as DocType);
        }}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="no-print grid content-start gap-4">
          <section className="card grid gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">Mẫu {DOC_LABEL[type].toLowerCase()}</h2>
              {canEdit && (
                <button type="button" className="btn-ghost h-8 text-[13px]" disabled={busy} onClick={() => create()}>
                  <Icon name="plus" size={14} /> Mẫu mới
                </button>
              )}
            </div>
            <ul className="grid gap-1">
              <li>
                <button type="button" onClick={() => choose(BUILTIN)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] ${isBuiltin ? "bg-primary-selected" : "hover:bg-hover"}`}>
                  <span className="min-w-0 flex-1 truncate">Mẫu gốc (hệ thống)</span>
                  {!anyDefault && <span className="badge-success">Mặc định</span>}
                </button>
              </li>
              {list.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => choose(t.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] ${t.id === curId ? "bg-primary-selected" : "hover:bg-hover"}`}>
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    {t.isDefault && <span className="badge-success">Mặc định</span>}
                  </button>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="flex flex-wrap gap-1.5 border-t border-line-soft pt-2">
                {isBuiltin ? (
                  <button type="button" className="btn-outline h-8 text-[13px]" disabled={busy} onClick={() => create()}>
                    <Icon name="copy" size={14} /> Tuỳ biến từ mẫu gốc
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn-outline h-8 text-[13px]" disabled={busy} onClick={() => setDefault(!cur?.isDefault)}>
                      <Icon name="check" size={14} /> {cur?.isDefault ? "Bỏ mặc định" : "Đặt mặc định"}
                    </button>
                    <button type="button" className="btn-ghost h-8 text-[13px]" disabled={busy} onClick={() => cur && create(cur.id)}>
                      <Icon name="copy" size={14} /> Nhân bản
                    </button>
                    <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => edit(() => builtinLayout(type))} title="Đưa bố cục về như mẫu gốc (chưa lưu)">
                      <Icon name="refresh" size={14} /> Về mẫu gốc
                    </button>
                    <button type="button" className="btn-ghost h-8 text-[13px] text-danger" onClick={remove}>
                      <Icon name="trash" size={14} /> Xoá
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="card grid gap-2 p-3">
            {editable ? (
              <label className="grid gap-1">
                <span className="label">Tên mẫu</span>
                <input className="input" value={name} maxLength={120} onChange={(e) => cur && setDraft({ id: cur.id, name: e.target.value, layout })} />
              </label>
            ) : (
              <p className="text-[13px] text-ink-2">{canEdit ? "Mẫu gốc không sửa được. Bấm “Tuỳ biến từ mẫu gốc” để tạo bản sửa được." : "Bạn chỉ xem được mẫu in (cần quyền “Mẫu in” để sửa)."}</p>
            )}
            <div className="flex items-center justify-between">
              <h2 className="section-title">Khối ({layout.length})</h2>
              {editable && (
                <select className="input h-8 w-auto text-[13px]" aria-label="Thêm khối" value="" onChange={(e) => e.target.value && addBlock(e.target.value as BlockType)}>
                  <option value="">+ Thêm khối…</option>
                  {BLOCK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BLOCKS[t].label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={layout.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <ol className="grid gap-1">
                  {layout.map((b, i) => (
                    <Row
                      key={b.id}
                      b={b}
                      on={b.id === block}
                      disabled={!editable}
                      first={i === 0}
                      last={i === layout.length - 1}
                      onPick={() => setBlock(b.id === block ? null : b.id)}
                      onToggle={() => patchBlock(b.id, { hidden: !b.hidden })}
                      onMove={(d) => edit((l) => arrayMove(l, i, i + d))}
                      onRemove={() => {
                        edit((l) => l.filter((x) => x.id !== b.id));
                        if (block === b.id) setBlock(null);
                      }}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {selBlock && (
              <div className="mt-1 rounded-md border border-line-soft bg-surface-2 p-3">
                <p className="mb-2 font-medium">{BLOCKS[selBlock.type].label}</p>
                <Options b={selBlock} disabled={!editable} set={(p) => patchBlock(selBlock.id, p)} />
              </div>
            )}
            {editable && (
              <div className={`${dirty ? "sticky bottom-2 z-10" : ""} flex gap-2 pt-1`}>
                <button type="button" className="btn-primary flex-1 justify-center" disabled={!dirty || busy} onClick={save}>
                  <Icon name="check" size={15} /> {dirty ? "Lưu mẫu" : "Đã lưu"}
                </button>
                {dirty && (
                  <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
                    Bỏ
                  </button>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="grid content-start gap-2">
          <div className="no-print flex flex-wrap items-center justify-between gap-2">
            <div className="segmented" role="group" aria-label="Dữ liệu xem trước">
              <button type="button" aria-pressed={useReal && !!real[type]} disabled={!real[type]} onClick={() => setUseReal(true)}>
                {real[type] ? `Chứng từ thật (${real[type]!.number})` : "Chưa có chứng từ thật"}
              </button>
              <button type="button" aria-pressed={!useReal || !real[type]} onClick={() => setUseReal(false)}>
                Dữ liệu mẫu
              </button>
            </div>
            <button type="button" className="btn-outline h-8 text-[13px]" onClick={() => window.print()}>
              <Icon name="download" size={14} /> In thử A4
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg bg-surface-2 p-2 sm:p-4">
            <div className="print-area mx-auto w-full max-w-[210mm] rounded border border-line-soft bg-surface p-5 shadow-card sm:min-h-[297mm] sm:p-10">{preview}</div>
          </div>
          <p className="no-print text-[12.5px] text-ink-2">Bấm vào một phần trên bản xem trước để chọn khối tương ứng.</p>
        </div>
      </div>
    </div>
  );
}
