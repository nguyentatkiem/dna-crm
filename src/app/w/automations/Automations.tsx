"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { OUTCOMES } from "@/lib/calls-shared";
import { ago } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Switch } from "@/app/onboarding/Wizard";
import {
  ACTION_LABEL,
  ACTION_TYPES,
  CHANNEL_LABEL,
  CONDITION_OPS,
  INBOX_CHANNEL,
  OP_LABEL,
  TRIGGER_LABEL,
  TRIGGER_TYPES,
  VARIABLES,
  conditionFields,
  sentence,
  templates,
  type Action,
  type ActionType,
  type Condition,
  type Part,
  type Rule,
  type TriggerType,
} from "./rules";

type Row = { id: string; enabled: boolean; runs: number; createdAt: string; rule: Rule; lastRunAt: string | null };
type Seq = { id: string; name: string };
type Props = { config: WorkspaceConfig; initial: Row[]; canManage: boolean; team: string[]; sequences: Seq[] };

const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const CHANNELS_REC: Record<string, string> = { ads: "Quảng cáo", organic: "Tự nhiên", zalo: "Zalo OA", ecommerce: "Sàn TMĐT", website: "Website", call: "Tổng đài", other: "Khác" };

const ACTION_ICON: Record<ActionType, string> = {
  create_task: "work",
  notify: "bell",
  assign_owner: "person",
  set_status: "refresh",
  set_field: "edit",
  send_message: "send",
  enroll_sequence: "mail",
  webhook: "link",
  add_activity: "doc",
  create_record: "plus",
};
const TRIGGER_ICON: Record<TriggerType, string> = {
  record_created: "plus",
  status_changed: "refresh",
  field_changed: "edit",
  score_above: "trend",
  call_logged: "phone",
  message_received: "chat",
  date_arrived: "calendar",
};

const joinParts = (p: Part[]) => p.map((x) => x.text).join("");

/** Câu đọc-chỉ của một luật: Khi [..] và [..] thì [..] và [..]. */
function Sentence({ rule, config, sequences }: { rule: Rule; config: WorkspaceConfig; sequences: Seq[] }) {
  const s = sentence(rule, config, { sequences });
  return (
    <p className="text-[15px] leading-[2.1]">
      <span className="text-ink-2">Khi </span>
      <span className="rounded-md bg-[#0073ea]/10 px-2 py-1 font-medium text-[#0060b9] dark:text-[#7cb8ff]">{joinParts(s.trigger)}</span>
      {s.conditions.map((c, i) => (
        <span key={i}>
          <span className="text-ink-2"> và </span>
          <span className="rounded-md bg-[#fdab3d]/15 px-2 py-1 font-medium">{joinParts(c)}</span>
        </span>
      ))}
      <span className="text-ink-2"> thì </span>
      {s.actions.map((a, i) => (
        <span key={i}>
          {i > 0 && <span className="text-ink-2"> và </span>}
          <span className="rounded-md bg-[#00c875]/15 px-2 py-1 font-medium">{joinParts(a)}</span>
        </span>
      ))}
    </p>
  );
}

