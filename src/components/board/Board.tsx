"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { color } from "@/lib/colors";
import { Icon } from "../Icon";
import { ItemPanel } from "./ItemPanel";
import { ImportDialog } from "./ImportDialog";
import { CalendarView } from "./CalendarView";
import { TableView, type ColAction, type RowExt } from "./TableView";
import { KanbanView } from "./KanbanView";
import { GanttView } from "./GanttView";
import { ChartView } from "./ChartView";
import { BoardActivity, RowMenu, ViewOptions, type RowAction } from "./BoardExtras";
import { BulkBar, ColumnsMenu, FilterMenu } from "./BoardMenus";
import { OPS, applyFilters, colKey, columnsOf, filterFields, groupableFields, groupsOf, readLS, sortRows, writeLS, ROW_HEIGHT, tintOf, type ColorRule, type Density, type ColSort, type Column, type Filter, type Group, type GroupBy, type Patch, type View } from "./model";
import type { FieldValue } from "@/lib/records";

type Sort = "new" | "name" | "amount" | "score";
const VIEWS: View[] = ["table", "kanban", "calendar", "gantt", "chart"];

/** Chạy hàm bất đồng bộ theo lô nhỏ để không dồn hàng trăm request cùng lúc. */
async function inBatches<T>(items: T[], size: number, fn: (x: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export function Board({
  obj,
  team,
  initial,
  initialQ,
  initialOpen,
  canDelete = true,
  canImport = true,
  canExport = true,
}: {
  obj: ObjectDef;
  team: string[];
  initial: RecordDTO[];
  initialQ: string;
  initialOpen: string | null;
  /** Ẩn nút xoá (đơn lẻ và hàng loạt) khi người dùng không có quyền xoá. Mặc định: hiện. */
  canDelete?: boolean;
  /** Ẩn nút Nhập / Xuất Excel theo quyền (nhân viên mặc định không có). */
  canImport?: boolean;
  canExport?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [records, setRecords] = useState(initial);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  // Trợ lý AI gọi router.refresh() sau khi ghi dữ liệu → nhận danh sách mới từ server.
  useEffect(() => {
    setRecords(initial);
  }, [initial]);

  const dateFields = obj.fields.filter((f) => f.type === "date");
  const urlView = search.get("view") as View | null;
  const [view, setViewState] = useState<View>(urlView && VIEWS.includes(urlView) && (urlView !== "calendar" || dateFields.length) ? urlView : "table");
  const setView = (v: View) => {
    setViewState(v);
    // Lưu view vào URL để chia sẻ link (?view=gantt), không tải lại trang.
    const u = new URL(window.location.href);
    if (v === "table") u.searchParams.delete("view");
    else u.searchParams.set("view", v);
    window.history.replaceState(null, "", u.toString());
  };

  const [importing, setImporting] = useState(false);
  const [calField, setCalField] = useState(dateFields[0]?.key ?? "");
  const [q, setQ] = useState(initialQ);
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  // Sắp xếp theo cột (menu tiêu đề cột) — khi bật thì thay cho kiểu sắp xếp có sẵn.
  const [colSort, setColSort] = useState<ColSort | null>(null);
  const [density, setDensity] = useState<Density>("normal");
  const [colorRules, setColorRules] = useState<ColorRule[]>([]);
  const [rowMenu, setRowMenu] = useState<{ r: RecordDTO; x: number; y: number } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [mode, setMode] = useState<"and" | "or">("and");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [hidden, setHidden] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const [toast, setToast] = useState("");
  // Hoàn tác xoá: mục vừa chuyển vào thùng rác, giữ trong vài giây để khôi phục.
  const [undo, setUndo] = useState<RecordDTO[] | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isDeals = !!obj.amountLabel;
  const isContacts = obj.key === "contacts";

  // Tuỳ chọn hiển thị riêng từng bảng, lưu trên máy (đọc sau khi mount để tránh lệch SSR).
  const prefKey = `board:${obj.key}`;
  useEffect(() => {
    setHidden(readLS<string[]>(`board-cols:${obj.key}`, []));
    const p = readLS<{ groupBy?: GroupBy; filters?: Filter[]; mode?: "and" | "or"; colSort?: ColSort | null }>(prefKey, {});
    if (p.groupBy) setGroupBy(p.groupBy);
    if (p.colSort) setColSort(p.colSort);
    setDensity(readLS<Density>(`board-density:${obj.key}`, "normal"));
    setColorRules(readLS<ColorRule[]>(`board-colors:${obj.key}`, []));
    if (p.filters) setFilters(p.filters);
    if (p.mode) setMode(p.mode);
  }, [obj.key, prefKey]);
  const savePref = (p: { groupBy?: GroupBy; filters?: Filter[]; mode?: "and" | "or"; colSort?: ColSort | null }) => writeLS(prefKey, { groupBy, filters, mode, colSort, ...p });

  const flash = useCallback((t: string, keep?: RecordDTO[]) => {
    setUndo(keep ?? null);
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast("");
      setUndo(null);
    }, keep ? 7000 : 2600);
  }, []);

  const fields = useMemo(() => filterFields(obj, team), [obj, team]);
  const allCols = useMemo(() => columnsOf(obj), [obj]);
  const cols = useMemo(() => allCols.filter((c) => !hidden.includes(c.id)), [allCols, hidden]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = records.filter((r) => (!owner || r.ownerName === owner) && (!s || (r.title + " " + Object.values(r.data).join(" ")).toLowerCase().includes(s)));
    const list = applyFilters(base, filters, mode, fields, obj);
    const by: Record<Sort, (a: RecordDTO, b: RecordDTO) => number> = {
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.title.localeCompare(b.title, "vi"),
      amount: (a, b) => b.amount - a.amount,
      score: (a, b) => b.score - a.score,
    };
    return colSort ? sortRows(list, colSort, obj) : [...list].sort(by[sort]);
  }, [records, q, owner, sort, colSort, filters, mode, fields, obj]);

  const groups = useMemo(() => groupsOf(obj, team, records, groupBy, (o) => color(o.color).bg), [obj, team, records, groupBy]);

  const patch = useCallback(
    async (id: string, body: Patch, quiet = false) => {
      const before = recordsRef.current.find((r) => r.id === id);
      setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...body, data: body.data ? { ...r.data, ...body.data } : r.data } : r)));
      const res = await fetch(`/api/records/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        if (before) setRecords((rs) => rs.map((r) => (r.id === id ? before : r)));
        flash((await res.json().catch(() => ({}))).error ?? "Không lưu được");
        return false;
      }
      const fresh: RecordDTO = await res.json();
      setRecords((rs) => rs.map((r) => (r.id === id ? { ...fresh, winProb: fresh.winProb ?? r.winProb ?? null } : r)));
      if (!quiet && body.status && before && body.status !== before.status) flash(`Đã chuyển sang “${obj.statuses.find((s) => s.key === body.status)?.label}”`);
      return true;
    },
    [flash, obj.statuses],
  );
  const onPatch = useCallback((id: string, b: Patch) => void patch(id, b), [patch]);

  async function create(title: string, status?: string, ownerName?: string, data?: Record<string, FieldValue>) {
    const res = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectKey: obj.key, title, status, ownerName, data }) });
    if (!res.ok) {
      flash((await res.json().catch(() => ({}))).error ?? "Không thêm được mục");
      return;
    }
    const rec: RecordDTO = await res.json();
    setRecords((rs) => [{ ...rec, winProb: rec.winProb ?? null }, ...rs]);
    flash(`Đã thêm “${rec.title}”`);
    return rec;
  }
  const createIn = (title: string, g: Group) => void create(title, g.status, g.owner || undefined, g.field ? { [g.field.key]: g.field.value } : undefined);

  // Menu tiêu đề cột: sắp xếp, lọc, nhóm, ẩn — giống thao tác trên tiêu đề cột của bảng kiểu monday.
  const groupKeyOf = (c: Column): GroupBy | null => (c.id === "status" ? "status" : c.id === "owner" ? "owner" : "field" in c && c.field.type === "select" && c.field.options.length ? `f:${c.field.key}` : null);
  const canGroup = useCallback((c: Column) => groupKeyOf(c) !== null, []);
  const canFilter = useCallback((c: Column) => fields.some((f) => f.key === colKey(c)), [fields]);
  const onColumn = useCallback(
    (c: Column, a: ColAction) => {
      if (a === "asc" || a === "desc" || a === "clear-sort") {
        const next = a === "clear-sort" ? null : { col: colKey(c), dir: a };
        setColSort(next);
        savePref({ colSort: next });
        if (next) flash(`Sắp xếp theo “${c.label}” ${a === "asc" ? "tăng dần" : "giảm dần"}`);
        return;
      }
      if (a === "hide") {
        const h = [...hidden, c.id];
        setHidden(h);
        writeLS(`board-cols:${obj.key}`, h);
        flash(`Đã ẩn cột “${c.label}” — mở lại trong nút Cột`);
        return;
      }
      if (a === "group") {
        const g = groupKeyOf(c);
        if (g) {
          setGroupBy(g);
          savePref({ groupBy: g });
        }
        return;
      }
      const ff = fields.find((f) => f.key === colKey(c));
      if (!ff) return;
      const next = [...filters, { id: Math.random().toString(36).slice(2, 8), field: ff.key, op: OPS[ff.kind][0].op, value: "" }];
      setFilters(next);
      savePref({ filters: next });
      flash(`Đã thêm điều kiện lọc “${c.label}” — chọn giá trị trong nút Lọc`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hidden, fields, filters, obj.key, flash, groupBy, mode, colSort],
  );

  async function removeOne(id: string) {
    const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
    if (!res.ok) {
      flash((await res.json().catch(() => ({}))).error ?? "Không xoá được");
      return false;
    }
    setRecords((rs) => rs.filter((r) => r.id !== id));
    return true;
  }

  async function remove(id: string) {
    const rec = recordsRef.current.find((r) => r.id === id);
    if (await removeOne(id)) {
      setOpenId(null);
      flash("Đã chuyển vào thùng rác", rec ? [rec] : undefined);
    }
  }

  async function undoDelete(list: RecordDTO[]) {
    setToast("");
    setUndo(null);
    const res = await fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", ids: list.map((r) => r.id) }) });
    if (!res.ok) return flash((await res.json().catch(() => ({}))).error ?? "Không khôi phục được");
    setRecords((rs) => [...list.filter((x) => !rs.some((r) => r.id === x.id)), ...rs]);
    flash(list.length > 1 ? `Đã khôi phục ${list.length} mục` : `Đã khôi phục “${list[0].title}”`);
  }

  const onSelect = useCallback((ids: string[], on: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }, []);
  // Bỏ chọn các mục đã biến mất (bị xoá, bị lọc ra khỏi danh sách).
  useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s;
      const ids = new Set(shown.map((r) => r.id));
      const n = new Set([...s].filter((id) => ids.has(id)));
      return n.size === s.size ? s : n;
    });
  }, [shown]);

  async function bulkPatch(body: Patch, done: string) {
    const ids = [...selected];
    let okN = 0;
    await inBatches(ids, 6, async (id) => {
      if (await patch(id, body, true)) okN++;
    });
    flash(`${done}: ${okN}/${ids.length} mục`);
  }
  async function bulkDelete() {
    const ids = [...selected];
    const gone: RecordDTO[] = [];
    await inBatches(ids, 6, async (id) => {
      const rec = recordsRef.current.find((r) => r.id === id);
      if ((await removeOne(id)) && rec) gone.push(rec);
    });
    setSelected(new Set());
    if (gone.length) flash(`Đã chuyển ${gone.length} mục vào thùng rác`, gone);
  }

  // Menu chuột phải trên dòng.
  const linkOf = (id: string) => `${window.location.origin}/w/b/${obj.key}?open=${id}`;
  async function duplicate(r: RecordDTO) {
    const rec = await create(`${r.title} (bản sao)`, r.status, r.ownerName || undefined, r.data);
    if (rec && r.amount) await patch(rec.id, { amount: r.amount }, true);
  }
  const onRowAction = (r: RecordDTO, a: RowAction) => {
    if (a.kind === "open") setOpenId(r.id);
    else if (a.kind === "newtab") window.open(linkOf(r.id), "_blank", "noopener");
    else if (a.kind === "copylink")
      navigator.clipboard?.writeText(linkOf(r.id)).then(
        () => flash("Đã sao chép link"),
        () => flash(linkOf(r.id)),
      );
    else if (a.kind === "duplicate") void duplicate(r);
    else if (a.kind === "move") void patch(r.id, { status: a.status });
    else if (a.kind === "delete") void remove(r.id);
  };

  async function exportGroup(g: Group, ids: string[]) {
    flash(`Đang xuất nhóm “${g.label}”…`);
    const res = await fetch("/api/records/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ object: obj.key, ids, label: g.label }) });
    if (!res.ok) return flash((await res.json().catch(() => ({}))).error ?? "Không xuất được");
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${obj.key}.xlsx`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(`Đã xuất ${ids.length} mục nhóm “${g.label}”`);
  }

  const ext = useMemo<RowExt>(
    () => ({
      rowH: ROW_HEIGHT[density],
      tintOf: (r) => (colorRules.length ? tintOf(r, colorRules, obj) : null),
      onRowMenu: (r, x, y) => setRowMenu({ r, x, y }),
      onExportGroup: canExport ? (g, ids) => void exportGroup(g, ids) : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [density, colorRules, obj, canExport],
  );

  const total = records.length || 1;
  const opened = records.find((r) => r.id === openId) ?? null;
  const filterCount = filters.filter((f) => f.op === "empty" || f.op === "not_empty" || f.value !== "").length;

  const tabs: [View, string, string][] = [
    ["table", "Bảng chính", "table"],
    ["kanban", "Kanban", "kanban"],
    ...(dateFields.length ? ([["calendar", "Lịch", "calendar"]] as [View, string, string][]) : []),
    ["gantt", "Gantt", "gantt"],
    ["chart", "Biểu đồ", "chart"],
  ];

  return (
    <div className="canvas px-4 pb-40 pt-5 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight">{obj.label}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{obj.description}</p>
        </div>
        <div className="flex h-2 w-56 max-w-full overflow-hidden rounded-full bg-line-soft" title="Tỉ lệ theo trạng thái">
          {obj.statuses.map((s) => {
            const n = records.filter((r) => r.status === s.key).length;
            return n ? <span key={s.key} style={{ width: `${(n / total) * 100}%`, background: color(s.color).bg }} title={`${s.label}: ${n}`} /> : null;
          })}
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-line-soft" role="tablist" aria-label="Kiểu xem">
        {tabs.map(([k, label, icon]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`-mb-px flex h-9 flex-none items-center gap-1.5 border-b-2 px-3 text-[14px] ${view === k ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
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
          <input id="board-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm" className="input h-8 w-44 pl-8 max-sm:w-36" />
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
        <FilterMenu
          fields={fields}
          filters={filters}
          mode={mode}
          onChange={(f, m) => {
            setFilters(f);
            setMode(m);
            savePref({ filters: f, mode: m });
          }}
        />
        <label className="btn-ghost">
          <Icon name="sort" size={16} />
          <select
            id="board-sort"
            value={colSort ? "col" : sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setColSort(null);
              savePref({ colSort: null });
            }}
            className="bg-transparent text-[14px] outline-none"
            aria-label="Sắp xếp"
          >
            {colSort && <option value="col">{colSort.dir === "asc" ? "↑" : "↓"} {allCols.find((c) => colKey(c) === colSort.col)?.label ?? colSort.col}</option>}
            <option value="new">Mới nhất</option>
            <option value="name">Theo tên</option>
            {isDeals && <option value="amount">Giá trị cao</option>}
            {isContacts && <option value="score">Điểm AI cao</option>}
          </select>
        </label>
        {(view === "table" || view === "gantt") && (
          <label className="btn-ghost">
            <Icon name="board" size={16} />
            <select
              id="board-group"
              value={groupBy}
              onChange={(e) => {
                const g = e.target.value as GroupBy;
                setGroupBy(g);
                savePref({ groupBy: g });
              }}
              className="bg-transparent text-[14px] outline-none"
              aria-label="Nhóm theo"
            >
              <option value="status">Nhóm theo {obj.statusLabel.toLowerCase()}</option>
              <option value="owner">Nhóm theo người phụ trách</option>
              {groupableFields(obj).map((f) => (
                <option key={f.key} value={`f:${f.key}`}>
                  Nhóm theo {f.label.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        )}
        {view === "table" && <ColumnsMenu cols={allCols} hidden={hidden} onChange={(h) => { setHidden(h); writeLS(`board-cols:${obj.key}`, h); }} />}
        {view === "table" && (
          <ViewOptions
            density={density}
            rules={colorRules}
            fields={fields}
            onDensity={(d) => {
              setDensity(d);
              writeLS(`board-density:${obj.key}`, d);
            }}
            onRules={(r) => {
              setColorRules(r);
              writeLS(`board-colors:${obj.key}`, r);
            }}
          />
        )}
        {(q || owner || filterCount > 0) && (
          <button type="button" className="btn-ghost text-primary" onClick={() => { setQ(""); setOwner(""); setFilters([]); savePref({ filters: [] }); }}>
            Xoá lọc · {shown.length} mục
          </button>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn-ghost" onClick={() => setActivityOpen(true)}>
            <Icon name="history" size={16} /> <span className="max-sm:hidden">Nhật ký</span>
          </button>
          {canImport && (
            <button type="button" className="btn-ghost" onClick={() => setImporting(true)}>
              <Icon name="upload" size={16} /> <span className="max-sm:hidden">Nhập</span>
            </button>
          )}
          {canExport && (
            <a className="btn-ghost" href={`/api/records/export?object=${obj.key}`}>
              <Icon name="download" size={16} /> <span className="max-sm:hidden">Xuất Excel</span>
            </a>
          )}
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

      {!records.length && (
        <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-10 text-center">
          <p className="text-[16px] font-semibold">Bảng {obj.label.toLowerCase()} đang trống</p>
          <p className="mt-1 text-ink-2">Bấm “Thêm {obj.itemLabel.toLowerCase()} mới”, gõ vào dòng “+ Thêm” trong nhóm, hoặc nhập từ file Excel/CSV.</p>
        </div>
      )}

      {view === "calendar" && calField ? (
        <CalendarView rows={shown} obj={obj} fieldKey={calField} onOpen={setOpenId} onMove={(id, d) => void patch(id, { data: { [calField]: d } }).then((ok) => ok && flash("Đã dời lịch"))} onFieldChange={setCalField} />
      ) : view === "gantt" ? (
        <GanttView obj={obj} team={team} rows={shown} groupBy={groupBy} onPatch={(id, b) => void patch(id, b).then((ok) => ok && flash("Đã cập nhật ngày"))} onOpen={setOpenId} />
      ) : view === "chart" ? (
        <ChartView obj={obj} team={team} rows={shown} />
      ) : view === "kanban" ? (
        <KanbanView obj={obj} rows={shown} onMove={(id, st) => void patch(id, { status: st })} onOpen={setOpenId} onAdd={(t, st) => void create(t, st)} />
      ) : records.length ? (
        <>
          {shown.length === 0 && <p className="mt-6 text-center text-ink-2">Không có mục nào khớp bộ lọc.</p>}
          <TableView obj={obj} team={team} groups={groups} rows={shown} cols={cols} selected={selected} onSelect={onSelect} onPatch={onPatch} onCreate={createIn} onOpen={setOpenId} sort={colSort} onColumn={onColumn} canGroup={canGroup} canFilter={canFilter} ext={ext} />
        </>
      ) : null}

      {selected.size > 0 && view === "table" && (
        <BulkBar
          obj={obj}
          team={team}
          count={selected.size}
          canDelete={canDelete}
          onStatus={(k) => bulkPatch({ status: k }, `Đã chuyển sang “${obj.statuses.find((s) => s.key === k)?.label}”`)}
          onOwner={(n) => bulkPatch({ ownerName: n }, n ? `Đã giao cho ${n}` : "Đã bỏ người phụ trách")}
          onDelete={bulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      {rowMenu && <RowMenu obj={obj} record={rowMenu.r} x={rowMenu.x} y={rowMenu.y} canDelete={canDelete} onAction={(a) => onRowAction(rowMenu.r, a)} onClose={() => setRowMenu(null)} />}
      {activityOpen && (
        <BoardActivity
          obj={obj}
          trashHref={canDelete ? `/w/trash?object=${obj.key}` : undefined}
          onClose={() => setActivityOpen(false)}
          onOpen={(id) => {
            if (records.some((r) => r.id === id)) {
              setActivityOpen(false);
              setOpenId(id);
            } else flash("Mục này đã bị xoá hoặc bạn không được xem");
          }}
        />
      )}
      {opened && <ItemPanel obj={obj} team={team} record={opened} onClose={() => setOpenId(null)} onPatch={(b) => void patch(opened.id, b)} onDelete={() => remove(opened.id)} canDelete={canDelete} />}
      {toast && (
        <div role="status" className={`fixed left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#323338] px-4 py-2.5 text-[14px] text-white shadow-panel ${selected.size && view === "table" ? "bottom-24" : "bottom-6"}`}>
          <span className="flex items-center gap-3">
            {toast}
            {undo && (
              <>
                <button type="button" className="font-semibold text-[#8fc7ff] hover:underline" onClick={() => void undoDelete(undo)}>
                  Hoàn tác
                </button>
                <a href={`/w/trash?object=${obj.key}`} className="text-white/70 hover:text-white hover:underline">
                  Thùng rác
                </a>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
