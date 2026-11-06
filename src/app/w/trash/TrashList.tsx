"use client";

import { useMemo, useState } from "react";
import type { Option } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { ago, vnd } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";

type Item = { id: string; objectKey: string; title: string; status: string; ownerName: string; amount: number; deletedAt: string; deletedBy: string; createdAt: string };
type Board = { key: string; label: string; item: string; amountLabel: string; statuses: Option[] };

export function TrashList({ initial, boards, days, initialObject }: { initial: Item[]; boards: Board[]; days: number; initialObject: string }) {
  const [items, setItems] = useState(initial);
  const [object, setObject] = useState(initialObject);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState<"purge" | "empty" | null>(null);

  const shown = useMemo(() => items.filter((i) => (!object || i.objectKey === object) && (!q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()))), [items, object, q]);
  const board = (k: string) => boards.find((b) => b.key === k);
  const left = (d: string) => Math.max(0, days - Math.floor((Date.now() - new Date(d).getTime()) / 864e5));

  async function run(action: "restore" | "purge" | "empty", ids: string[]) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setConfirm(null);
    if (!res.ok) return setMsg(j.error ?? "Không thực hiện được");
    const gone = action === "empty" ? new Set(items.map((i) => i.id)) : new Set(ids);
    setItems((xs) => xs.filter((x) => !gone.has(x.id)));
    setSel(new Set());
    setMsg(action === "restore" ? `Đã khôi phục ${j.restored} mục về bảng` : `Đã xoá vĩnh viễn ${j.purged} mục`);
  }

  const allOn = shown.length > 0 && shown.every((i) => sel.has(i.id));
  const toggle = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <div className="mt-5 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong thùng rác" aria-label="Tìm trong thùng rác" className="input h-8 w-56 pl-8 max-sm:w-full" />
        </label>
        <label className="btn-ghost">
          <Icon name="board" size={16} />
          <select aria-label="Lọc theo bảng" value={object} onChange={(e) => setObject(e.target.value)} className="bg-transparent outline-none">
            <option value="">Mọi bảng</option>
            {boards.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[13px] text-ink-2">{shown.length} mục</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {sel.size > 0 && (
            <>
              <button type="button" className="btn-primary h-8" disabled={busy} onClick={() => run("restore", [...sel])}>
                <Icon name="refresh" size={15} /> Khôi phục {sel.size} mục
              </button>
              {confirm === "purge" ? (
                <span className="flex items-center gap-1 text-[13px]">
                  Xoá vĩnh viễn {sel.size} mục?
                  <button type="button" className="btn h-8 bg-[#df2f4a] text-white hover:brightness-95" disabled={busy} onClick={() => run("purge", [...sel])}>
                    Xoá hẳn
                  </button>
                  <button type="button" className="btn-ghost h-8" onClick={() => setConfirm(null)}>
                    Huỷ
                  </button>
                </span>
              ) : (
                <button type="button" className="btn-ghost h-8 text-[#df2f4a]" onClick={() => setConfirm("purge")}>
                  <Icon name="trash" size={15} /> Xoá vĩnh viễn
                </button>
              )}
            </>
          )}
          {items.length > 0 &&
            sel.size === 0 &&
            (confirm === "empty" ? (
              <span className="flex items-center gap-1 text-[13px]">
                Xoá hẳn toàn bộ {items.length} mục? Không hoàn tác được.
                <button type="button" className="btn h-8 bg-[#df2f4a] text-white hover:brightness-95" disabled={busy} onClick={() => run("empty", [])}>
                  Dọn sạch
                </button>
                <button type="button" className="btn-ghost h-8" onClick={() => setConfirm(null)}>
                  Huỷ
                </button>
              </span>
            ) : (
              <button type="button" className="btn-outline h-8 text-[#df2f4a]" onClick={() => setConfirm("empty")}>
                Dọn sạch thùng rác
              </button>
            ))}
        </span>
      </div>
      {msg && (
        <p role="status" className="text-[13.5px] text-ink-2">
          {msg}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="card grid place-items-center gap-2 p-12 text-center">
          <Icon name="trash" size={30} className="text-ink-2" />
          <p className="font-medium">{items.length ? "Không có mục nào khớp" : "Thùng rác trống"}</p>
          <p className="max-w-md text-[13.5px] text-ink-2">Khi bạn xoá khách, giao dịch hay lịch hẹn, chúng sẽ nằm ở đây {days} ngày để bạn khôi phục nếu lỡ tay.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[13px] text-ink-2">
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" aria-label="Chọn tất cả" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((i) => i.id)) : new Set())} className="h-4 w-4 accent-[var(--primary)]" />
                </th>
                <th className="px-2 py-2.5 font-normal">Mục</th>
                <th className="px-2 py-2.5 font-normal">Bảng</th>
                <th className="px-2 py-2.5 font-normal">Trạng thái</th>
                <th className="px-2 py-2.5 font-normal">Người xoá</th>
                <th className="px-2 py-2.5 font-normal">Còn lại</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const b = board(i.objectKey);
                const st = b?.statuses.find((s) => s.key === i.status);
                const d = left(i.deletedAt);
                return (
                  <tr key={i.id} className={`border-b border-line-soft last:border-0 ${sel.has(i.id) ? "bg-primary-selected" : "hover:bg-[var(--row-hover)]"}`}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" aria-label={`Chọn ${i.title}`} checked={sel.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                    </td>
                    <td className="max-w-[280px] px-2 py-2.5">
                      <p className="truncate font-medium">{i.title}</p>
                      {b?.amountLabel && i.amount > 0 && <p className="text-[12.5px] text-ink-2 tnum">{vnd(i.amount)}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-ink-2">{b?.label ?? i.objectKey}</td>
                    <td className="px-2 py-2.5">
                      {st && (
                        <span className="rounded px-2 py-0.5 text-[12.5px]" style={{ background: color(st.color).bg, color: color(st.color).fg }}>
                          {st.label}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2 text-[13px]">
                        <Avatar name={i.deletedBy} size={22} />
                        <span>
                          {i.deletedBy || "–"}
                          <span className="block text-[12px] text-ink-2" suppressHydrationWarning>
                            {ago(i.deletedAt)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={`px-2 py-2.5 text-[13px] tnum ${d <= 3 ? "font-medium text-[#df2f4a]" : "text-ink-2"}`}>{d} ngày</td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" className="btn-outline h-7 text-[13px]" disabled={busy} onClick={() => run("restore", [i.id])}>
                        Khôi phục
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
