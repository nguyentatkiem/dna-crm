"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { ago, vnd } from "@/lib/format";
import type { RfmKey, RfmResult, RfmSummary } from "@/lib/c360/rfm";

type Customer = RfmResult & { title: string; owner: string };
type Props = { summary: RfmSummary[]; customers: Customer[]; totalContacts: number; lastRun: string | null; canRecompute: boolean; canBroadcast: boolean };
type SortKey = "monetary" | "frequency" | "recencyDays";

export function RfmClient({ summary, customers, totalContacts, lastRun, canRecompute, canBroadcast }: Props) {
  const router = useRouter();
  const [sel, setSel] = useState<RfmKey | null>(summary.find((s) => s.count)?.key ?? null);
  const [sort, setSort] = useState<SortKey>("monetary");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; segId?: string } | null>(null);
  const total = customers.length;
  const seg = summary.find((s) => s.key === sel);
  const list = useMemo(() => customers.filter((c) => c.segment === sel).sort((a, b) => (sort === "recencyDays" ? a.recencyDays - b.recencyDays : b[sort] - a[sort])), [customers, sel, sort]);

  async function post(body: object, tag: string) {
    setBusy(tag);
    setMsg(null);
    const r = await fetch("/api/c360/rfm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    return { r, j };
  }

  async function saveSegment() {
    if (!sel) return;
    const { r, j } = await post({ action: "segment", key: sel }, "seg");
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? "Không lưu được nhóm" });
    setMsg({ ok: true, text: `${j.existed ? "Nhóm đã có sẵn" : "Đã lưu nhóm"} “${j.name}” (${j.count} khách). Nhóm tự cập nhật mỗi ngày theo RFM.`, segId: j.id });
    router.refresh();
  }

  async function recompute() {
    const { r, j } = await post({ action: "recompute" }, "re");
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? "Không tính lại được" });
    setMsg({ ok: true, text: `Đã tính lại cho ${j.customers} khách, ${j.changed} khách đổi nhóm.` });
    router.refresh();
  }

  if (!total)
    return (
      <div className="mt-6">
        <EmptyState icon="pie" title="Chưa có đơn hàng để phân tích" desc="Khi khách có đơn hoàn tất hoặc đã thanh toán, RFM sẽ tự chia nhóm. Gắn khách vào đơn để số liệu chính xác." />
      </div>
    );

  return (
    <div className="mt-5 grid gap-5">
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
        <span>
          {total} / {totalContacts} khách đã mua hàng
        </span>
        {lastRun && <span>· Ghi nhóm lên hồ sơ khách {ago(lastRun)}</span>}
        {canRecompute && (
          <button className="btn-outline ml-auto" onClick={recompute} disabled={busy === "re"}>
            <Icon name="refresh" size={14} /> {busy === "re" ? "Đang tính…" : "Tính lại ngay"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summary.map((s) => (
          <button key={s.key} type="button" aria-pressed={sel === s.key} onClick={() => (setSel(s.key), setMsg(null))} className={`card card-hover min-w-0 p-3 text-left ${sel === s.key ? "ring-2 ring-primary" : ""}`}>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
              <span className="truncate font-medium">{s.label}</span>
            </span>
            <span className="mt-1 block font-title text-[24px] font-semibold tnum">{s.count}</span>
            <span className="block truncate text-[12px] text-ink-2">
              {Math.round(s.share * 100)}% doanh thu · {vnd(s.revenue)}
            </span>
            <span className="block truncate text-[12px] text-ink-2">{s.count ? `Mua cuối TB ${s.avgRecency} ngày trước` : "—"}</span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line-soft">
              <span className="block h-full rounded-full" style={{ width: `${Math.round((s.count / total) * 100)}%`, background: s.color }} />
            </span>
          </button>
        ))}
      </div>

      {seg && (
        <section className="card p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                <span className="h-3 w-3 rounded-full" style={{ background: seg.color }} /> {seg.label} · {seg.count} khách
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-2">{seg.hint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={saveSegment} disabled={busy === "seg" || !seg.count}>
                <Icon name="segment" size={15} /> {busy === "seg" ? "Đang lưu…" : "Lưu thành nhóm khách"}
              </button>
              {canBroadcast && msg?.segId && (
                <Link className="btn-outline" href={`/w/broadcasts/new?segment=${msg.segId}`}>
                  <Icon name="megaphone" size={15} /> Gửi hàng loạt
                </Link>
              )}
            </div>
          </div>
          {msg && (
            <p role="status" className={`mt-3 rounded-md px-3 py-2 text-[13px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
              {msg.text}
            </p>
          )}
          {list.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="text-left text-ink-2">
                    <th className="py-1.5 pr-3 font-normal">Khách</th>
                    <th className="py-1.5 pr-3 font-normal">R-F-M</th>
                    {(
                      [
                        ["recencyDays", "Mua cuối"],
                        ["frequency", "Số đơn"],
                        ["monetary", "Chi tiêu"],
                      ] as [SortKey, string][]
                    ).map(([k, l]) => (
                      <th key={k} className="py-1.5 pr-3 font-normal">
                        <button type="button" onClick={() => setSort(k)} className={`inline-flex items-center gap-1 ${sort === k ? "font-medium text-ink" : ""}`}>
                          {l} {sort === k && <Icon name="sort" size={12} />}
                        </button>
                      </th>
                    ))}
                    <th className="py-1.5 pr-3 font-normal">Phụ trách</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 300).map((c) => (
                    <tr key={c.id} className="border-t border-line-soft">
                      <td className="py-1.5 pr-3">
                        <Link href={`/w/b/contacts?open=${c.id}`} className="font-medium hover:text-primary hover:underline">
                          {c.title}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 tnum">
                        {c.r}-{c.f}-{c.m}
                      </td>
                      <td className="py-1.5 pr-3 tnum">{c.recencyDays} ngày</td>
                      <td className="py-1.5 pr-3 tnum">{c.frequency}</td>
                      <td className="py-1.5 pr-3 tnum">{vnd(c.monetary)}</td>
                      <td className="py-1.5 pr-3 text-ink-2">{c.owner || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length > 300 && <p className="mt-2 text-[12px] text-ink-2">Hiện 300 / {list.length} khách. Lưu thành nhóm khách để xem đủ trên bảng.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
