import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { recordScope } from "@/lib/permissions";
import { STAGES, loadFunnel, parseRange, type GroupRow } from "@/lib/marketing/funnel";
import { Icon } from "@/components/Icon";

type SP = Promise<{ from?: string; to?: string; by?: string }>;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const COLORS = ["#579bfc", "#0086c0", "#a25ddc", "#00c875", "#fdab3d"];
const monthVi = (m: string) => `T${Number(m.slice(5))}/${m.slice(0, 4)}`;

export default async function FunnelPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, workspace, config } = await requireApp();
  const { from, to } = parseRange(sp.from, sp.to);
  const by = sp.by === "source" ? "source" : "channel";
  const scope = await recordScope({ user, workspace });
  const f = await loadFunnel(workspace.id, config, from, to, scope);
  const top = f.stages[0].count || 1;
  const rows: GroupRow[] = by === "source" ? f.bySource : f.byChannel;
  const q = (p: Record<string, string>) => `/w/funnel?${new URLSearchParams({ from: ymd(from), to: ymd(to), by, ...p })}`;
  const preset = (days: number) => q({ from: ymd(new Date(Date.now() - days * 864e5)), to: ymd(new Date()) });

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Phễu chuyển đổi</h1>
      <p className="mt-1 max-w-3xl text-ink-2">Từ khách mới tới chốt và mua lại: biết mỗi kênh rơi rớt ở bước nào, khách tháng nào chốt nhanh nhất.</p>

      <form className="mt-4 flex flex-wrap items-end gap-2" action="/w/funnel">
        <input type="hidden" name="by" value={by} />
        <label className="grid gap-1">
          <span className="label">Từ ngày</span>
          <input type="date" name="from" defaultValue={ymd(from)} className="input w-[150px]" />
        </label>
        <label className="grid gap-1">
          <span className="label">Đến ngày</span>
          <input type="date" name="to" defaultValue={ymd(to)} className="input w-[150px]" />
        </label>
        <button type="submit" className="btn-outline h-9">
          Xem
        </button>
        <div className="flex flex-wrap gap-1">
          {[30, 90, 180, 365].map((d) => (
            <Link key={d} href={preset(d)} className="chip h-9">
              {d} ngày
            </Link>
          ))}
        </div>
      </form>

      <section className="card mt-5 p-4 sm:p-5">
        <h2 className="section-title">Phễu {f.stages[0].count} khách mới</h2>
        {!f.stages[0].count && <p className="mt-3 text-[13.5px] text-ink-2">Không có khách nào được tạo trong khoảng này.</p>}
        <ol className="mt-3 grid gap-2.5">
          {f.stages.map((s, i) => (
            <li key={s.key} className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)_150px] sm:items-center sm:gap-3">
              <span className="text-[14px] font-medium">{s.label}</span>
              <div className="h-8 min-w-0 overflow-hidden rounded bg-surface-2">
                <div className="flex h-full items-center rounded px-2 text-[13px] font-semibold text-white tnum" style={{ width: `${Math.max(3, (s.count / top) * 100)}%`, background: COLORS[i] }}>
                  {s.count}
                </div>
              </div>
              <span className="text-[12.5px] text-ink-2 tnum">
                {i === 0 ? "100%" : `${s.ofTotal}% tổng`}
                {s.stepRate !== null && <span className="ml-1.5 font-medium text-ink">↓ {s.stepRate}% bước</span>}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-ink-2">Đã liên hệ: có cuộc gọi, tin đã gửi, hội thoại hoặc ghi chú của nhân viên. Có giao dịch: có mục bán hàng gắn với khách. Mua lại: từ 2 mục thắng hoặc 2 đơn hàng.</p>
      </section>

      <section className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Theo {by === "source" ? "nguồn" : "kênh"}</h2>
          <div className="segmented">
            <Link href={q({ by: "channel" })} aria-pressed={by === "channel"}>
              Kênh
            </Link>
            <Link href={q({ by: "source" })} aria-pressed={by === "source"}>
              Nguồn
            </Link>
          </div>
        </div>
        <div className="card mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
                <th className="px-3 py-2 font-medium">{by === "source" ? "Nguồn" : "Kênh"}</th>
                {STAGES.map(([k, l]) => (
                  <th key={k} className="px-3 py-2 text-right font-medium">
                    {l}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Tỉ lệ chốt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line-soft last:border-0">
                  <td className="max-w-[200px] truncate px-3 py-2 font-medium">{r.label}</td>
                  {STAGES.map(([k]) => (
                    <td key={k} className="px-3 py-2 text-right tnum">
                      {r.counts[k]}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tnum">{r.winRate}%</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-ink-2">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="section-title">Cohort theo tháng: % khách đã chốt sau N tháng</h2>
        <div className="card mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
                <th className="px-3 py-2 font-medium">Tháng đầu</th>
                <th className="px-3 py-2 text-right font-medium">Khách</th>
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <th key={k} className="px-3 py-2 text-center font-medium">
                    {k === 0 ? "Tháng 0" : `+${k}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.cohorts.map((c) => (
                <tr key={c.month} className="border-b border-line-soft last:border-0">
                  <td className="px-3 py-1.5 font-medium">{monthVi(c.month)}</td>
                  <td className="px-3 py-1.5 text-right tnum">{c.size}</td>
                  {c.cells.map((v, k) => (
                    <td key={k} className="px-1 py-1">
                      {v === null ? (
                        <span className="block h-7" />
                      ) : (
                        <span className="grid h-7 place-items-center rounded tnum text-[12.5px] font-medium" style={{ background: `rgba(0, 200, 117, ${0.08 + (v / 100) * 0.8})`, color: v > 55 ? "#fff" : "var(--ink)" }}>
                          {v}%
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {!f.cohorts.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-ink-2">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[12px] text-ink-2">
          <Icon name="clock" size={13} /> Ngày chốt lấy theo lần cập nhật cuối của mục bán hàng đã thắng. Số cộng dồn.
        </p>
      </section>
    </div>
  );
}
