"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { CHANNEL_COLOR, CHANNEL_LABEL, TRIGGER_LABEL, VARS, delayText, fillVars, type MsgChannel, type Step, type TriggerType, type VarValues } from "@/lib/marketing/shared";
import { Drawer } from "./Drawer";

type Stats = { active: number; total: number; done: number; sent: number; replied: number };
type Seq = { id: string; name: string; triggerType: string; objectKey: string; triggerValue: string; enabled: boolean; stopOnReply: boolean; steps: Step[]; stats: Stats };
type Draft = Omit<Seq, "id" | "stats" | "triggerType" | "objectKey"> & { id?: string; triggerType: TriggerType; objectKey: "contacts" | "deals" };
type Opt = { key: string; label: string };
type Tpl = { key: string; desc: string; name: string; triggerType: TriggerType; objectKey: "contacts" | "deals"; triggerValue: string; steps: Step[] };
type Props = {
  manage: boolean;
  sequences: Seq[];
  statuses: { contacts: Opt[]; deals: Opt[] };
  terms: { contacts: string; deals: string };
  sample: VarValues;
  records: { contacts: { id: string; title: string }[]; deals: { id: string; title: string }[] };
  aiOn: boolean;
  templates: Tpl[];
};

const CHANNELS: MsgChannel[] = ["zalo", "zns", "sms", "email"];
const TPL_ICON: Record<string, string> = { welcome: "person", not_closed: "gift", review: "spark", silent: "clock" };

