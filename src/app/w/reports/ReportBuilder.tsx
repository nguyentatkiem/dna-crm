"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui/Toast";
import { ago } from "@/lib/format";
import {
  BUCKETS,
  BUCKET_LABEL,
  CHARTS,
  CHART_LABEL,
  FILTER_OP_LABEL,
  METRIC_LABEL,
  RANGE_LABEL,
  RANGE_PRESETS,
  WEEKDAY_LABEL,
  EMAIL_RE,
  defaultDateField,
  fmtCell,
  type FieldMeta,
  type FilterOp,
  type MetricOp,
  type ReportConfig,
  type ReportResult,
  type Schedule,
} from "@/lib/reports/shared";
import type { BuilderMeta } from "./meta";

const ReportChart = dynamic(() => import("./ReportChart").then((m) => m.ReportChart), { ssr: false, loading: () => <div className="h-full animate-pulse rounded bg-surface-2" /> });

type Initial = { id: string | null; name: string; config: ReportConfig; broken?: boolean; schedule: Schedule; recipients: string[]; shared: boolean; canEdit: boolean; lastSentAt: string | null; owner: string };

const NUMERIC = new Set(["number", "money", "duration"]);
const opsFor = (f: FieldMeta | undefined): FilterOp[] =>
  !f ? [] : f.type === "bool" ? ["eq"] : f.type === "date" ? ["gte", "lte", "empty", "not_empty"] : NUMERIC.has(f.type) ? ["eq", "neq", "gt", "gte", "lt", "lte", "empty", "not_empty"] : f.type === "enum" ? ["eq", "neq", "in", "empty", "not_empty"] : ["eq", "neq", "contains", "empty", "not_empty"];

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function ReportBuilder({ meta, initial, me, mailOk, canExport }: { meta: BuilderMeta; initial: Initial; me: { name: string; email: string }; mailOk: boolean; canExport: boolean }) {
  const router = useRouter();
  const [id, setId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [c, setC] = useState<ReportConfig>(initial.config);
  const [schedule, setSchedule] = useState<Schedule>(initial.schedule);
  const [recipients, setRecipients] = useState(initial.recipients.join(", "));
  const [shared, setShared] = useState(initial.shared);
  const [dirty, setDirty] = useState(!initial.id);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [panel, setPanel] = useState<"config" | "schedule">("config");
  const edit = initial.canEdit;
  const seq = useRef(0);

  const ds = meta.datasets.find((d) => d.key === c.dataset) ?? meta.datasets[0];
  const fields = ds.fields;
  const fieldOf = (k?: string) => fields.find((f) => f.key === k);
  const dateFields = fields.filter((f) => f.type === "date");
  const groupable = fields.filter((f) => !NUMERIC.has(f.type));
  const numeric = fields.filter((f) => NUMERIC.has(f.type));
  const bools = fields.filter((f) => f.type === "bool");

  const update = (patch: Partial<ReportConfig>) => {
    setC((x) => ({ ...x, ...patch }));
    setDirty(true);
  };

  // Xem trước: chạy lại sau 400ms khi đổi cấu hình; bỏ kết quả của lần chạy cũ (stale guard).
  const key = JSON.stringify(c);
  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const body = edit && (dirty || !id) ? { config: c } : { id };
      const res = await fetch("/api/reports/run", { method: "POST", ...json(body) }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (my !== seq.current) return;
      setLoading(false);
      if (!res?.ok) {
        setErr(d.error ?? "Không chạy được báo cáo");
        return;
      }
      setErr("");
      setResult(d.result);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function changeDataset(k: ReportConfig["dataset"]) {
    update({ dataset: k, dateField: defaultDateField(k), filters: [], groupBy: null, metrics: [{ op: "count" }], columns: [], sort: undefined });
  }

  const recipientList = recipients
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const badEmail = recipientList.find((e) => !EMAIL_RE.test(e));

  async function save(asNew = false) {
    if (badEmail) return toast(`Email không hợp lệ: ${badEmail}`, "error");
    setBusy("save");
    const body = { name: name.trim() || "Báo cáo", config: c, schedule, recipients: recipientList, shared };
    const res = asNew || !id ? await fetch("/api/reports", { method: "POST", ...json(body) }) : await fetch(`/api/reports/${id}`, { method: "PATCH", ...json(body) });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return toast(d.error ?? "Không lưu được", "error");
    setDirty(false);
    toast("Đã lưu báo cáo");
    if (!id || asNew) {
      setId(d.id);
      router.replace(`/w/reports/${d.id}`);
    }
  }
  async function duplicate() {
    if (!id) return save(true);
    setBusy("dup");
    const res = await fetch("/api/reports", { method: "POST", ...json({ duplicateOf: id }) });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return toast(d.error ?? "Không nhân bản được", "error");
    toast(`Đã tạo “${d.name}”`);
    router.push(`/w/reports/${d.id}`);
  }
  async function toggleShare() {
    const next = !shared;
    setShared(next);
    if (!id) return setDirty(true);
    const res = await fetch(`/api/reports/${id}`, { method: "PATCH", ...json({ shared: next }) });
    if (!res.ok) {
      setShared(!next);
      return toast("Không đổi được chia sẻ", "error");
    }
    toast(next ? "Đã chia sẻ cho cả workspace" : "Đã thôi chia sẻ");
  }
  async function sendNow() {
    if (!id || dirty) return toast("Hãy lưu báo cáo trước khi gửi thử", "error");
    setBusy("send");
    const res = await fetch(`/api/reports/${id}/send`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return toast(d.error ?? "Không gửi được", "error");
    toast(d.dryRun ? `Chế độ thử (MESSAGING_DRY_RUN): đã ghi nhật ký, chưa gửi thật tới ${d.to.join(", ")}` : `Đã gửi tới ${d.to.join(", ")}`);
  }
  async function remove() {
    if (!id || !confirm(`Xoá báo cáo “${name}”? Không hoàn tác được.`)) return;
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Không xoá được", "error");
    router.push("/w/reports");
  }
  async function exportFile(format: "xlsx" | "csv") {
    setBusy(format);
    try {
      const res = id && !dirty ? await fetch(`/api/reports/export?id=${encodeURIComponent(id)}&format=${format}`) : await fetch("/api/reports/export", { method: "POST", ...json({ name, config: c, format }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không xuất được");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name || "bao-cao"}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không xuất được", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="canvas px-4 pb-16 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/w/reports" className="btn-ghost h-8 px-2" aria-label="Về danh sách báo cáo">
          <Icon name="chevron" size={16} className="rotate-90" />
        </Link>
        {edit ? (
          <input className="input h-9 min-w-0 flex-1 text-[18px] font-semibold sm:max-w-md" value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} aria-label="Tên báo cáo" maxLength={120} />
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-[20px] font-semibold">{name}</h1>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {!edit && <span className="badge">Chỉ xem · của {initial.owner || "thành viên khác"}</span>}
          {canExport && (
            <>
              <button className="btn-outline" onClick={() => exportFile("xlsx")} disabled={!!busy}>
                <Icon name="download" size={15} /> Excel
              </button>
              <button className="btn-ghost" onClick={() => exportFile("csv")} disabled={!!busy}>
                CSV
              </button>
            </>
          )}
          {edit && (
            <>
              <button className={shared ? "btn-outline border-primary text-primary" : "btn-outline"} onClick={toggleShare} aria-pressed={shared} title="Chia sẻ cho mọi thành viên (mỗi người thấy số liệu trong phạm vi của mình)">
                <Icon name="users" size={15} /> {shared ? "Đã chia sẻ" : "Chia sẻ"}
              </button>
              <button className="btn-ghost" onClick={duplicate} disabled={!!busy} title="Nhân bản">
                <Icon name="copy" size={15} />
                <span className="hidden sm:inline">Nhân bản</span>
              </button>
              {id && (
                <button className="btn-ghost text-danger" onClick={remove} title="Xoá" aria-label="Xoá báo cáo">
                  <Icon name="trash" size={15} />
                </button>
              )}
              <button className="btn-primary" onClick={() => save()} disabled={!!busy || (!dirty && !!id)}>
                {busy === "save" ? "Đang lưu…" : dirty || !id ? "Lưu" : "Đã lưu"}
              </button>
            </>
          )}
        </div>
      </div>
      {initial.broken && <p className="mt-2 rounded bg-warning-soft px-3 py-2 text-[13px] text-warning">Cấu hình cũ không còn hợp lệ (bảng hoặc trường đã đổi). Đã mở cấu hình mặc định — hãy chỉnh lại rồi lưu.</p>}

      <div className={`mt-4 grid gap-4 ${edit ? "lg:grid-cols-[340px_minmax(0,1fr)]" : ""}`}>
        {edit && (
          <aside className="card h-fit p-3">
            <div className="segmented mb-3 w-full" role="tablist">
              <button role="tab" aria-selected={panel === "config"} className="flex-1 justify-center" onClick={() => setPanel("config")}>
                Cấu hình
              </button>
              <button role="tab" aria-selected={panel === "schedule"} className="flex-1 justify-center" onClick={() => setPanel("schedule")}>
                <Icon name="mail" size={13} /> Lịch gửi
              </button>
            </div>

            {panel === "config" ? (
              <div className="space-y-4">
                <Field label="Nguồn dữ liệu">
                  <select className="input" value={c.dataset} onChange={(e) => changeDataset(e.target.value as ReportConfig["dataset"])}>
                    {meta.datasets.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Thời gian">
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input" value={c.dateField} onChange={(e) => update({ dateField: e.target.value })} aria-label="Trường ngày">
                      {dateFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select className="input" value={c.range.preset} onChange={(e) => update({ range: { ...c.range, preset: e.target.value as ReportConfig["range"]["preset"] } })} aria-label="Khoảng thời gian">
                      {RANGE_PRESETS.map((p) => (
                        <option key={p} value={p}>
                          {RANGE_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {c.range.preset === "custom" && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input type="date" className="input" value={c.range.from ?? ""} onChange={(e) => update({ range: { ...c.range, from: e.target.value || undefined } })} aria-label="Từ ngày" />
                      <input type="date" className="input" value={c.range.to ?? ""} onChange={(e) => update({ range: { ...c.range, to: e.target.value || undefined } })} aria-label="Đến ngày" />
                    </div>
                  )}
                </Field>

                <Field label="Bộ lọc">
                  <div className="space-y-2">
                    {c.filters.map((flt, i) => {
                      const f = fieldOf(flt.field);
                      const ops = opsFor(f);
                      const set = (p: Partial<typeof flt>) => update({ filters: c.filters.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                      const needsValue = flt.op !== "empty" && flt.op !== "not_empty";
                      return (
                        <div key={i} className="rounded border border-line-soft p-2">
                          <div className="flex gap-1.5">
                            <select
                              className="input h-8 min-w-0 flex-1 px-2 text-[13px]"
                              value={flt.field}
                              onChange={(e) => {
                                const nf = fieldOf(e.target.value);
                                set({ field: e.target.value, op: opsFor(nf)[0], value: nf?.type === "bool" ? true : "" });
                              }}
                              aria-label="Trường lọc"
                            >
                              {fields.map((x) => (
                                <option key={x.key} value={x.key}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                            <select className="input h-8 w-[92px] px-2 text-[13px]" value={flt.op} onChange={(e) => set({ op: e.target.value as FilterOp })} aria-label="Phép so sánh">
                              {ops.map((o) => (
                                <option key={o} value={o}>
                                  {FILTER_OP_LABEL[o]}
                                </option>
                              ))}
                            </select>
                            <button className="btn-ghost h-8 px-1.5" onClick={() => update({ filters: c.filters.filter((_, j) => j !== i) })} aria-label="Bỏ bộ lọc">
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                          {needsValue && f && (
                            <div className="mt-1.5">
                              <FilterValue f={f} op={flt.op} value={flt.value} onChange={(value) => set({ value })} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button className="btn-ghost h-7 px-2 text-[13px] text-primary" disabled={c.filters.length >= 12} onClick={() => update({ filters: [...c.filters, { field: fields[0].key, op: opsFor(fields[0])[0], value: "" }] })}>
                      <Icon name="plus" size={14} /> Thêm bộ lọc
                    </button>
                  </div>
                </Field>

                <Field label="Nhóm theo">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <select
                      className="input"
                      value={c.groupBy?.field ?? ""}
                      onChange={(e) => {
                        const f = fieldOf(e.target.value);
                        update({ groupBy: f ? { field: f.key, ...(f.type === "date" ? { bucket: "month" as const } : {}) } : null, sort: undefined, chart: !f && c.chart !== "number" && c.chart !== "table" ? "table" : c.chart });
                      }}
                    >
                      <option value="">— Không nhóm —</option>
                      {groupable.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {fieldOf(c.groupBy?.field)?.type === "date" && (
                      <select className="input w-[92px]" value={c.groupBy?.bucket ?? "day"} onChange={(e) => update({ groupBy: { field: c.groupBy!.field, bucket: e.target.value as (typeof BUCKETS)[number] } })} aria-label="Đơn vị thời gian">
                        {BUCKETS.map((b) => (
                          <option key={b} value={b}>
                            {BUCKET_LABEL[b]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {!c.groupBy && (
                    <div className="mt-2">
                      <p className="text-[12px] text-ink-2">Không nhóm: hiện tổng, hoặc chọn cột để xem danh sách từng dòng.</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {fields.map((f) => {
                          const on = c.columns.includes(f.key);
                          return (
                            <button key={f.key} className={`chip h-7 px-2.5 text-[12.5px] ${on ? "chip-on" : ""}`} aria-pressed={on} onClick={() => update({ columns: on ? c.columns.filter((k) => k !== f.key) : [...c.columns, f.key].slice(0, 15) })}>
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Field>

                {!(c.columns.length && !c.groupBy) && (
                  <Field label="Chỉ số">
                    <div className="space-y-2">
                      {c.metrics.map((m, i) => {
                        const set = (p: Partial<typeof m>) => update({ metrics: c.metrics.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                        const choices = m.op === "rate" ? bools : numeric;
                        return (
                          <div key={i} className="flex gap-1.5">
                            <select
                              className="input h-8 w-[110px] px-2 text-[13px]"
                              value={m.op}
                              onChange={(e) => {
                                const op = e.target.value as MetricOp;
                                const list = op === "rate" ? bools : numeric;
                                set({ op, field: op === "count" ? undefined : list.some((f) => f.key === m.field) ? m.field : list[0]?.key, label: undefined });
                              }}
                              aria-label="Phép tính"
                            >
                              {(["count", "sum", "avg", "min", "max", "rate"] as MetricOp[])
                                .filter((op) => op === "count" || (op === "rate" ? bools.length : numeric.length))
                                .map((op) => (
                                  <option key={op} value={op}>
                                    {METRIC_LABEL[op]}
                                  </option>
                                ))}
                            </select>
                            {m.op !== "count" && (
                              <select className="input h-8 min-w-0 flex-1 px-2 text-[13px]" value={m.field ?? ""} onChange={(e) => set({ field: e.target.value, label: undefined })} aria-label="Trường tính">
                                {choices.map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            {m.op === "count" && <span className="flex-1" />}
                            <button className="btn-ghost h-8 px-1.5" disabled={c.metrics.length <= 1} onClick={() => update({ metrics: c.metrics.filter((_, j) => j !== i), sort: undefined })} aria-label="Bỏ chỉ số">
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        );
                      })}
                      <button className="btn-ghost h-7 px-2 text-[13px] text-primary" disabled={c.metrics.length >= 6} onClick={() => update({ metrics: [...c.metrics, numeric[0] ? { op: "sum", field: numeric[0].key } : { op: "count" }] })}>
                        <Icon name="plus" size={14} /> Thêm chỉ số
                      </button>
                    </div>
                  </Field>
                )}

                {c.groupBy && (
                  <Field label="Sắp xếp & giới hạn">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_72px] gap-2">
                      <select className="input" value={c.sort?.by ?? ""} onChange={(e) => update({ sort: e.target.value ? { by: e.target.value, dir: c.sort?.dir ?? "desc" } : undefined })} aria-label="Sắp xếp theo">
                        <option value="">Tự động</option>
                        <option value="label">Theo nhóm</option>
                        {c.metrics.map((m, i) => (
                          <option key={i} value={`m${i}`}>
                            {result?.columns[i + 1]?.label ?? METRIC_LABEL[m.op]}
                          </option>
                        ))}
                      </select>
                      <button className="btn-outline px-2" disabled={!c.sort} onClick={() => c.sort && update({ sort: { ...c.sort, dir: c.sort.dir === "asc" ? "desc" : "asc" } })} aria-label="Đảo chiều sắp xếp" title={c.sort?.dir === "asc" ? "Tăng dần" : "Giảm dần"}>
                        {c.sort?.dir === "asc" ? "↑" : "↓"}
                      </button>
                      <input type="number" className="input px-2" min={1} max={1000} value={c.limit} onChange={(e) => update({ limit: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} aria-label="Số nhóm tối đa" />
                    </div>
                  </Field>
                )}
                {!c.groupBy && c.columns.length > 0 && (
                  <Field label="Số dòng tối đa">
                    <input type="number" className="input" min={1} max={1000} value={c.limit} onChange={(e) => update({ limit: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
                  </Field>
                )}

                <Field label="Kiểu hiển thị">
                  <div className="flex flex-wrap gap-1.5">
                    {CHARTS.filter((t) => (c.groupBy ? true : t === "table" || t === "number")).map((t) => (
                      <button key={t} className={`chip h-7 px-2.5 text-[12.5px] ${c.chart === t ? "chip-on" : ""}`} aria-pressed={c.chart === t} onClick={() => update({ chart: t })}>
                        {CHART_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            ) : (
              <SchedulePanel schedule={schedule} onChange={(s) => (setSchedule(s), setDirty(true))} recipients={recipients} onRecipients={(v) => (setRecipients(v), setDirty(true))} badEmail={badEmail} me={me} mailOk={mailOk} lastSentAt={initial.lastSentAt} canSend={!!id} busy={busy === "send"} onSend={sendNow} />
            )}
          </aside>
        )}

        <section className="min-w-0">
          <Preview result={result} chart={c.chart} loading={loading} err={err} />
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function FilterValue({ f, op, value, onChange }: { f: FieldMeta; op: FilterOp; value: unknown; onChange: (v: string | number | boolean | string[]) => void }) {
  const cls = "input h-8 px-2 text-[13px]";
  if (f.type === "bool")
    return (
      <select className={cls} value={value ? "1" : "0"} onChange={(e) => onChange(e.target.value === "1")} aria-label="Giá trị">
        <option value="1">Có</option>
        <option value="0">Không</option>
      </select>
    );
  if (f.type === "enum" && f.options?.length) {
    if (op === "in") {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {f.options.map((o) => {
            const on = list.includes(o.key);
            return (
              <button key={o.key} className={`chip h-6 px-2 text-[12px] ${on ? "chip-on" : ""}`} aria-pressed={on} onClick={() => onChange(on ? list.filter((k) => k !== o.key) : [...list, o.key])}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <select className={cls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label="Giá trị">
        <option value="">—</option>
        {f.options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (f.type === "date") return <input type="date" className={cls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label="Ngày" />;
  if (NUMERIC.has(f.type)) return <input type="number" className={cls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Giá trị" placeholder={f.type === "duration" ? "giây" : ""} />;
  return <input className={cls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label="Giá trị" maxLength={200} />;
}

function SchedulePanel(p: {
  schedule: Schedule;
  onChange: (s: Schedule) => void;
  recipients: string;
  onRecipients: (v: string) => void;
  badEmail?: string;
  me: { name: string; email: string };
  mailOk: boolean;
  lastSentAt: string | null;
  canSend: boolean;
  busy: boolean;
  onSend: () => void;
}) {
  const s = p.schedule;
  return (
    <div className="space-y-4">
      {!p.mailOk && (
        <p className="rounded bg-warning-soft px-3 py-2 text-[13px] text-warning">
          Chưa cấu hình email SMTP nên chưa gửi được. Vào{" "}
          <Link href="/w/marketing" className="underline">
            Marketing → Kênh gửi tin → Email
          </Link>{" "}
          để nhập máy chủ SMTP.
        </p>
      )}
      <Field label="Tần suất">
        <div className="segmented w-full">
          {(["off", "daily", "weekly", "monthly"] as const).map((f) => (
            <button key={f} aria-pressed={s.freq === f} className="flex-1 justify-center" onClick={() => p.onChange({ ...s, freq: f })}>
              {f === "off" ? "Tắt" : f === "daily" ? "Ngày" : f === "weekly" ? "Tuần" : "Tháng"}
            </button>
          ))}
        </div>
      </Field>
      {s.freq !== "off" && (
        <div className="grid grid-cols-2 gap-2">
          {s.freq === "weekly" && (
            <Field label="Thứ">
              <select className="input" value={s.weekday} onChange={(e) => p.onChange({ ...s, weekday: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_LABEL[d]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {s.freq === "monthly" && (
            <Field label="Ngày">
              <select className="input" value={s.day} onChange={(e) => p.onChange({ ...s, day: Number(e.target.value) })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d === 31 ? "Cuối tháng" : `Ngày ${d}`}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Giờ (giờ VN)">
            <select className="input" value={s.hour} onChange={(e) => p.onChange({ ...s, hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <Field label="Người nhận">
        <textarea className="textarea min-h-[70px] text-[13px]" value={p.recipients} onChange={(e) => p.onRecipients(e.target.value)} placeholder={p.me.email ? `Để trống = gửi cho bạn (${p.me.email})` : "email@congty.vn, ..."} />
        {p.badEmail && <p className="mt-1 text-[12px] text-danger">Email không hợp lệ: {p.badEmail}</p>}
        <p className="mt-1 text-[12px] text-ink-2">Ngăn cách bằng dấu phẩy. Email gồm bảng tóm tắt và file Excel đính kèm; số liệu theo phạm vi quyền của người tạo báo cáo.</p>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-outline" onClick={p.onSend} disabled={!p.canSend || p.busy}>
          <Icon name="send" size={15} /> {p.busy ? "Đang gửi…" : "Gửi thử ngay"}
        </button>
        <span className="text-[12px] text-ink-2">{p.lastSentAt ? `Gửi theo lịch lần cuối ${ago(p.lastSentAt)}` : "Chưa gửi theo lịch lần nào"}</span>
      </div>
      <p className="text-[12px] text-ink-2">Nhớ bấm Lưu sau khi đổi lịch.</p>
    </div>
  );
}

function Preview({ result, chart, loading, err }: { result: ReportResult | null; chart: ReportConfig["chart"]; loading: boolean; err: string }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [result]);
  const PER = 50;
  const rows = useMemo(() => result?.rows.slice(page * PER, page * PER + PER) ?? [], [result, page]);

  if (err) return <div className="card grid min-h-[240px] place-items-center p-6 text-center text-[14px] text-danger">{err}</div>;
  if (!result) return <div className="card skeleton h-[360px]" />;
  const big = chart === "number" || result.mode === "total";
  const canChart = result.mode === "group" && result.rows.length > 0 && (chart === "bar" || chart === "line" || chart === "pie");

  return (
    <div className={`space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
        <span>
          <Icon name="calendar" size={12} className="mr-1 inline" />
          {result.rangeLabel}
        </span>
        <span>{result.scanned.toLocaleString("vi-VN")} dòng dữ liệu</span>
        {result.hiddenGroups > 0 && <span>· ẩn {result.hiddenGroups} {result.mode === "list" ? "dòng" : "nhóm"} ngoài giới hạn</span>}
        {result.truncated && <span className="text-warning">· Dữ liệu quá lớn, chỉ tính 20.000 dòng mới nhất — hãy thu hẹp khoảng thời gian</span>}
        {loading && <span>· đang cập nhật…</span>}
      </div>

      {big && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {result.columns.slice(result.mode === "group" ? 1 : 0).map((col, i) => (
            <div key={col.key} className="card p-4">
              <p className="text-[13px] text-ink-2">{col.label}</p>
              <p className="tnum mt-1 text-[30px] font-semibold leading-tight">{fmtCell(result.totals[i] ?? null, col.kind)}</p>
            </div>
          ))}
        </div>
      )}

      {canChart && (
        <div className="card h-[320px] p-3">
          <ReportChart result={result} type={chart as "bar" | "line" | "pie"} />
        </div>
      )}

      {result.mode !== "total" && (
        <div className="card overflow-x-auto">
          {result.rows.length === 0 ? (
            <p className="p-6 text-center text-[14px] text-ink-2">Không có dữ liệu trong khoảng này.</p>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left">
                  {result.columns.map((col, i) => (
                    <th key={col.key} className={`whitespace-nowrap px-3 py-2 font-medium text-ink-2 ${i && col.kind !== "text" ? "text-right" : ""}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-line-soft last:border-0 hover:bg-hover">
                    {r.map((v, i) => (
                      <td key={i} className={`px-3 py-1.5 ${i && result.columns[i].kind !== "text" ? "tnum whitespace-nowrap text-right" : ""}`}>
                        {fmtCell(v, result.columns[i].kind)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {result.mode === "group" && result.rows.length > 1 && (
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td className="px-3 py-2">Tổng</td>
                    {result.totals.map((v, i) => (
                      <td key={i} className="tnum whitespace-nowrap px-3 py-2 text-right">
                        {fmtCell(v, result.columns[i + 1].kind)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          {result.rows.length > PER && (
            <div className="flex items-center justify-end gap-2 border-t border-line-soft px-3 py-2 text-[13px]">
              <button className="btn-ghost h-7 px-2" disabled={page === 0} onClick={() => setPage(page - 1)}>
                ‹ Trước
              </button>
              <span className="text-ink-2">
                {page + 1}/{Math.ceil(result.rows.length / PER)}
              </span>
              <button className="btn-ghost h-7 px-2" disabled={(page + 1) * PER >= result.rows.length} onClick={() => setPage(page + 1)}>
                Sau ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
