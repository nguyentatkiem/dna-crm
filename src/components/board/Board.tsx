"use client";

import { useEffect, useMemo, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import type { FieldValue, RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { ago, heat, vnd } from "@/lib/format";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { FieldCell, InputCell, LabelCell, PersonCell } from "./cells";
import { ItemPanel } from "./ItemPanel";
import { ImportDialog } from "./ImportDialog";
import { CalendarView } from "./CalendarView";
import { useRouter } from "next/navigation";

type Patch = Partial<Pick<RecordDTO, "title" | "status" | "ownerName" | "amount">> & { data?: Record<string, FieldValue> };
type Sort = "new" | "name" | "amount" | "score";

export function Board({ obj, team, initial, initialQ, initialOpen }: { obj: ObjectDef; team: string[]; initial: RecordDTO[]; initialQ: string; initialOpen: string | null }) {
  const router = useRouter();
  const [records, setRecords] = useState(initial);
  // Trợ lý AI gọi router.refresh() sau khi ghi dữ liệu → nhận danh sách mới từ server.
  useEffect(() => {
    setRecords(initial);
  }, [initial]);
  const [view, setView] = useState<"table" | "kanban" | "calendar">("table");
  const [importing, setImporting] = useState(false);
  const dateField = obj.fields.find((f) => f.type === "date");
  const [q, setQ] = useState(initialQ);
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const [toast, setToast] = useState("");
  const isDeals = !!obj.amountLabel;
  const isContacts = obj.key === "contacts";

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 2400);
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = records.filter((r) => (!owner || r.ownerName === owner) && (!s || (r.title + " " + Object.values(r.data).join(" ")).toLowerCase().includes(s)));
    const by: Record<Sort, (a: RecordDTO, b: RecordDTO) => number> = {
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.title.localeCompare(b.title, "vi"),
      amount: (a, b) => b.amount - a.amount,
      score: (a, b) => b.score - a.score,
    };
    return [...list].sort(by[sort]);
  }, [records, q, owner, sort]);

  async function patch(id: string, body: Patch) {
    const before = records.find((r) => r.id === id);
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...body, data: body.data ? { ...r.data, ...body.data } : r.data } : r)));
    const res = await fetch(`/api/records/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      if (before) setRecords((rs) => rs.map((r) => (r.id === id ? before : r)));
      flash((await res.json().catch(() => ({}))).error ?? "Không lưu được");
      return;
    }
    const fresh: RecordDTO = await res.json();
    setRecords((rs) => rs.map((r) => (r.id === id ? fresh : r)));
    if (body.status && before && body.status !== before.status) flash(`Đã chuyển sang “${obj.statuses.find((s) => s.key === body.status)?.label}”`);
  }

  async function create(title: string, status?: string) {
    const res = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectKey: obj.key, title, status }) });
    if (!res.ok) return flash("Không thêm được mục");
    const rec: RecordDTO = await res.json();
    setRecords((rs) => [rec, ...rs]);
    flash(`Đã thêm “${rec.title}”`);
    return rec;
  }

  async function remove(id: string) {
    const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRecords((rs) => rs.filter((r) => r.id !== id));
      setOpenId(null);
      flash("Đã xoá mục");
    }
  }

  const total = records.length || 1;
  const opened = records.find((r) => r.id === openId) ?? null;

  return (
    <div className="canvas px-6 pb-40 pt-5 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight">{obj.label}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{obj.description}</p>
        </div>
        <div className="flex h-2 w-56 overflow-hidden rounded-full bg-line-soft" title="Tỉ lệ theo trạng thái">
          {obj.statuses.map((s) => {
            const n = records.filter((r) => r.status === s.key).length;
            return n ? <span key={s.key} style={{ width: `${(n / total) * 100}%`, background: color(s.color).bg }} title={`${s.label}: ${n}`} /> : null;
          })}
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-line-soft">
        {(
          [
            ["table", "Bảng chính", "table"],
            ["kanban", "Kanban", "kanban"],
            ...(dateField ? ([["calendar", "Lịch", "calendar"]] as const) : []),
          ] as const
        ).map(([k, label, icon]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`-mb-px flex h-9 items-center gap-1.5 border-b-2 px-3 text-[14px] ${view === k ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={async () => { const r = await create(`${obj.itemLabel} mới`); if (r) setOpenId(r.id); }}>
          Thêm {obj.itemLabel.toLowerCase()} mới
        </button>
        <label className="relative">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input id="board-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm" className="input h-8 w-44 pl-8" />
        </label>
        <label className="btn-ghost relative">
          <Icon name="person" size={16} />
          <select id="board-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="bg-transparent text-[14px] outline-none" aria-label="Lọc theo người phụ trách">
            <option value="">Mọi người</option>
            {team.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="btn-ghost">
          <Icon name="sort" size={16} />
          <select id="board-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent text-[14px] outline-none" aria-label="Sắp xếp">
            <option value="new">Mới nhất</option>
            <option value="name">Theo tên</option>
            {isDeals && <option value="amount">Giá trị cao</option>}
            {isContacts && <option value="score">Điểm AI cao</option>}
          </select>
        </label>
        {(q || owner) && (
          <button type="button" className="btn-ghost text-primary" onClick={() => { setQ(""); setOwner(""); }}>
            Xoá lọc · {shown.length} mục
          </button>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn-ghost" onClick={() => setImporting(true)}>
            <Icon name="upload" size={16} /> Nhập
          </button>
          <a className="btn-ghost" href={`/api/records/export?object=${obj.key}`}>
            <Icon name="download" size={16} /> Xuất Excel
          </a>
        </span>
      </div>

      {importing && (
        <ImportDialog
          obj={obj}
          onClose={() => setImporting(false)}
          onDone={(m) => {
            setImporting(false);
            flash(m);
            router.refresh();
          }}
        />
      )}

      {view === "calendar" && dateField ? (
        <CalendarView rows={shown} obj={obj} fieldKey={dateField.key} onOpen={setOpenId} />
      ) : view === "table" ? (
        <div className="mt-5 overflow-x-auto pb-40">
          <div className="grid min-w-max gap-8">
            {obj.statuses.map((s) => {
              const rows = shown.filter((r) => r.status === s.key);
              const c = color(s.color).bg;
              const isCollapsed = collapsed[s.key];
              return (
                <section key={s.key}>
                  <button type="button" onClick={() => setCollapsed({ ...collapsed, [s.key]: !isCollapsed })} className="mb-2 flex items-center gap-1.5 text-[16px] font-semibold" style={{ color: c }}>
                    <Icon name="chevron" size={18} className={isCollapsed ? "-rotate-90" : ""} />
                    {s.label}
                    <span className="ml-1 text-[13px] font-normal text-ink-2">{rows.length} mục</span>
                  </button>
                  {!isCollapsed && (
                    <table className="board-table text-[14px]" style={{ borderLeft: `6px solid ${c}`, borderRadius: 4 }}>
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 w-[300px] min-w-[300px] border-t border-line-soft text-left" style={{ paddingLeft: 12 }}>
                            {obj.itemLabel}
                          </th>
                          <th className="w-[96px] border-t border-line-soft">Phụ trách</th>
                          <th className="w-[150px] border-t border-line-soft">{obj.statusLabel}</th>
                          {obj.fields.map((f) => (
                            <th key={f.key} className={`border-t border-line-soft ${f.type === "select" ? "w-[150px]" : "w-[140px]"}`}>
                              {f.label}
                            </th>
                          ))}
                          {isDeals && <th className="w-[130px] border-t border-line-soft">{obj.amountLabel}</th>}
                          {isContacts && <th className="w-[110px] border-t border-line-soft">Điểm AI</th>}
                          <th className="w-[120px] border-t border-line-soft">Cập nhật</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="group">
                            <td className="sticky left-0 z-10 bg-surface">
                              <div className="flex h-full items-center">
                                <div className="min-w-0 flex-1">
                                  <InputCell field={{ type: "text", label: obj.itemLabel }} value={r.title} onSave={(v) => patch(r.id, { title: String(v) })} />
                                </div>
                                <button type="button" onClick={() => setOpenId(r.id)} className="mr-1 flex h-7 flex-none items-center gap-1 rounded px-1.5 text-[12.5px] text-ink-2 opacity-0 hover:bg-hover hover:text-primary group-hover:opacity-100 focus:opacity-100" aria-label="Mở chi tiết">
                                  <Icon name="open" size={14} /> Mở
                                </button>
                                {r.updates > 0 && <span className="mr-2 flex-none rounded-full bg-primary px-1.5 text-[11px] text-white tnum">{r.updates}</span>}
                              </div>
                            </td>
                            <td><PersonCell team={team} value={r.ownerName} onPick={(v) => patch(r.id, { ownerName: v })} /></td>
                            <td className="status-cell"><LabelCell options={obj.statuses} value={r.status} onPick={(k) => patch(r.id, { status: k })} /></td>
                            {obj.fields.map((f) => (
                              <td key={f.key} className={f.type === "select" ? "status-cell" : ""}>
                                <FieldCell field={f} value={r.data[f.key]} onSave={(v) => patch(r.id, { data: { [f.key]: v } })} />
                              </td>
                            ))}
                            {isDeals && (
                              <td><InputCell field={{ type: "money", label: obj.amountLabel }} value={r.amount} onSave={(v) => patch(r.id, { amount: Number(v) })} /></td>
                            )}
                            {isContacts && (
                              <td className="text-center">
                                <ScorePill score={r.score} />
                              </td>
                            )}
                            <td className="px-2 text-center text-[12.5px] text-ink-2" suppressHydrationWarning>{ago(r.updatedAt)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface">
                            <AddRow label={obj.itemLabel} onAdd={(t) => create(t, s.key)} />
                          </td>
                          <td colSpan={3 + obj.fields.length + (isDeals ? 1 : 0) + (isContacts ? 1 : 0)} />
                        </tr>
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface" />
                          <td />
                          <td className="px-2">
                            <div className="mx-auto h-5 w-[120px] rounded-sm" style={{ background: rows.length ? c : "var(--line-soft)" }} title={`${rows.length} mục`} />
                          </td>
                          {obj.fields.map((f) => (
                            <td key={f.key} className="px-2 text-center text-[12.5px] text-ink-2">
                              {f.type === "number" || f.type === "money" ? <Sum label="tổng" value={rows.reduce((a, r) => a + (Number(r.data[f.key]) || 0), 0)} money={f.type === "money"} /> : null}
                            </td>
                          ))}
                          {isDeals && (
                            <td className="px-2 text-right">
                              <Sum label="tổng" value={rows.reduce((a, r) => a + r.amount, 0)} money />
                            </td>
                          )}
                          {isContacts && <td className="text-center text-[12.5px] text-ink-2">TB {rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0}</td>}
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Kanban obj={obj} rows={shown} onMove={(id, st) => patch(id, { status: st })} onOpen={setOpenId} onAdd={(t, st) => create(t, st)} />
      )}

      {opened && <ItemPanel obj={obj} team={team} record={opened} onClose={() => setOpenId(null)} onPatch={(b) => patch(opened.id, b)} onDelete={() => remove(opened.id)} />}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#323338] px-4 py-2.5 text-[14px] text-white shadow-panel">
          {toast}
        </div>
      )}
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const h = heat(score);
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-medium text-white tnum" style={{ background: color(h.color).bg }}>
      {h.label} · {score}
    </span>
  );
}

function Sum({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <span className="text-[13px] tnum">
      <b className="font-semibold text-ink">{money ? vnd(value) : value.toLocaleString("vi-VN")}</b> <span className="text-[11.5px] text-ink-2">{label}</span>
    </span>
  );
}

function AddRow({ label, onAdd }: { label: string; onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      aria-label={`Thêm ${label.toLowerCase()}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          onAdd(v.trim());
          setV("");
        }
      }}
      onBlur={() => {
        if (v.trim()) {
          onAdd(v.trim());
          setV("");
        }
      }}
      placeholder={`+ Thêm ${label.toLowerCase()}`}
      className="h-full w-full bg-transparent px-3 text-[14px] outline-none placeholder:text-ink-2 focus:bg-surface"
    />
  );
}

function Kanban({ obj, rows, onMove, onOpen, onAdd }: { obj: ObjectDef; rows: RecordDTO[]; onMove: (id: string, status: string) => void; onOpen: (id: string) => void; onAdd: (t: string, status: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const preview = obj.fields.filter((f) => f.type !== "phone").slice(0, 2);
  return (
    <div className="mt-5 flex gap-3 overflow-x-auto pb-6">
      {obj.statuses.map((s) => {
        const list = rows.filter((r) => r.status === s.key);
        const c = color(s.color);
        return (
          <div
            key={s.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.key);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) onMove(id, s.key);
            }}
            className={`flex w-[272px] flex-none flex-col rounded-lg bg-surface-2 ${over === s.key ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex h-10 items-center justify-between rounded-t-lg px-3 text-[14px] font-medium" style={{ background: c.bg, color: c.fg }}>
              <span>{s.label}</span>
              <span className="tnum opacity-90">
                {list.length}
                {obj.amountLabel ? ` · ${vnd(list.reduce((a, r) => a + r.amount, 0))}` : ""}
              </span>
            </div>
            <div className="flex min-h-[200px] flex-col gap-2 p-2">
              {list.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                  onClick={() => onOpen(r.id)}
                  className="grid cursor-grab gap-2 rounded-lg border border-line-soft bg-surface p-3 text-left shadow-card hover:border-line active:cursor-grabbing"
                >
                  <span className="font-medium">{r.title}</span>
                  {preview.map((f) =>
                    r.data[f.key] ? (
                      <span key={f.key} className="text-[12.5px] text-ink-2">
                        {f.label}: <span className="text-ink">{f.type === "money" ? vnd(Number(r.data[f.key])) : String(r.data[f.key])}</span>
                      </span>
                    ) : null,
                  )}
                  <span className="flex items-center justify-between">
                    <Avatar name={r.ownerName} size={22} />
                    {obj.amountLabel ? <b className="text-[13px] tnum">{vnd(r.amount)}</b> : obj.key === "contacts" ? <ScorePill score={r.score} /> : null}
                  </span>
                </button>
              ))}
              <AddCard onAdd={(t) => onAdd(t, s.key)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      aria-label="Thêm thẻ"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          onAdd(v.trim());
          setV("");
        }
      }}
      placeholder="+ Thêm mục"
      className="h-9 rounded-lg bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-2 hover:bg-surface focus:bg-surface"
    />
  );
}
