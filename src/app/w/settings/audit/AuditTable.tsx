"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ACTION_COLOR, actionLabel, diffRows } from "./shared";

export type Labels = Record<string, { fields: Record<string, string>; statuses: Record<string, string>; item: string }>;
type Row = { id: string; at: string; userName: string; action: string; entity: string; entityId: string; summary: string; diffJson: string };

const ENTITY: Record<string, string> = { member: "Thành viên", settings: "Cài đặt", team: "Đội ngũ", task: "Việc" };

function show(v: unknown) {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v === "number") return v.toLocaleString("vi-VN");
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function AuditTable({ rows, labels }: { rows: Row[]; labels: Labels }) {
  const [open, setOpen] = useState<string | null>(null);
  const fmt = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="card mt-2 overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead className="bg-surface-2 text-left text-[12.5px] text-ink-2">
          <tr>
            <th className="w-40 px-3 py-2 font-medium">Thời gian</th>
            <th className="w-44 px-3 py-2 font-medium">Người</th>
            <th className="w-36 px-3 py-2 font-medium">Hành động</th>
            <th className="w-32 px-3 py-2 font-medium">Đối tượng</th>
            <th className="px-3 py-2 font-medium">Tóm tắt</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line-soft)]">
          {rows.map((r) => {
            const lb = labels[r.entity];
            const diff = diffRows(r.diffJson);
            const isOpen = open === r.id;
            const isRecord = r.action.startsWith("record.") && lb;
            return (
              <Fragment key={r.id}>
                <tr className={`cursor-pointer hover:bg-hover ${isOpen ? "bg-hover" : ""}`} onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2 tnum" suppressHydrationWarning>{fmt(r.at)}</td>
                  <td className="px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={r.userName} size={22} />
                      <span className="truncate">{r.userName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full" style={{ background: ACTION_COLOR(r.action) }} />
                      {actionLabel(r.action)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{lb?.item ?? ENTITY[r.entity] ?? r.entity}</td>
                  <td className="max-w-0 truncate px-3 py-2">{r.summary}</td>
                  <td className="px-2 text-ink-2">{diff.length > 0 && <Icon name="chevron" size={14} className={isOpen ? "rotate-180" : ""} />}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-surface-2">
                    <td colSpan={6} className="px-3 py-3">
                      <p className="mb-2 whitespace-pre-wrap text-[13px]">{r.summary}</p>
                      {diff.length === 0 ? (
                        <p className="text-[13px] text-ink-2">Không có chi tiết thay đổi.</p>
                      ) : (
                        <div className="grid gap-1.5">
                          {diff.map(([k, a, b]) => {
                            const tr = (v: unknown) => (k === "status" && lb ? (lb.statuses[String(v)] ?? show(v)) : show(v));
                            return (
                              <div key={k} className="grid grid-cols-1 gap-1 text-[13px] sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-3">
                                <span className="font-medium text-ink-2">{lb?.fields[k] ?? (k.startsWith("data.") ? k.slice(5) : k)}</span>
                                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  {tr(a) !== "" && <del className="break-all rounded bg-danger-soft px-1.5 py-0.5 text-danger">{tr(a)}</del>}
                                  {tr(a) !== "" && tr(b) !== "" && <span className="text-ink-2" aria-hidden>→</span>}
                                  {tr(b) !== "" && <ins className="break-all rounded bg-success-soft px-1.5 py-0.5 text-success no-underline">{tr(b)}</ins>}
                                  {tr(a) === "" && tr(b) === "" && <span className="text-ink-2">(trống)</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {isRecord && r.action !== "record.delete" && (
                        <Link href={`/w/b/${r.entity}?open=${r.entityId}`} className="mt-3 inline-flex text-[13px] text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          Mở {lb.item.toLowerCase()} này →
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