export function Automations({ config, initial, canManage, team, sequences }: Props) {
  const [rows, setRows] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"rules" | "library">("rules");
  const [editing, setEditing] = useState<{ id: string | null; rule: Rule } | null>(null);
  const [history, setHistory] = useState<Record<string, { at: string; message: string }[] | "loading">>({});
  const library = useMemo(() => templates(config), [config]);

  async function toggle(r: Row) {
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
    const res = await fetch(`/api/automations/${r.id}`, json("PATCH", { enabled: !r.enabled }));
    if (!res.ok) {
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)));
      setMsg((await res.json().catch(() => ({}))).error ?? "Không đổi được trạng thái luật");
    }
  }
  async function remove(r: Row) {
    if (!confirm(`Xoá luật “${r.rule.name || "không tên"}”?`)) return;
    const res = await fetch(`/api/automations/${r.id}`, { method: "DELETE" });
    if (!res.ok) return setMsg((await res.json().catch(() => ({}))).error ?? "Không xoá được luật");
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  }
  async function duplicate(r: Row) {
    const res = await fetch("/api/automations", json("POST", { duplicateOf: r.id }));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(d.error ?? "Không nhân bản được");
    setRows((rs) => [...rs, d.automation]);
    setMsg("Đã nhân bản (đang tắt). Sửa lại rồi bật khi sẵn sàng.");
  }
  async function loadHistory(r: Row) {
    if (history[r.id]) return setHistory((h) => Object.fromEntries(Object.entries(h).filter(([k]) => k !== r.id)));
    setHistory((h) => ({ ...h, [r.id]: "loading" }));
    const d = await fetch(`/api/automations/${r.id}`).then((x) => x.json()).catch(() => ({ history: [] }));
    setHistory((h) => ({ ...h, [r.id]: d.history ?? [] }));
  }
  async function createFromText(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/automations", json("POST", { text }));
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(d.error ?? "Không tạo được luật");
    setRows((rs) => [...rs, d.automation]);
    setText("");
    setTab("rules");
    setMsg(d.source === "ai" ? "Automation Builder đã dựng luật bằng AI. Kiểm tra lại câu bên dưới, bấm Sửa nếu cần." : "Đã dựng luật theo từ khoá. Kiểm tra lại câu bên dưới, bấm Sửa nếu cần.");
  }
  async function saveRule(id: string | null, rule: Rule) {
    const res = id ? await fetch(`/api/automations/${id}`, json("PATCH", { rule })) : await fetch("/api/automations", json("POST", { rule }));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return d.error ?? "Không lưu được luật";
    if (id) setRows((rs) => rs.map((x) => (x.id === id ? { ...x, rule: d.rule, enabled: d.enabled } : x)));
    else setRows((rs) => [...rs, d.automation]);
    setEditing(null);
    setTab("rules");
    setMsg(id ? "Đã lưu luật." : "Đã tạo luật mới.");
    return null;
  }

  const example = config.objects.find((o) => o.key === "deals")?.statuses[3]?.label ?? "Đặt cọc";
  const blank: Rule = { name: "", trigger: { type: "record_created", object: config.objects[0]?.key ?? "contacts" }, conditions: [], actions: [{ type: "create_task", text: "Gọi cho {title}", days: 0, mode: "owner" }] };

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold">Tự động hoá</h1>
          <p className="mt-1 max-w-2xl text-ink-2">Luật dạng câu “Khi … thì …” chạy nền 24/7: khi có khách mới, đổi trạng thái, có cuộc gọi, khách nhắn tin, đến ngày hẹn...</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setEditing({ id: null, rule: blank })}>
            <Icon name="plus" size={16} /> Tạo luật
          </button>
        )}
      </div>

      {canManage ? (
        <form onSubmit={createFromText} className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-[#d9c5f0] bg-surface-2 p-3">
          <Icon name="spark" size={18} className="ml-1 text-[#a25ddc]" />
          <input
            id="auto-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Mô tả luật bằng lời"
            placeholder={`Mô tả bằng lời, ví dụ: Khi giai đoạn đổi thành ${example} thì tạo việc gọi xác nhận sau 1 ngày và thông báo cả đội`}
            className="h-9 min-w-0 flex-1 basis-60 bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-2"
          />
          <button className="btn-primary" disabled={busy || text.trim().length < 5}>
            {busy ? "Đang dựng..." : "AI tạo luật"}
          </button>
        </form>
      ) : (
        <p className="mt-5 rounded-lg bg-surface-2 p-3 text-[13.5px] text-ink-2">
          <Icon name="lock" size={14} className="mr-1 inline" /> Bạn đang xem. Chỉ chủ hoặc quản lý được tạo và sửa luật.
        </p>
      )}
      {msg && <p className="mt-2 text-[13px] text-ink-2">{msg}</p>}

      <nav className="mt-6 flex gap-1 border-b border-line" aria-label="Tự động hoá">
        {(
          [
            ["rules", `Luật của bạn (${rows.length})`],
            ["library", "Thư viện mẫu"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-[14px] ${tab === k ? "border-primary font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "rules" ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {rows.map((r, i) => {
            const h = history[r.id];
            return (
              <article key={r.id} className={`card grid min-w-0 gap-3 p-4 sm:p-5 ${r.enabled ? "" : "opacity-60"}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold">{r.rule.name || `Luật ${i + 1}`}</p>
                  <Switch on={r.enabled} onChange={() => toggle(r)} label="Bật luật" disabled={!canManage} />
                </div>
                <Sentence rule={r.rule} config={config} sequences={sequences} />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-[13px] text-ink-2">
                  <span className="tnum">
                    {r.enabled ? "Đang chạy" : "Đã tắt"} · đã chạy {r.runs} lần{r.lastRunAt ? ` · lần gần nhất ${ago(r.lastRunAt)}` : ""}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <button type="button" className="btn-ghost h-7 px-2 text-[13px]" onClick={() => loadHistory(r)}>
                      <Icon name="history" size={14} /> Lịch sử
                    </button>
                    {canManage && (
                      <>
                        <button type="button" className="btn-ghost h-7 px-2 text-[13px]" onClick={() => setEditing({ id: r.id, rule: structuredClone(r.rule) })}>
                          <Icon name="edit" size={14} /> Sửa
                        </button>
                        <button type="button" className="btn-ghost h-7 px-2 text-[13px]" onClick={() => duplicate(r)} aria-label="Nhân bản">
                          <Icon name="copy" size={14} />
                        </button>
                        <button type="button" className="btn-ghost h-7 px-2 text-[13px] text-[#df2f4a]" onClick={() => remove(r)} aria-label="Xoá">
                          <Icon name="trash" size={14} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {h && (
                  <div className="rounded-md bg-surface-2 p-3 text-[12.5px]">
                    {h === "loading" ? (
                      <p className="text-ink-2">Đang tải...</p>
                    ) : h.length === 0 ? (
                      <p className="text-ink-2">Luật chưa chạy lần nào.</p>
                    ) : (
                      <ul className="grid max-h-56 gap-1.5 overflow-auto">
                        {h.map((x, i) => (
                          <li key={i} className="flex gap-2">
                            <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${x.message.includes("Lỗi:") ? "bg-[#df2f4a]" : "bg-[#00c875]"}`} />
                            <span className="min-w-0 flex-1 break-words">{x.message.replace(/^\[[^\]]*\]\s*/, "")}</span>
                            <span className="flex-none text-ink-2">{ago(x.at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {rows.length === 0 && (
            <div className="card grid place-items-center gap-2 p-10 text-center xl:col-span-2">
              <Icon name="bolt" size={28} className="text-ink-2" />
              <p className="font-medium">Chưa có luật nào</p>
              <p className="max-w-md text-[13.5px] text-ink-2">Mô tả quy trình ở ô bên trên, chọn một mẫu trong Thư viện mẫu, hoặc bấm Tạo luật để tự ghép từng phần.</p>
              <button className="btn-outline mt-1" onClick={() => setTab("library")}>
                Xem thư viện mẫu
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-5">
          {[...new Set(library.map((l) => l.group))].map((g) => (
            <section key={g}>
              <p className="label">{g}</p>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                {library
                  .filter((l) => l.group === g)
                  .map((l, i) => (
                    <article key={i} className="card flex min-w-0 flex-col gap-2 p-4">
                      <p className="font-semibold">{l.rule.name}</p>
                      <Sentence rule={l.rule} config={config} sequences={sequences} />
                      {canManage && (
                        <div className="mt-auto pt-1">
                          <button className="btn-outline h-7 text-[13px]" onClick={() => setEditing({ id: null, rule: structuredClone(l.rule) })}>
                            Dùng mẫu này
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && <Builder key={editing.id ?? "new"} initial={editing.rule} isNew={!editing.id} config={config} team={team} sequences={sequences} onCancel={() => setEditing(null)} onSave={(rule) => saveRule(editing.id, rule)} />}
    </div>
  );
}

// ---------------- Trình tạo luật dạng câu ----------------

type Sel = { kind: "trigger" } | { kind: "cond"; i: number } | { kind: "action"; i: number } | null;
let seq = 0;
const keyed = (a: Action) => ({ k: `a${seq++}`, a });

function Builder({ initial, isNew, config, team, sequences, onCancel, onSave }: { initial: Rule; isNew: boolean; config: WorkspaceConfig; team: string[]; sequences: Seq[]; onCancel: () => void; onSave: (r: Rule) => Promise<string | null> }) {
  const [name, setName] = useState(initial.name);
  const [trigger, setTrigger] = useState(initial.trigger);
  const [conditions, setConditions] = useState<Condition[]>(initial.conditions);
  const [actions, setActions] = useState(() => initial.actions.map(keyed));
  const [sel, setSel] = useState<Sel>({ kind: "trigger" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const rule: Rule = { name, trigger, conditions, actions: actions.map((x) => x.a) };
  const s = sentence(rule, config, { sequences });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setActions((list) => {
      const from = list.findIndex((x) => x.k === e.active.id);
      const to = list.findIndex((x) => x.k === e.over!.id);
      if (sel?.kind === "action" && sel.i === from) setSel({ kind: "action", i: to });
      return arrayMove(list, from, to);
    });
  }
  async function save() {
    if (!actions.length) return setErr("Cần ít nhất một hành động");
    setSaving(true);
    setErr("");
    const finalName = name.trim() || `${TRIGGER_LABEL[trigger.type]} → ${actions.map((x) => ACTION_LABEL[x.a.type]).join(", ")}`.slice(0, 120);
    const e = await onSave({ ...rule, name: finalName });
    setSaving(false);
    if (e) setErr(e);
  }

  const chip = (active: boolean, tone: string) =>
    `inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-left text-[14px] font-medium transition-colors ${active ? "border-primary ring-2 ring-primary/30" : "border-transparent"} ${tone}`;

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/30 p-0 sm:items-center sm:p-6" onClick={onCancel}>
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-surface shadow-panel sm:rounded-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={isNew ? "Tạo luật" : "Sửa luật"}>
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
          <Icon name="bolt" size={18} className="text-primary" />
          <input className="input h-8 min-w-0 flex-1 border-transparent px-1 text-[15px] font-semibold hover:border-line" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên luật (tuỳ chọn)" aria-label="Tên luật" />
          <button className="btn-ghost h-8 w-8 justify-center p-0" onClick={onCancel} aria-label="Đóng">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="border-b border-line-soft bg-surface-2 px-4 py-4 text-[15px] leading-[2.4]">
            <span className="mr-1 text-ink-2">Khi</span>
            <button type="button" className={chip(sel?.kind === "trigger", "bg-[#0073ea]/10 text-[#0060b9] dark:text-[#7cb8ff]")} onClick={() => setSel({ kind: "trigger" })}>
              <Icon name={TRIGGER_ICON[trigger.type]} size={14} />
              <span className="truncate">{joinParts(s.trigger)}</span>
            </button>
            {conditions.map((_, i) => (
              <span key={i}>
                <span className="mx-1 text-ink-2">và</span>
                <span className={chip(sel?.kind === "cond" && sel.i === i, "bg-[#fdab3d]/15")}>
                  <button type="button" className="truncate" onClick={() => setSel({ kind: "cond", i })}>
                    {joinParts(s.conditions[i])}
                  </button>
                  <button
                    type="button"
                    aria-label="Bỏ điều kiện"
                    className="text-ink-2 hover:text-[#df2f4a]"
                    onClick={() => {
                      setConditions((c) => c.filter((__, j) => j !== i));
                      setSel(null);
                    }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              </span>
            ))}
            <button
              type="button"
              className="ml-1 inline-flex items-center gap-0.5 rounded-md border border-dashed border-line px-2 py-0.5 text-[13px] text-ink-2 hover:border-primary hover:text-primary"
              onClick={() => {
                setConditions((c) => [...c, { field: "status", op: "eq", value: getObject(config, trigger.object)?.statuses[0]?.key ?? "" }]);
                setSel({ kind: "cond", i: conditions.length });
              }}
            >
              <Icon name="plus" size={12} /> điều kiện
            </button>
            <span className="mx-1 text-ink-2">thì</span>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={actions.map((x) => x.k)} strategy={rectSortingStrategy}>
                {actions.map((x, i) => (
                  <SortableAction
                    key={x.k}
                    id={x.k}
                    first={i === 0}
                    label={joinParts(s.actions[i])}
                    icon={ACTION_ICON[x.a.type]}
                    className={chip(sel?.kind === "action" && sel.i === i, "bg-[#00c875]/15")}
                    onSelect={() => setSel({ kind: "action", i })}
                    onRemove={() => {
                      setActions((l) => l.filter((y) => y.k !== x.k));
                      setSel(null);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <button
              type="button"
              className="ml-1 inline-flex items-center gap-0.5 rounded-md border border-dashed border-line px-2 py-0.5 text-[13px] text-ink-2 hover:border-primary hover:text-primary"
              disabled={actions.length >= 10}
              onClick={() => {
                setActions((l) => [...l, keyed({ type: "notify", mode: "owner", text: "Có cập nhật ở {title}" })]);
                setSel({ kind: "action", i: actions.length });
              }}
            >
              <Icon name="plus" size={12} /> hành động
            </button>
            {actions.length > 1 && <p className="text-[12px] leading-5 text-ink-2">Kéo ⠿ để đổi thứ tự: các hành động chạy lần lượt từ trái sang phải.</p>}
          </div>

          <div className="p-4">
            {sel?.kind === "trigger" && <TriggerEditor rule={rule} config={config} onChange={(t) => setTrigger(t)} />}
            {sel?.kind === "cond" && conditions[sel.i] && (
              <ConditionEditor c={conditions[sel.i]} objectKey={trigger.object} config={config} team={team} onChange={(c) => setConditions((list) => list.map((x, j) => (j === sel.i ? c : x)))} />
            )}
            {sel?.kind === "action" && actions[sel.i] && (
              <ActionEditor a={actions[sel.i].a} objectKey={trigger.object} config={config} team={team} sequences={sequences} onChange={(a) => setActions((list) => list.map((x, j) => (j === sel.i ? { ...x, a } : x)))} />
            )}
            {!sel && <p className="py-6 text-center text-[13.5px] text-ink-2">Bấm vào một phần của câu bên trên để chỉnh.</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
          {err && <p className="mr-auto text-[13px] text-[#df2f4a]">{err}</p>}
          <button className="btn-outline" onClick={onCancel}>
            Huỷ
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Đang lưu..." : isNew ? "Tạo luật" : "Lưu luật"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableAction({ id, first, label, icon, className, onSelect, onRemove }: { id: string; first: boolean; label: string; icon: string; className: string; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <span ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={`inline ${isDragging ? "relative z-10 opacity-70" : ""}`}>
      {!first && <span className="mx-1 text-ink-2">và</span>}
      <span className={className}>
        <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} className="cursor-grab text-ink-2" aria-label="Kéo để đổi thứ tự">
          <Icon name="grip" size={12} />
        </button>
        <button type="button" className="inline-flex min-w-0 items-center gap-1" onClick={onSelect}>
          <Icon name={icon} size={13} />
          <span className="truncate">{label}</span>
        </button>
        <button type="button" aria-label="Bỏ hành động" className="text-ink-2 hover:text-[#df2f4a]" onClick={onRemove}>
          <Icon name="x" size={12} />
        </button>
      </span>
    </span>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`grid min-w-0 gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[12.5px] text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function Pick<T extends string>({ items, value, onPick, label }: { items: { key: T; label: string; icon?: string }[]; value: T; onPick: (k: T) => void; label: string }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button key={it.key} type="button" className={`chip gap-1 ${value === it.key ? "chip-on" : ""}`} onClick={() => onPick(it.key)}>
            {it.icon && <Icon name={it.icon} size={13} />}
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TriggerEditor({ rule, config, onChange }: { rule: Rule; config: WorkspaceConfig; onChange: (t: Rule["trigger"]) => void }) {
  const t = rule.trigger;
  const obj = getObject(config, t.object);
  const set = (p: Partial<Rule["trigger"]>) => onChange({ ...t, ...p });
  const dateFields = obj?.fields.filter((f) => f.type === "date") ?? [];
  return (
    <div className="grid gap-4">
      <Pick label="Khi nào chạy" items={TRIGGER_TYPES.map((k) => ({ key: k, label: TRIGGER_LABEL[k], icon: TRIGGER_ICON[k] }))} value={t.type} onPick={(type) => onChange({ type, object: t.object })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Bảng">
          <select className="input" value={t.object} onChange={(e) => onChange({ type: t.type, object: e.target.value })}>
            {config.objects.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </F>
        {t.type === "status_changed" && (
          <>
            <F label="Từ (tuỳ chọn)">
              <select className="input" value={t.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })}>
                <option value="">Bất kỳ</option>
                {obj?.statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </F>
            <F label="Sang">
              <select className="input" value={t.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })}>
                <option value="">Bất kỳ</option>
                {obj?.statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </F>
          </>
        )}
        {t.type === "field_changed" && (
          <>
            <F label="Trường">
              <select className="input" value={t.field ?? ""} onChange={(e) => set({ field: e.target.value })}>
                <option value="">Chọn trường</option>
                {obj?.fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </F>
            <F label="Giá trị mới (để trống = bất kỳ)">
              <input className="input" value={t.value ?? ""} onChange={(e) => set({ value: e.target.value || undefined })} />
            </F>
          </>
        )}
        {t.type === "score_above" && (
          <F label="Ngưỡng điểm">
            <input className="input tnum" type="number" min={0} max={100} value={t.threshold ?? 70} onChange={(e) => set({ threshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          </F>
        )}
        {t.type === "call_logged" && (
          <F label="Kết quả cuộc gọi">
            <select className="input" value={t.value ?? ""} onChange={(e) => set({ value: e.target.value || undefined })}>
              <option value="">Bất kỳ</option>
              {OUTCOMES.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </F>
        )}
        {t.type === "message_received" && (
          <F label="Kênh">
            <select className="input" value={t.value ?? ""} onChange={(e) => set({ value: e.target.value || undefined })}>
              <option value="">Mọi kênh</option>
              {Object.entries(INBOX_CHANNEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </F>
        )}
        {t.type === "date_arrived" && (
          <>
            <F label="Trường ngày">
              <select className="input" value={t.field ?? ""} onChange={(e) => set({ field: e.target.value })}>
                <option value="">{dateFields.length ? "Chọn trường ngày" : "Bảng này chưa có trường ngày"}</option>
                {dateFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </F>
            <F label="Chạy trước bao nhiêu ngày (0 = đúng ngày, âm = sau ngày)">
              <input className="input tnum" type="number" min={-365} max={365} value={t.days ?? 0} onChange={(e) => set({ days: Math.round(Number(e.target.value) || 0) })} />
            </F>
          </>
        )}
      </div>
      {t.type === "date_arrived" && <p className="text-[12.5px] text-ink-2">Luật “đến ngày” được kiểm tra mỗi ngày một lần bởi việc chạy nền.</p>}
    </div>
  );
}

function ValueInput({ field, value, objectKey, config, team, onChange }: { field: string; value: string; objectKey: string; config: WorkspaceConfig; team: string[]; onChange: (v: string) => void }) {
  const obj = getObject(config, objectKey);
  const def = field.startsWith("f:") ? obj?.fields.find((f) => f.key === field.slice(2)) : undefined;
  const options: { key: string; label: string }[] | null =
    field === "status"
      ? obj?.statuses.map((s) => ({ key: s.key, label: s.label })) ?? []
      : field === "owner"
        ? team.map((t) => ({ key: t, label: t }))
        : field === "channel"
          ? Object.entries(CHANNELS_REC).map(([key, label]) => ({ key, label }))
          : def?.type === "select"
            ? def.options.map((o) => ({ key: o.label, label: o.label }))
            : null;
  if (options)
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Chọn</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    );
  const numeric = field === "amount" || field === "score" || def?.type === "number" || def?.type === "money";
  return <input className="input" type={numeric ? "number" : def?.type === "date" ? "date" : "text"} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function ConditionEditor({ c, objectKey, config, team, onChange }: { c: Condition; objectKey: string; config: WorkspaceConfig; team: string[]; onChange: (c: Condition) => void }) {
  const fields = conditionFields(config, objectKey);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <F label="Trường">
        <select className="input" value={c.field} onChange={(e) => onChange({ field: e.target.value, op: c.op, value: "" })}>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </F>
      <F label="Toán tử">
        <select className="input" value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as Condition["op"] })}>
          {CONDITION_OPS.map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
      </F>
      {c.op !== "empty" && c.op !== "not_empty" && (
        <F label="Giá trị">
          <ValueInput field={c.field} value={c.value ?? ""} objectKey={objectKey} config={config} team={team} onChange={(value) => onChange({ ...c, value })} />
        </F>
      )}
    </div>
  );
}

function TextWithVars({ value, onChange, rows = 2, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div className="grid gap-1">
      <textarea className="textarea" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap items-center gap-1 text-[12px] text-ink-2">
        Chèn biến:
        {VARIABLES.map((v) => (
          <button key={v} type="button" className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] hover:bg-primary-selected" onClick={() => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${v}`)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionEditor({ a, objectKey, config, team, sequences, onChange }: { a: Action; objectKey: string; config: WorkspaceConfig; team: string[]; sequences: Seq[]; onChange: (a: Action) => void }) {
  const obj = getObject(config, objectKey);
  const set = (p: Partial<Action>) => onChange({ ...a, ...p });
  const people = (
    <select className="input" value={a.user ?? ""} onChange={(e) => set({ user: e.target.value })}>
      <option value="">Chọn người</option>
      {team.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
  return (
    <div className="grid gap-4">
      <Pick label="Làm gì" items={ACTION_TYPES.map((k) => ({ key: k, label: ACTION_LABEL[k], icon: ACTION_ICON[k] }))} value={a.type} onPick={(type) => onChange({ type, text: a.text })} />
      <div className="grid gap-3 sm:grid-cols-2">
        {a.type === "create_task" && (
          <>
            <F label="Nội dung việc" wide>
              <TextWithVars value={a.text ?? ""} onChange={(text) => set({ text })} placeholder="Gọi cho {title}" />
            </F>
            <F label="Hạn sau (ngày)">
              <input className="input tnum" type="number" min={0} max={365} value={a.days ?? 0} onChange={(e) => set({ days: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
            </F>
            <F label="Giao cho">
              <select className="input" value={a.mode === "user" ? "user" : "owner"} onChange={(e) => set({ mode: e.target.value })}>
                <option value="owner">Người phụ trách</option>
                <option value="user">Người cụ thể</option>
              </select>
            </F>
            {a.mode === "user" && <F label="Người nhận việc">{people}</F>}
          </>
        )}
        {a.type === "notify" && (
          <>
            <F label="Gửi tới">
              <select className="input" value={a.mode ?? "owner"} onChange={(e) => set({ mode: e.target.value })}>
                <option value="owner">Người phụ trách</option>
                <option value="all">Cả đội</option>
                <option value="user">Người cụ thể</option>
              </select>
            </F>
            {a.mode === "user" && <F label="Người nhận">{people}</F>}
            <F label="Nội dung thông báo" wide>
              <TextWithVars value={a.text ?? ""} onChange={(text) => set({ text })} />
            </F>
          </>
        )}
        {a.type === "assign_owner" && (
          <>
            <F label="Cách giao">
              <select className="input" value={a.mode ?? "round_robin"} onChange={(e) => set({ mode: e.target.value })}>
                <option value="round_robin">Xoay vòng trong đội</option>
                <option value="least_busy">Người ít việc nhất</option>
                <option value="user">Người cụ thể</option>
              </select>
            </F>
            {a.mode === "user" && <F label="Người phụ trách">{people}</F>}
            <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
              <input type="checkbox" checked={a.value === "only_empty"} onChange={(e) => set({ value: e.target.checked ? "only_empty" : undefined })} />
              Chỉ giao khi chưa có người phụ trách
            </label>
          </>
        )}
        {a.type === "set_status" && (
          <F label="Trạng thái mới">
            <select className="input" value={a.value ?? ""} onChange={(e) => set({ value: e.target.value })}>
              <option value="">Chọn</option>
              {obj?.statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </F>
        )}
        {a.type === "set_field" && (
          <>
            <F label="Trường">
              <select className="input" value={a.field ?? ""} onChange={(e) => set({ field: e.target.value, value: "" })}>
                <option value="">Chọn trường</option>
                {obj?.fields
                  .filter((f) => f.type !== "formula")
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </select>
            </F>
            <F label="Giá trị mới">
              <ValueInput field={`f:${a.field ?? ""}`} value={a.value ?? ""} objectKey={objectKey} config={config} team={team} onChange={(value) => set({ value })} />
            </F>
          </>
        )}
        {a.type === "send_message" && (
          <>
            <F label="Kênh">
              <select className="input" value={a.channel ?? "zalo"} onChange={(e) => set({ channel: e.target.value as Action["channel"] })}>
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </F>
            {a.channel === "email" && (
              <F label="Tiêu đề email">
                <input className="input" value={a.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} />
              </F>
            )}
            <F label="Nội dung tin" wide>
              <TextWithVars rows={3} value={a.text ?? ""} onChange={(text) => set({ text })} />
            </F>
            <p className="text-[12.5px] text-ink-2 sm:col-span-2">Gửi qua kênh đã kết nối trong Marketing. Chưa kết nối thì tin được bỏ qua và ghi vào lịch sử.</p>
          </>
        )}
        {a.type === "enroll_sequence" && (
          <F label="Kịch bản chăm sóc" wide>
            <select className="input" value={a.sequenceId ?? ""} onChange={(e) => set({ sequenceId: e.target.value })}>
              <option value="">{sequences.length ? "Chọn kịch bản" : "Chưa có kịch bản: tạo ở mục Marketing"}</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </F>
        )}
        {a.type === "webhook" && (
          <>
            <F label="URL nhận (http/https)" wide>
              <input className="input" type="url" placeholder="https://hooks.zapier.com/..." value={a.url ?? ""} onChange={(e) => set({ url: e.target.value })} />
            </F>
            <p className="text-[12.5px] text-ink-2 sm:col-span-2">Gửi POST JSON thông tin mục, chờ tối đa 5 giây. Không gọi được tới localhost hay IP nội bộ.</p>
          </>
        )}
        {a.type === "add_activity" && (
          <F label="Ghi chú" wide>
            <TextWithVars value={a.text ?? ""} onChange={(text) => set({ text })} />
          </F>
        )}
        {a.type === "create_record" && (
          <>
            <F label="Tạo trong bảng">
              <select className="input" value={a.object ?? "deals"} onChange={(e) => set({ object: e.target.value, value: "" })}>
                {config.objects.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </F>
            <F label="Trạng thái ban đầu">
              <select className="input" value={a.value ?? ""} onChange={(e) => set({ value: e.target.value })}>
                <option value="">Trạng thái đầu tiên</option>
                {getObject(config, a.object ?? "deals")?.statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </F>
            <F label="Tên mục mới" wide>
              <TextWithVars value={a.text ?? ""} onChange={(text) => set({ text })} placeholder="{title}" />
            </F>
          </>
        )}
      </div>
    </div>
  );
}
