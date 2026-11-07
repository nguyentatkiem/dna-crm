"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { ago } from "@/lib/format";
import { CHART_LABEL, DATASETS, DATASET_LABEL, type ChartType } from "@/lib/reports/shared";

type Row = { id: string; name: string; dataset: string; chart: ChartType; shared: boolean; mine: boolean; canEdit: boolean; owner: string; schedule: string; updatedAt: string };
type Tpl = { key: string; name: string; description: string; icon: string; dataset: string };

const CHART_ICON: Record<ChartType, string> = { table: "table", bar: "chart", line: "trend", pie: "pie", number: "target" };

export function ReportList({ initial, templates, canManage }: { initial: Row[]; templates: Tpl[]; canManage: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"all" | "mine" | "shared">("all");

  async function create(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return toast(d.error ?? "Không tạo được báo cáo", "error");
    if (body.duplicateOf) {
      setRows((rs) => [{ ...rs.find((r) => r.id === body.duplicateOf)!, id: d.id, name: d.name, shared: false, mine: true, canEdit: true, schedule: "", updatedAt: d.updatedAt }, ...rs]);
      return toast(`Đã nhân bản thành “${d.name}”`);
    }
    router.push(`/w/reports/${d.id}`);
  }
  async function remove(r: Row) {
    if (!confirm(`Xoá báo cáo “${r.name}”? Không hoàn tác được.`)) return;
    const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast("Không xoá được báo cáo", "error");
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  }

  const shown = rows.filter((r) => (tab === "mine" ? r.mine : tab === "shared" ? !r.mine : true));

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold">Báo cáo tự tạo</h1>
          <p className="mt-1 max-w-2xl text-ink-2">Chọn nguồn dữ liệu, bộ lọc, nhóm theo và chỉ số — xem trước ngay, lưu lại, chia sẻ cho cả đội hoặc hẹn giờ gửi email. Mỗi người chỉ thấy số liệu trong phạm vi quyền của mình.</p>
        </div>
        {canManage && (
          <details className="relative">
            <summary className="btn-primary cursor-pointer list-none">
              <Icon name="plus" size={16} /> Báo cáo trống
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-panel">
              {DATASETS.map((d) => (
                <Link key={d} href={`/w/reports/new?dataset=${d}`} className="block rounded px-3 py-1.5 text-[14px] hover:bg-hover">
                  {DATASET_LABEL[d]}
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>

      {canManage && (
        <section className="mt-6">
          <h2 className="section-title">Mẫu dựng sẵn</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.key} className="card card-hover flex gap-3 p-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-primary-selected text-primary">
                  <Icon name={t.icon} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{t.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/w/reports/new?template=${t.key}`} className="btn-outline h-7 px-2 text-[13px]">
                      Xem trước
                    </Link>
                    <button className="btn-ghost h-7 px-2 text-[13px]" disabled={!!busy} onClick={() => create({ template: t.key }, t.key)}>
                      {busy === t.key ? "Đang tạo…" : "Lưu ngay"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Báo cáo đã lưu</h2>
          <div className="segmented" role="tablist">
            {(["all", "mine", "shared"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {k === "all" ? "Tất cả" : k === "mine" ? "Của tôi" : "Được chia sẻ"}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon="chart" title="Chưa có báo cáo" desc={canManage ? "Bắt đầu từ một mẫu dựng sẵn ở trên hoặc tạo báo cáo trống." : "Khi quản lý chia sẻ báo cáo cho đội, báo cáo sẽ hiện ở đây."} />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line-soft">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-hover">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-surface-2 text-ink-2" title={CHART_LABEL[r.chart]}>
                  <Icon name={CHART_ICON[r.chart]} size={16} />
                </span>
                <Link href={`/w/reports/${r.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="truncate text-[12.5px] text-ink-2">
                    {r.dataset} · {r.mine ? "Của tôi" : `Của ${r.owner || "thành viên khác"}`} · cập nhật {ago(r.updatedAt)}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.shared && <span className="badge-info">Đã chia sẻ</span>}
                  {r.schedule && (
                    <span className="badge-accent" title={r.schedule}>
                      <Icon name="mail" size={11} /> {r.schedule}
                    </span>
                  )}
                  {canManage && (
                    <button className="btn-ghost h-7 px-2" title="Nhân bản" aria-label={`Nhân bản ${r.name}`} disabled={!!busy} onClick={() => create({ duplicateOf: r.id }, `dup-${r.id}`)}>
                      <Icon name="copy" size={15} />
                    </button>
                  )}
                  {r.canEdit && (
                    <button className="btn-ghost h-7 px-2 text-danger" title="Xoá" aria-label={`Xoá ${r.name}`} onClick={() => remove(r)}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
