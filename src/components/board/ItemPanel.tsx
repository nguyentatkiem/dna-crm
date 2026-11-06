"use client";

import { useCallback, useEffect, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import type { FieldValue, RecordDTO } from "@/lib/records";
import { ago, dateVi, heat } from "@/lib/format";
import { color } from "@/lib/colors";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { InputCell, LabelCell, PersonCell } from "./cells";
import { RecordDocs } from "./RecordDocs";
import { RecordForm } from "./RecordForm";
import type { FormLayout } from "@/lib/form-layout";
import { RecordHistory } from "./RecordHistory";
import { RecordLoyalty } from "../care/RecordLoyalty";
import { Customer360 } from "../c360/Customer360";
import { VoucherList } from "../voucher/VoucherList";
import { SendSurveyButton } from "../survey/SendSurveyButton";
import { RecordSales } from "../sales/RecordSales";
import { MentionTextarea, WithMentions } from "./Mentions";
import { WinProb } from "./TableView";
import { toast } from "@/components/ui/Toast";

type Activity = { id: string; kind: string; body: string; author: string; createdAt: string };
type Task = { id: string; title: string; dueAt: string | null; done: boolean; source: string };
type Patch = Partial<Pick<RecordDTO, "title" | "status" | "ownerName" | "amount">> & { data?: Record<string, FieldValue> };

export function ItemPanel({ obj, team, record, onClose, onPatch, onDelete, canDelete = true, readOnly, formLayout }: { obj: ObjectDef; team: string[]; record: RecordDTO; onClose: () => void; onPatch: (b: Patch) => void; onDelete: () => void; canDelete?: boolean; readOnly?: string[]; formLayout?: FormLayout | null }) {
  const [tab, setTab] = useState<"updates" | "info" | "tasks" | "docs" | "history" | "loyalty" | "c360" | "voucher">("updates");
  const [docCount, setDocCount] = useState<number | null>(null);
  const [acts, setActs] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState("");
  const [coach, setCoach] = useState<{ next: string; draft: string; source: string } | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [zaloMsg, setZaloMsg] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [notified, setNotified] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/records/${record.id}/activities`);
    if (res.ok) {
      const d = await res.json();
      setActs(d.activities);
      setTasks(d.tasks);
    }
  }, [record.id]);

  useEffect(() => {
    load();
    setCoach(null);
    setConfirmDel(false);
  }, [load, record.updatedAt]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function post(body: string) {
    if (!body.trim()) return;
    const res = await fetch(`/api/records/${record.id}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      setText("");
      setNotified(j.mentioned?.length ? `Đã báo cho ${j.mentioned.join(", ")}` : "");
      load();
    }
  }

  async function askCoach() {
    setCoaching(true);
    const res = await fetch(`/api/records/${record.id}/coach`, { method: "POST" });
    setCoaching(false);
    if (res.ok) setCoach(await res.json());
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    const due = new Date(Date.now() + 864e5).toISOString();
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: taskTitle, recordId: record.id, dueAt: due }) });
    if (res.ok) {
      setTaskTitle("");
      load();
    }
  }

  async function toggleTask(t: Task) {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
    const r = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !t.done }) }).catch(() => null);
    if (!r?.ok) {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
      toast((await r?.json().catch(() => ({})))?.error ?? "Không cập nhật được việc", "error");
    }
  }

  const h = obj.key === "contacts" ? heat(record.score) : null;

  return (
    <>
      <div className="anim-fade fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-label={record.title} className="anim-slide-right fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col bg-surface shadow-panel">
        <div className="flex items-start gap-3 border-b border-line-soft px-4 pb-0 pt-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="-ml-2.5 h-10 font-title font-semibold [&_button]:text-[22px] [&_input]:text-[22px]">
              <InputCell field={{ type: "text", label: obj.itemLabel }} value={record.title} onSave={(v) => onPatch({ title: String(v) })} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
              <div className="h-8 w-40 overflow-hidden rounded">
                <LabelCell options={obj.statuses} value={record.status} onPick={(k) => onPatch({ status: k })} />
              </div>
              <div className="h-8 w-10">
                <PersonCell team={team} value={record.ownerName} onPick={(v) => onPatch({ ownerName: v })} />
              </div>
              {h && (
                <span className="rounded-full px-2 py-0.5 text-[12.5px] text-white" style={{ background: color(h.color).bg }}>
                  {h.label} · {record.score}/100
                </span>
              )}
              <span suppressHydrationWarning>Tạo {ago(record.createdAt)}</span>
              {obj.key === "contacts" && (
                <a href={`/w/telesales?record=${record.id}`} className="btn-outline h-7 gap-1.5 text-[13px]">
                  <Icon name="phone" size={14} /> Gọi & ghi nhận
                </a>
              )}
            </div>
            {/* Bảng Khách có 8 tab: điện thoại thì vuốt ngang, màn rộng thì xuống dòng để không tab nào bị khuất (Voucher). */}
            <div className="mt-3 flex gap-x-1 overflow-x-auto sm:flex-wrap sm:overflow-visible">
              {(
                [
                  ...(obj.key === "contacts" ? ([["c360", "360°"]] as const) : []),
                  ["updates", "Cập nhật"],
                  ["info", "Thông tin"],
                  ["tasks", `Việc (${tasks.filter((t) => !t.done).length})`],
                  ["docs", docCount === null ? "Tài liệu" : `Tài liệu (${docCount})`],
                  ["history", "Lịch sử"],
                  ...(obj.key === "contacts" ? ([["loyalty", "Điểm thưởng"], ["voucher", "Voucher"]] as const) : []),
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px h-9 flex-none border-b-2 px-3 text-[14px] ${tab === k ? "border-primary" : "border-transparent text-ink-2 hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-2 px-4 py-5 sm:px-6">
          {tab === "updates" && (
            <div className="grid gap-4">
              <div className="rounded-lg border border-[#d9c5f0] bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <Icon name="spark" size={16} className="text-[#a25ddc]" /> Sales Coach
                  </span>
                  <button type="button" className="btn-outline h-7 text-[13px]" onClick={askCoach} disabled={coaching}>
                    {coaching ? "Đang nghĩ..." : coach ? "Gợi ý lại" : "Gợi ý bước tiếp theo"}
                  </button>
                </div>
                {coach && (
                  <div className="mt-3 grid gap-2.5 text-[14px]">
                    <p>
                      <b>Bước tiếp theo:</b> {coach.next}
                    </p>
                    <p className="whitespace-pre-line rounded bg-surface-2 px-3 py-2.5">{coach.draft}</p>
                    {zaloMsg && <p className="text-[13px] text-ink-2">{zaloMsg}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-primary h-7 text-[13px]" onClick={() => navigator.clipboard?.writeText(coach.draft).catch(() => undefined)}>
                        Sao chép tin nhắn
                      </button>
                      {record.data._zalo_uid && (
                        <button
                          type="button"
                          className="btn-outline h-7 text-[13px]"
                          onClick={async () => {
                            const r = await fetch(`/api/records/${record.id}/zalo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: coach.draft }) });
                            const j = await r.json();
                            setZaloMsg(r.ok ? "Đã gửi qua Zalo OA." : j.error);
                          }}
                        >
                          Gửi qua Zalo OA
                        </button>
                      )}
                      <button type="button" className="btn-outline h-7 text-[13px]" onClick={() => post(`Sales Coach gợi ý: ${coach.next}`)}>
                        Lưu thành cập nhật
                      </button>
                      <span className="self-center text-[12px] text-ink-2">{coach.source === "ai" ? "Do Claude soạn" : "Theo luật mẫu (chưa bật AI)"}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-line bg-surface">
                <MentionTextarea id="update-text" value={text} onChange={setText} team={team} placeholder="Viết cập nhật... Gõ @ để nhắc đồng đội" onSubmit={() => post(text)} />
                <div className="flex items-center justify-between gap-2 border-t border-line-soft px-3 py-2">
                  <span role="status" className={`text-[12px] ${notified ? "text-[#00a35f]" : "text-ink-2 max-sm:hidden"}`}>{notified || "@ nhắc tên · Ctrl+Enter để gửi"}</span>
                  <button type="button" className="btn-primary h-8" disabled={!text.trim()} onClick={() => post(text)}>
                    Cập nhật
                  </button>
                </div>
              </div>

              {acts.map((a) => (
                <article key={a.id} className={`rounded-lg bg-surface p-4 ${a.kind === "update" ? "border border-line-soft" : ""}`}>
                  <header className="flex items-center gap-2.5">
                    {a.kind === "update" ? <Avatar name={a.author} size={30} /> : <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-surface-2 text-ink-2"><Icon name={a.kind === "ai" ? "spark" : "bolt"} size={15} /></span>}
                    <b className="text-[14px]">{a.author}</b>
                    <span className="ml-auto text-[12px] text-ink-2">{ago(a.createdAt)}</span>
                  </header>
                  <p className={`mt-2 whitespace-pre-line text-[14px] ${a.kind === "update" ? "" : "text-ink-2"}`}>
                    <WithMentions text={a.body.replace(/\s*\[đợt:[^\]]+\]/, "")} team={team} />
                  </p>
                </article>
              ))}
            </div>
          )}

          {tab === "info" && (
            <dl className="grid gap-3 rounded-lg bg-surface p-5">
              <RecordForm obj={obj} record={record} onPatch={onPatch} readOnly={readOnly} layout={formLayout} />
              {obj.amountLabel && (
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <dt className="text-[13.5px] text-ink-2">{obj.amountLabel}</dt>
                  <dd className="h-9">
                    <InputCell field={{ type: "money", label: obj.amountLabel }} value={record.amount} onSave={(v) => onPatch({ amount: Number(v) })} form align="left" />
                  </dd>
                </div>
              )}
              {obj.amountLabel && record.winProb !== null && (
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <dt className="text-[13.5px] text-ink-2">Khả năng chốt</dt>
                  <dd className="h-9">
                    <WinProb value={record.winProb} />
                  </dd>
                </div>
              )}
              {canDelete && <div className="mt-4 border-t border-line-soft pt-4">
                {confirmDel ? (
                  <div className="flex flex-wrap items-center gap-2 text-[14px]">
                    <span>Chuyển mục này vào thùng rác? Khôi phục được trong 30 ngày.</span>
                    <button type="button" className="btn h-8 bg-[#df2f4a] text-white hover:brightness-95" onClick={onDelete}>
                      Xoá
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setConfirmDel(false)}>
                      Huỷ
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-ghost text-[#df2f4a]" onClick={() => setConfirmDel(true)}>
                    <Icon name="trash" size={16} /> Xoá mục
                  </button>
                )}
              </div>}
            </dl>
          )}
          {tab === "info" && <RecordSales recordId={record.id} objectKey={record.objectKey} />}

          {tab === "history" && <RecordHistory obj={obj} recordId={record.id} version={record.updatedAt} />}

          {tab === "loyalty" && <RecordLoyalty recordId={record.id} />}
          {tab === "c360" && obj.key === "contacts" && (
            <div className="grid gap-3">
              <div className="flex justify-end">
                <SendSurveyButton recordId={record.id} />
              </div>
              <Customer360 recordId={record.id} />
            </div>
          )}
          {tab === "voucher" && obj.key === "contacts" && <VoucherList recordId={record.id} />}

          {tab === "docs" && <RecordDocs recordId={record.id} onCount={setDocCount} />}

          {tab === "tasks" && (
            <div className="grid gap-3">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addTask(); }}>
                <input id="task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Việc cần làm, ví dụ: Gọi lại báo giá" className="input" />
                <button className="btn-primary h-9" disabled={!taskTitle.trim()}>
                  Thêm việc
                </button>
              </form>
              {tasks.length === 0 && <p className="py-6 text-center text-ink-2">Chưa có việc nào cho mục này.</p>}
              {tasks.map((t) => (
                <label key={t.id} className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3">
                  <input id={`t-${t.id}`} type="checkbox" checked={t.done} onChange={() => toggleTask(t)} className="h-4 w-4 accent-[#00c875]" />
                  <span className={`flex-1 ${t.done ? "text-ink-2 line-through" : ""}`}>{t.title}</span>
                  <span className="text-[12px] text-ink-2">{t.source}</span>
                  {t.dueAt && <span className="text-[12.5px] text-ink-2 tnum">{dateVi(t.dueAt)}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