export function SequencesTab(p: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [enrollFor, setEnrollFor] = useState<Seq | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const triggerText = (s: Pick<Seq, "triggerType" | "objectKey" | "triggerValue">) => {
    const t = s.triggerType as TriggerType;
    const obj = s.objectKey === "deals" ? p.terms.deals : p.terms.contacts;
    if (t === "record_created") return `Khi có ${obj.toLowerCase()} mới`;
    if (t === "status_changed") return `Khi ${obj.toLowerCase()} chuyển sang “${p.statuses[s.objectKey as "contacts" | "deals"]?.find((x) => x.key === s.triggerValue)?.label ?? (s.triggerValue || "bất kỳ")}”`;
    if (t === "inactive_days") return `Khi ${obj.toLowerCase()} im lặng ${s.triggerValue || 14} ngày`;
    return "Thêm khách bằng tay";
  };

  async function toggle(s: Seq) {
    const r = await fetch(`/api/marketing/sequences/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !s.enabled }) });
    if (!r.ok) setMsg({ ok: false, text: (await r.json()).error });
    router.refresh();
  }
  async function remove(s: Seq) {
    if (!confirm(`Xoá kịch bản “${s.name}”? Khách đang chạy sẽ dừng, nhật ký gửi vẫn giữ.`)) return;
    const r = await fetch(`/api/marketing/sequences/${s.id}`, { method: "DELETE" });
    if (!r.ok) setMsg({ ok: false, text: (await r.json()).error });
    router.refresh();
  }
  async function runNow() {
    setBusy(true);
    const r = await fetch("/api/marketing/tick", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: `Đã chạy các bước đến hạn${j.enrolled ? `, thêm ${j.enrolled} khách im lặng` : ""}. Xem tab Nhật ký gửi.` } : { ok: false, text: j.error });
    router.refresh();
  }

  const blank = (): Draft => ({ name: "", triggerType: "record_created", objectKey: "contacts", triggerValue: "", enabled: true, stopOnReply: true, steps: [{ delayHours: 0, channel: "zalo", body: "", condition: "any" }] });

  return (
    <div className="mt-5 grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] text-ink-2">Kịch bản gửi tin theo thời gian khi có sự kiện. Khách trả lời qua Hộp thư thì kịch bản tự dừng. Hệ thống kiểm tra mỗi phút.</p>
        {p.manage && (
          <>
            <button type="button" className="btn-outline" onClick={runNow} disabled={busy}>
              <Icon name="play" size={16} /> {busy ? "Đang chạy…" : "Chạy ngay"}
            </button>
            <button type="button" className="btn-primary" onClick={() => setDraft(blank())}>
              <Icon name="plus" size={16} /> Tạo kịch bản
            </button>
          </>
        )}
      </div>
      {msg && (
        <p className={`rounded px-3 py-2 text-[13px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`} role="status">
          {msg.text}
        </p>
      )}

      <section className="grid gap-3">
        {!p.sequences.length && (
          <div className="card grid place-items-center gap-2 px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-selected text-primary">
              <Icon name="bolt" />
            </span>
            <h2 className="text-[17px] font-semibold">Chưa có kịch bản chăm sóc</h2>
            <p className="max-w-lg text-[14px] text-ink-2">Bắt đầu nhanh bằng một mẫu bên dưới, sửa nội dung cho hợp giọng của bạn rồi bật lên.</p>
          </div>
        )}
        {p.sequences.map((s) => {
          const rate = s.stats.total ? Math.round((s.stats.replied / s.stats.total) * 100) : 0;
          return (
            <article key={s.id} className="card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.enabled}
                  aria-label={s.enabled ? "Tắt kịch bản" : "Bật kịch bản"}
                  disabled={!p.manage}
                  onClick={() => toggle(s)}
                  className={`mt-0.5 flex h-5 w-9 flex-none items-center rounded-full p-0.5 transition-colors ${s.enabled ? "bg-[#00c875]" : "bg-[var(--line)]"}`}
                >
                  <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${s.enabled ? "translate-x-4" : ""}`} />
                </button>
                <div className="min-w-0">
                  <h3 className="truncate text-[15.5px] font-semibold">{s.name}</h3>
                  <p className="truncate text-[13px] text-ink-2">
                    {triggerText(s)} · {s.steps.length} bước
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.steps.map((st, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHANNEL_COLOR[st.channel] }} />
                        {delayText(st.delayHours)} · {CHANNEL_LABEL[st.channel]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 md:justify-end">
                <dl className="flex gap-4 text-center text-[12px] text-ink-2">
                  <div>
                    <dd className="tnum text-[17px] font-semibold text-ink">{s.stats.active}</dd>
                    <dt>đang chạy</dt>
                  </div>
                  <div>
                    <dd className="tnum text-[17px] font-semibold text-ink">{s.stats.sent}</dd>
                    <dt>đã gửi</dt>
                  </div>
                  <div title="Số khách dừng vì đã trả lời / tổng số khách vào kịch bản">
                    <dd className="tnum text-[17px] font-semibold text-ink">{rate}%</dd>
                    <dt>phản hồi</dt>
                  </div>
                </dl>
                {p.manage && (
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost" onClick={() => setEnrollFor(s)} title="Thêm khách vào kịch bản">
                      <Icon name="plus" size={16} /> Khách
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setDraft({ ...s, triggerType: s.triggerType as TriggerType, objectKey: s.objectKey as "contacts" | "deals" })}>
                      <Icon name="edit" size={16} /> Sửa
                    </button>
                    <button type="button" className="btn-ghost h-8 w-8 justify-center p-0 text-ink-2" onClick={() => remove(s)} aria-label={`Xoá ${s.name}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section>
        <h2 className="text-[16px] font-semibold">Mẫu dựng sẵn</h2>
        <p className="text-[13.5px] text-ink-2">Bấm để mở trong trình tạo, sửa xong mới lưu.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {p.templates.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!p.manage}
              onClick={() => setDraft({ name: t.name, triggerType: t.triggerType, objectKey: t.objectKey, triggerValue: t.triggerValue, enabled: true, stopOnReply: true, steps: t.steps.map((x) => ({ ...x })) })}
              className="card flex min-w-0 flex-col gap-2 p-4 text-left hover:shadow-md disabled:opacity-60"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-selected text-primary">
                <Icon name={TPL_ICON[t.key] ?? "bolt"} size={18} />
              </span>
              <b className="text-[14.5px]">{t.name}</b>
              <span className="text-[13px] text-ink-2">{t.desc}</span>
              <span className="mt-auto text-[12px] text-ink-2">{t.steps.map((s) => `${delayText(s.delayHours)} → ${CHANNEL_LABEL[s.channel]}`).join(" · ")}</span>
            </button>
          ))}
        </div>
      </section>

      {draft && (
        <Editor
          draft={draft}
          {...p}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            setMsg({ ok: true, text: "Đã lưu kịch bản." });
            router.refresh();
          }}
        />
      )}
      {enrollFor && <EnrollDrawer seq={enrollFor} records={enrollFor.objectKey === "deals" ? p.records.deals : p.records.contacts} term={enrollFor.objectKey === "deals" ? p.terms.deals : p.terms.contacts} onClose={() => setEnrollFor(null)} />}
    </div>
  );
}

// ---------------- Trình tạo kịch bản ----------------

function Editor({ draft, statuses, terms, sample, aiOn, onClose, onSaved }: Props & { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState<number | null>(null);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const patch = (x: Partial<Draft>) => setD((s) => ({ ...s, ...x }));
  const patchStep = (i: number, x: Partial<Step>) => setD((s) => ({ ...s, steps: s.steps.map((st, j) => (j === i ? { ...st, ...x } : st)) }));
  const objOpts: ["contacts" | "deals", string][] = [
    ["contacts", terms.contacts],
    ["deals", terms.deals],
  ];

  function insertVar(i: number, v: string) {
    const el = refs.current[i];
    const body = d.steps[i].body;
    const at = el?.selectionStart ?? body.length;
    patchStep(i, { body: body.slice(0, at) + v + body.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + v.length, at + v.length);
    });
  }
  async function aiWrite(i: number) {
    setWriting(i);
    const r = await fetch("/api/marketing/sequences/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: d.steps[i].channel, purpose: `${d.name || "Chăm sóc khách"} (${TRIGGER_LABEL[d.triggerType]})`, stepIndex: i }) });
    const j = await r.json();
    setWriting(null);
    if (r.ok) patchStep(i, { body: j.body, ...(d.steps[i].channel === "email" && j.subject ? { subject: j.subject } : {}) });
    else setErr(j.error);
  }
  async function save() {
    setBusy(true);
    setErr("");
    const body = { ...d, triggerValue: d.triggerType === "record_created" || d.triggerType === "manual" ? "" : d.triggerValue };
    const r = await fetch(d.id ? `/api/marketing/sequences/${d.id}` : "/api/marketing/sequences", { method: d.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    onSaved();
  }
  const move = (i: number, dir: -1 | 1) =>
    setD((s) => {
      const st = [...s.steps];
      const j = i + dir;
      if (j < 0 || j >= st.length) return s;
      [st[i], st[j]] = [st[j], st[i]];
      return { ...s, steps: st };
    });

  let total = 0;
  return (
    <Drawer
      title={d.id ? "Sửa kịch bản" : "Tạo kịch bản"}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu kịch bản"}
          </button>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" checked={d.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /> Bật ngay
          </label>
          {err && <span className="text-[13px] text-danger">{err}</span>}
        </>
      }
    >
      <label className="grid gap-1">
        <span className="label">Tên kịch bản</span>
        <input className="input" value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ví dụ: Chào lead mới" />
      </label>

      <div className="rounded-lg border border-line p-4">
        <span className="label">Sự kiện bắt đầu</span>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <select className="input" value={d.triggerType} onChange={(e) => patch({ triggerType: e.target.value as TriggerType, triggerValue: e.target.value === "inactive_days" ? "14" : "", objectKey: e.target.value === "status_changed" ? d.objectKey : "contacts" })} aria-label="Sự kiện">
            {(Object.keys(TRIGGER_LABEL) as TriggerType[]).map((k) => (
              <option key={k} value={k}>
                {TRIGGER_LABEL[k]}
              </option>
            ))}
          </select>
          {(d.triggerType === "status_changed" || d.triggerType === "manual") && (
            <select className="input" value={d.objectKey} onChange={(e) => patch({ objectKey: e.target.value as "contacts" | "deals", triggerValue: "" })} aria-label="Bảng">
              {objOpts.map(([k, l]) => (
                <option key={k} value={k}>
                  Bảng {l}
                </option>
              ))}
            </select>
          )}
          {d.triggerType === "status_changed" && (
            <select className="input sm:col-span-2" value={d.triggerValue} onChange={(e) => patch({ triggerValue: e.target.value })} aria-label="Trạng thái">
              <option value="">Bất kỳ trạng thái nào</option>
              {statuses[d.objectKey].map((s) => (
                <option key={s.key} value={s.key}>
                  Chuyển sang “{s.label}”
                </option>
              ))}
            </select>
          )}
          {d.triggerType === "inactive_days" && (
            <label className="flex items-center gap-2 text-[13.5px]">
              Không có hoạt động
              <input className="input w-20 tnum" inputMode="numeric" value={d.triggerValue} onChange={(e) => patch({ triggerValue: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
              ngày
            </label>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={d.stopOnReply} onChange={(e) => patch({ stopOnReply: e.target.checked })} /> Dừng kịch bản khi khách trả lời
        </label>
      </div>

      <ol className="relative grid gap-0">
        {d.steps.map((st, i) => {
          total += st.delayHours;
          const unitDays = st.delayHours % 24 === 0 && st.delayHours > 0;
          const preview = fillVars(st.body, sample);
          return (
            <li key={i} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-5">
              <span className="absolute bottom-0 left-[13px] top-7 w-0.5 bg-[var(--line-soft)]" aria-hidden="true" />
              <span className="z-10 grid h-7 w-7 place-items-center rounded-full text-[12.5px] font-semibold text-white" style={{ background: CHANNEL_COLOR[st.channel] }}>
                {i + 1}
              </span>
              <div className="card grid min-w-0 gap-3 p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <span className="text-ink-2">{i === 0 ? "Sau khi bắt đầu, chờ" : "Sau bước trước, chờ"}</span>
                  <input
                    className="input h-8 w-16 tnum"
                    inputMode="numeric"
                    value={unitDays ? st.delayHours / 24 : st.delayHours}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, "")) || 0;
                      patchStep(i, { delayHours: unitDays ? n * 24 : n });
                    }}
                    aria-label="Thời gian chờ"
                  />
                  <select className="input h-8 w-20" value={unitDays ? "d" : "h"} onChange={(e) => patchStep(i, { delayHours: e.target.value === "d" ? Math.max(1, Math.round(st.delayHours / 24) || 1) * 24 : st.delayHours / 24 || 1 })} aria-label="Đơn vị">
                    <option value="h">giờ</option>
                    <option value="d">ngày</option>
                  </select>
                  <span className="text-ink-2">→ gửi qua</span>
                  <select className="input h-8 w-[120px]" value={st.channel} onChange={(e) => patchStep(i, { channel: e.target.value as MsgChannel })} aria-label="Kênh">
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <span className="flex-1" />
                  <span className="text-[12px] text-ink-2">{total ? `≈ ${total >= 24 ? `${Math.round((total / 24) * 10) / 10} ngày` : `${total} giờ`} từ lúc bắt đầu` : "ngay khi bắt đầu"}</span>
                  <div className="flex">
                    <button type="button" className="btn-ghost h-7 w-7 justify-center p-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên">
                      ↑
                    </button>
                    <button type="button" className="btn-ghost h-7 w-7 justify-center p-0" onClick={() => move(i, 1)} disabled={i === d.steps.length - 1} aria-label="Xuống">
                      ↓
                    </button>
                    <button type="button" className="btn-ghost h-7 w-7 justify-center p-0 text-ink-2" onClick={() => setD((s) => ({ ...s, steps: s.steps.filter((_, j) => j !== i) }))} disabled={d.steps.length === 1} aria-label="Xoá bước">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
                {st.channel === "email" && <input className="input" value={st.subject ?? ""} onChange={(e) => patchStep(i, { subject: e.target.value })} placeholder="Tiêu đề email" aria-label="Tiêu đề email" />}
                {st.channel === "zns" && <input className="input font-mono text-[13px]" value={st.templateId ?? ""} onChange={(e) => patchStep(i, { templateId: e.target.value })} placeholder="Template ID ZNS (để trống = dùng mẫu mặc định)" aria-label="Template ID" />}
                <textarea
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  className="textarea min-h-[84px]"
                  value={st.body}
                  onChange={(e) => patchStep(i, { body: e.target.value })}
                  placeholder={st.channel === "zns" ? "Mô tả nội dung (ZNS gửi theo template đã duyệt, biến truyền vào tham số cùng tên)" : "Nội dung tin…"}
                  aria-label={`Nội dung bước ${i + 1}`}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {VARS.map(([v, label]) => (
                    <button key={v} type="button" className="rounded border border-line px-1.5 py-0.5 text-[12px] text-ink-2 hover:bg-hover" onClick={() => insertVar(i, v)} title={label}>
                      {v}
                    </button>
                  ))}
                  <span className="flex-1" />
                  <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => aiWrite(i)} disabled={writing !== null}>
                    <Icon name="spark" size={15} /> {writing === i ? "Đang viết…" : aiOn ? "AI viết nội dung" : "Gợi ý nội dung"}
                  </button>
                </div>
                {st.channel === "sms" && <span className="text-[12px] text-ink-2">{preview.length} ký tự{/[^\x00-\x7F]/.test(preview) ? " · có dấu: nhà mạng tính 70 ký tự/tin" : " · 160 ký tự/tin"}</span>}
                {i > 0 && (
                  <label className="flex items-center gap-2 text-[13px] text-ink-2">
                    <input type="checkbox" checked={st.condition === "no_reply"} onChange={(e) => patchStep(i, { condition: e.target.checked ? "no_reply" : "any" })} /> Chỉ gửi nếu khách chưa trả lời
                  </label>
                )}
                {preview.trim() && (
                  <div className="rounded-lg bg-surface-2 p-3">
                    <span className="text-[11.5px] text-ink-2">Xem trước với khách mẫu “{sample.ten}”</span>
                    <p className="mt-1 whitespace-pre-line text-[13.5px]">{st.channel === "email" && st.subject ? <b className="block">{fillVars(st.subject, sample)}</b> : null}{preview}</p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
          <span className="z-10 grid h-7 w-7 place-items-center rounded-full border-2 border-dashed border-line text-ink-2">
            <Icon name="plus" size={14} />
          </span>
          <button type="button" className="btn-outline w-fit" onClick={() => setD((s) => ({ ...s, steps: [...s.steps, { delayHours: 24, channel: "zalo", body: "", condition: "no_reply" }] }))} disabled={d.steps.length >= 20}>
            Thêm bước
          </button>
        </li>
      </ol>
    </Drawer>
  );
}

// ---------------- Thêm khách bằng tay ----------------

function EnrollDrawer({ seq, records, term, onClose }: { seq: Seq; records: { id: string; title: string }[]; term: string; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = records.filter((r) => r.title.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  async function add(r: { id: string; title: string }) {
    const res = await fetch(`/api/marketing/sequences/${seq.id}/enroll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId: r.id }) });
    const j = await res.json();
    setMsg(res.ok ? { ok: true, text: `Đã thêm ${r.title} vào kịch bản.` } : { ok: false, text: j.error });
    router.refresh();
  }
  return (
    <Drawer title={`Thêm ${term.toLowerCase()} vào “${seq.name}”`} onClose={onClose}>
      {!seq.enabled && <p className="rounded bg-warning-soft px-3 py-2 text-[13px] text-warning">Kịch bản đang tắt: khách được thêm nhưng chỉ nhận tin khi bạn bật lại.</p>}
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Tìm ${term.toLowerCase()}…`} autoFocus />
      {msg && <p className={`text-[13px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      <ul className="divide-y divide-[var(--line-soft)] rounded border border-line-soft">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-[14px]">
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <button type="button" className="btn-outline h-7" onClick={() => add(r)}>
              Thêm
            </button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-6 text-center text-ink-2">Không tìm thấy.</li>}
      </ul>
    </Drawer>
  );
}
