"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { FilterMenu } from "@/components/board/BoardMenus";
import { OPS, filterFields, type Filter } from "@/components/board/model";
import { openInBoard } from "@/components/care/openInBoard";
import { ago } from "@/lib/format";

type Seg = { id: string; name: string; objectKey: string; filters: Filter[]; mode: "and" | "or"; createdBy: string; updatedAt: string; count: number };
type Member = { id: string; title: string; phone: string; owner: string; status: string };
type Draft = { id: string | null; name: string; objectKey: string; filters: Filter[]; mode: "and" | "or" };

/** Mô tả ngắn một điều kiện lọc bằng tiếng Việt. */
function describe(f: Filter, obj: ObjectDef | undefined, team: string[]) {
  if (!obj) return "";
  const ff = filterFields(obj, team).find((x) => x.key === f.field);
  if (!ff) return "";
  const op = OPS[ff.kind].find((o) => o.op === f.op)?.label ?? f.op;
  const val = f.op === "empty" || f.op === "not_empty" ? "" : ` “${ff.options?.find((o) => o.value === f.value)?.label ?? f.value}”`;
  return `${ff.label} ${op}${val}`;
}

export function SegmentsClient({ objects, team, me }: { objects: ObjectDef[]; team: string[]; me: string }) {
  const [segs, setSegs] = useState<Seg[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ total: number; members: Member[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const objOf = useCallback((k: string) => objects.find((o) => o.key === k), [objects]);

  const load = useCallback(async () => {
    const r = await fetch("/api/segments");
    setSegs(r.ok ? (await r.json()).items : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Xem trước thành viên mỗi khi bộ lọc đổi (chờ 300ms để không gọi liên tục khi đang gõ).
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(async () => {
      const r = await fetch("/api/segments/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectKey: draft.objectKey, filters: draft.filters, mode: draft.mode }) });
      setPreview(r.ok ? await r.json() : null);
    }, 300);
    return () => clearTimeout(t);
  }, [draft?.objectKey, draft?.filters, draft?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields = useMemo(() => {
    const o = draft && objOf(draft.objectKey);
    return o ? filterFields(o, team) : [];
  }, [draft, objOf, team]);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setMsg("Đặt tên cho nhóm");
    setBusy(true);
    setMsg("");
    const body = JSON.stringify({ name: draft.name, objectKey: draft.objectKey, filters: draft.filters, mode: draft.mode });
    const r = await fetch(draft.id ? `/api/segments/${draft.id}` : "/api/segments", { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Không lưu được");
    setDraft({ ...draft, id: j.id });
    setMsg("Đã lưu nhóm");
    load();
  }

  async function remove() {
    if (!draft?.id || !confirm(`Xoá nhóm “${draft.name}”? Khách trong nhóm không bị ảnh hưởng.`)) return;
    const r = await fetch(`/api/segments/${draft.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "Không xoá được");
    setDraft(null);
    load();
  }

  const startNew = () => {
    setMsg("");
    setPreview(null);
    setDraft({ id: null, name: "", objectKey: objects[0]?.key ?? "contacts", filters: [], mode: "and" });
  };

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <section className="grid min-w-0 content-start gap-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Nhóm đã lưu</h2>
          <button type="button" className="btn-primary h-8" onClick={startNew}>
            <Icon name="plus" size={15} /> Nhóm mới
          </button>
        </div>
        {segs === null ? (
          <div className="skeleton h-24" />
        ) : segs.length === 0 ? (
          <div className="card">
            <EmptyState compact icon="segment" title="Chưa có nhóm khách" desc="Ví dụ: khách VIP, khách lâu chưa quay lại, khách từ Zalo chưa mua." action={{ label: "Tạo nhóm đầu tiên", onClick: startNew }} />
          </div>
        ) : (
          <ul className="card divide-y divide-line-soft">
            {segs.map((s) => {
              const o = objOf(s.objectKey);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg("");
                      setPreview(null);
                      setDraft({ id: s.id, name: s.name, objectKey: s.objectKey, filters: s.filters, mode: s.mode });
                    }}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--row-hover)] ${draft?.id === s.id ? "bg-primary-selected" : ""}`}
                  >
                    <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-md bg-surface-2 text-ink-2">
                      <Icon name="segment" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-2">
                        {o?.label ?? s.objectKey} · {s.filters.map((f) => describe(f, o, team)).filter(Boolean).join(s.mode === "and" ? " và " : " hoặc ") || "Không có điều kiện"}
                      </span>
                    </span>
                    <span className="flex-none text-[15px] font-semibold tnum">{s.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="min-w-0">
        {!draft ? (
          <div className="card">
            <EmptyState icon="filter" title="Chọn một nhóm để xem thành viên" desc="Hoặc tạo nhóm mới bằng bộ lọc giống Lọc nâng cao trên bảng." />
          </div>
        ) : (
          <div className="card anim-fade grid gap-3 p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className="grid gap-1">
                <span className="label">Tên nhóm</span>
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} placeholder="Ví dụ: Khách VIP" />
              </label>
              <label className="grid gap-1">
                <span className="label">Bảng</span>
                <select className="input" value={draft.objectKey} onChange={(e) => setDraft({ ...draft, objectKey: e.target.value, filters: [] })}>
                  {objects.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {fields.length > 0 && <FilterMenu fields={fields} filters={draft.filters} mode={draft.mode} onChange={(f, m) => setDraft({ ...draft, filters: f, mode: m })} />}
              <span className="min-w-0 flex-1 text-[13px] text-ink-2">
                {draft.filters.map((f) => describe(f, objOf(draft.objectKey), team)).filter(Boolean).join(draft.mode === "and" ? " và " : " hoặc ") || "Chưa có điều kiện: nhóm gồm mọi mục của bảng"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={save}>
                {draft.id ? "Lưu thay đổi" : "Lưu nhóm"}
              </button>
              <button type="button" className="btn-outline" onClick={() => openInBoard(draft.objectKey, draft.filters, draft.mode)}>
                <Icon name="open" size={14} /> Mở trong bảng
              </button>
              {draft.id && (
                <button type="button" className="btn-ghost text-danger" onClick={remove}>
                  <Icon name="trash" size={14} /> Xoá
                </button>
              )}
              {msg && (
                <span role="status" className="text-[13px] text-ink-2">
                  {msg}
                </span>
              )}
            </div>

            <div className="mt-1 border-t border-line-soft pt-3">
              <p className="section-title">
                Thành viên{preview ? ` · ${preview.total.toLocaleString("vi-VN")}` : ""}
                {preview && preview.total > 20 && <span className="ml-1 normal-case tracking-normal">(hiện 20 đầu)</span>}
              </p>
              {!preview ? (
                <div className="skeleton mt-2 h-20" />
              ) : preview.members.length === 0 ? (
                <p className="mt-2 text-[13.5px] text-ink-2">Không có mục nào khớp bộ lọc.</p>
              ) : (
                <ul className="mt-1 divide-y divide-line-soft">
                  {preview.members.map((m) => (
                    <li key={m.id}>
                      <a href={`/w/b/${draft.objectKey}?open=${m.id}`} className="flex items-center gap-3 py-2 text-[14px] hover:text-primary">
                        <span className="min-w-0 flex-1 truncate">{m.title}</span>
                        {m.phone && <span className="hidden text-[12.5px] text-ink-2 tnum sm:inline">{m.phone}</span>}
                        <span className="flex-none text-[12.5px] text-ink-2">{m.status}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {draft.id && <p className="text-[12px] text-ink-2">Người tạo: {segs?.find((s) => s.id === draft.id)?.createdBy || me} · cập nhật <span suppressHydrationWarning>{ago(segs?.find((s) => s.id === draft.id)?.updatedAt ?? new Date().toISOString())}</span></p>}
          </div>
        )}
      </section>
    </div>
  );
}
