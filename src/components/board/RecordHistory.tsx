"use client";

import { useEffect, useMemo, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { ago, vnd } from "@/lib/format";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";

type Entry = { id: string; action: string; userName: string; summary: string; createdAt: string; diff: unknown };
type Change = { key: string; from: unknown; to: unknown };

/** Tab "Lịch sử" trong khung chi tiết: ai đổi ô nào, từ giá trị gì sang giá trị gì (giống Activity Log). */
export function RecordHistory({ obj, recordId, version }: { obj: ObjectDef; recordId: string; version: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [who, setWho] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/records/${recordId}/history`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) setEntries(j.entries);
        else setError(j.error ?? "Không tải được lịch sử");
      })
      .catch(() => live && setError("Không tải được lịch sử"));
    return () => {
      live = false;
    };
  }, [recordId, version]);

  const label = (k: string) => {
    if (k === "title") return obj.itemLabel;
    if (k === "status") return obj.statusLabel;
    if (k === "ownerName") return "Phụ trách";
    if (k === "amount") return obj.amountLabel || "Giá trị";
    if (k.startsWith("data.")) return obj.fields.find((f) => f.key === k.slice(5))?.label ?? k.slice(5);
    return k;
  };
  const people = useMemo(() => [...new Set((entries ?? []).map((e) => e.userName))], [entries]);
  const shown = (entries ?? []).filter((e) => !who || e.userName === who);

  if (error) return <p className="py-6 text-center text-ink-2">{error}</p>;
  if (!entries) return <div className="h-24 animate-pulse rounded-lg bg-surface" />;
  if (!entries.length) return <p className="py-6 text-center text-ink-2">Chưa có thay đổi nào được ghi lại cho mục này.</p>;

  return (
    <div className="grid gap-3">
      {people.length > 1 && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <Icon name="person" size={15} />
          <select aria-label="Lọc theo người sửa" value={who} onChange={(e) => setWho(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-ink">
            <option value="">Mọi người</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      )}
      <ol className="grid gap-2">
        {shown.map((e) => {
          const changes = changesOf(e);
          return (
            <li key={e.id} className="rounded-lg bg-surface px-4 py-3">
              <div className="flex items-center gap-2.5 text-[13px]">
                <Avatar name={e.userName} size={26} />
                <b className="text-[14px]">{e.userName}</b>
                <span className="text-ink-2">{e.action === "record.create" ? "đã tạo mục" : `đã sửa ${changes.length} ô`}</span>
                <span className="ml-auto flex-none text-[12px] text-ink-2" suppressHydrationWarning title={new Date(e.createdAt).toLocaleString("vi-VN")}>
                  {ago(e.createdAt)}
                </span>
              </div>
              {e.action === "record.update" && changes.length > 0 && (
                <ul className="mt-2 grid gap-1.5 pl-[36px]">
                  {changes.map((c) => (
                    <li key={c.key} className="grid grid-cols-[minmax(90px,140px)_minmax(0,1fr)] items-center gap-2 text-[13px]">
                      <span className="truncate text-ink-2">{label(c.key)}</span>
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Val obj={obj} k={c.key} v={c.from} old />
                        <span className="text-ink-2" aria-label="thành">→</span>
                        <Val obj={obj} k={c.key} v={c.to} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function changesOf(e: Entry): Change[] {
  if (e.action !== "record.update" || !e.diff || typeof e.diff !== "object") return [];
  return Object.entries(e.diff as Record<string, unknown>)
    .filter(([, v]) => Array.isArray(v) && v.length === 2)
    .map(([key, v]) => ({ key, from: (v as unknown[])[0], to: (v as unknown[])[1] }));
}

/** Hiện một giá trị cũ/mới: trạng thái và lựa chọn thành nhãn màu, tiền thành VNĐ. */
function Val({ obj, k, v, old }: { obj: ObjectDef; k: string; v: unknown; old?: boolean }) {
  const empty = v === null || v === undefined || v === "";
  if (empty) return <span className="text-[12.5px] italic text-ink-2">trống</span>;
  const opts = k === "status" ? obj.statuses : k.startsWith("data.") ? obj.fields.find((f) => f.key === k.slice(5) && f.type === "select")?.options : undefined;
  const opt = opts?.find((o) => o.key === v || o.label === v);
  if (opt)
    return (
      <span className={`max-w-[180px] truncate rounded px-2 py-0.5 text-[12.5px] text-white ${old ? "opacity-60" : ""}`} style={{ background: color(opt.color).bg }}>
        {opt.label}
      </span>
    );
  const money = k === "amount" || (k.startsWith("data.") && obj.fields.find((f) => f.key === k.slice(5))?.type === "money");
  const text = money && !isNaN(Number(v)) ? vnd(Number(v)) : String(v);
  return <span className={`max-w-[220px] truncate ${old ? "text-ink-2 line-through decoration-ink-2/40" : "font-medium"}`} title={text}>{text}</span>;
}
