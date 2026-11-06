"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { EmptyState, Segmented, Stat, toast } from "@/components/ui";
import { DAY_SHORT, fmtDuration } from "@/lib/chat/hours";
import { RANGE_LABEL, type RangePreset } from "@/lib/chat/metrics";
import type { StatsResponse } from "@/lib/chat/stats";

const DailyChart = dynamic(() => import("./StatsCharts").then((m) => m.DailyChart), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-surface-2" /> });
const TagDailyChart = dynamic(() => import("./StatsCharts").then((m) => m.TagDailyChart), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-surface-2" /> });

const CHANNEL_LABEL: Record<string, string> = { messenger: "Messenger", facebook: "Facebook", instagram: "Instagram", zalo: "Zalo" };
const TAG_HEX: Record<string, string> = { green: "#00c875", orange: "#fdab3d", red: "#e2445c", blue: "#579bfc", purple: "#a25ddc", darkblue: "#0086c0", grass: "#037f4c", sky: "#66ccff", berry: "#bb3354", pink: "#ff5ac4", yellow: "#ffcb00", gray: "#a0a0a0" };
const PALETTE = ["#579bfc", "#00c875", "#fdab3d", "#a25ddc", "#e2445c", "#0086c0"];
const PRESETS: RangePreset[] = ["today", "7d", "30d", "month", "custom"];
const n = (x: number) => x.toLocaleString("vi-VN");
const humanTag = (k: string) => k.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

type Filters = { range: RangePreset; from: string; to: string; page: string; channel: string; kind: string };

function qs(f: Filters) {
  const u = new URLSearchParams({ range: f.range });
  if (f.range === "custom") {
    u.set("from", f.from);
    u.set("to", f.to);
  }
  if (f.page) u.set("page", f.page);
  if (f.channel) u.set("channel", f.channel);
  if (f.kind) u.set("kind", f.kind);
  return u.toString();
}

export function InboxStatsClient({ initial }: { initial: StatsResponse }) {
  const [s, setS] = useState(initial);
  const [f, setF] = useState<Filters>({ range: initial.preset, from: initial.fromDay, to: initial.toDay, page: "", channel: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  async function load(next: Filters) {
    setF(next);
    if (next.range === "custom" && (!next.from || !next.to)) return;
    const my = ++seq.current;
    setLoading(true);
    const r = await fetch(`/api/inbox/stats?${qs(next)}`).catch(() => null);
    if (my !== seq.current) return;
    setLoading(false);
    if (!r?.ok) return toast("Không tải được thống kê", "error");
    const j = (await r.json()) as StatsResponse;
    setS(j);
    try {
      window.history.replaceState(null, "", `?${qs(next)}`);
    } catch {
      /* bỏ qua */
    }
  }

  const tagInfo = useMemo(() => {
    const m = new Map(s.tagInfo.map((t) => [t.key, { name: t.name, color: TAG_HEX[t.color] ?? t.color }]));
    return (key: string, i = 0) => m.get(key) ?? { name: humanTag(key), color: PALETTE[i % PALETTE.length] };
  }, [s.tagInfo]);
  const pageName = (pageId: string, channel: string) => (pageId ? (s.pages.find((p) => p.pageId === pageId)?.name ?? `Trang ${pageId.slice(-6)}`) : (CHANNEL_LABEL[channel] ?? channel));
  const o = s.overview;
  const heatMax = Math.max(1, ...s.heatmap.flat());
  const topTagKeys = s.tagDaily[0] ? Object.keys(s.tagDaily[0].counts) : [];
  const empty = o.activeConvs === 0;

  return (
    <div className={`mt-5 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {/* Bộ lọc */}
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div className="grid gap-1">
          <span className="label">Khoảng thời gian</span>
          <Segmented label="Khoảng thời gian" options={PRESETS.map((k) => ({ key: k, label: RANGE_LABEL[k] }))} value={f.range} onChange={(k) => load({ ...f, range: k })} className="max-w-full overflow-x-auto [&>button]:whitespace-nowrap" />
        </div>
        {f.range === "custom" && (
          <div className="flex items-end gap-2">
            <label className="grid gap-1">
              <span className="label">Từ ngày</span>
              <input type="date" className="input !w-40" value={f.from} max={f.to || undefined} onChange={(e) => load({ ...f, from: e.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="label">Đến ngày</span>
              <input type="date" className="input !w-40" value={f.to} min={f.from || undefined} onChange={(e) => load({ ...f, to: e.target.value })} />
            </label>
          </div>
        )}
        <label className="grid min-w-[9rem] flex-1 gap-1 sm:flex-none">
          <span className="label">Trang</span>
          <select className="input" value={f.page} onChange={(e) => load({ ...f, page: e.target.value })}>
            <option value="">Tất cả trang</option>
            {s.pages.map((p) => (
              <option key={p.pageId} value={p.pageId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-[8rem] flex-1 gap-1 sm:flex-none">
          <span className="label">Kênh</span>
          <select className="input" value={f.channel} onChange={(e) => load({ ...f, channel: e.target.value })}>
            <option value="">Tất cả kênh</option>
            {s.channels.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-[8rem] flex-1 gap-1 sm:flex-none">
          <span className="label">Loại</span>
          <select className="input" value={f.kind} onChange={(e) => load({ ...f, kind: e.target.value })}>
            <option value="">Tin nhắn + bình luận</option>
            <option value="inbox">Tin nhắn</option>
            <option value="comment">Bình luận</option>
          </select>
        </label>
        <a className="btn-outline sm:ml-auto" href={`/api/inbox/stats?${qs(f)}&format=xlsx`} download>
          <Icon name="download" size={15} /> Xuất Excel
        </a>
      </div>
      {s.truncated && <p className="mt-2 text-[13px] text-[#d83a52]">Dữ liệu quá lớn, chỉ tính trên phần gần nhất. Hãy chọn khoảng ngắn hơn.</p>}

      {/* Tổng quan */}
      <h2 className="section-title mt-6">Tổng quan</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hội thoại mới" value={n(o.newConvs)} hint={`${n(o.activeConvs)} hội thoại có hoạt động`} icon="chat" />
        <Stat label="Tin nhắn đến / đi" value={`${n(o.inMsgs)} / ${n(o.outMsgs)}`} hint={`${n(o.sessions)} phiên trả lời`} icon="send" tone="#00c875" />
        <Stat label="Bình luận" value={n(o.comments)} hint={`${n(o.commentReplies)} lượt trả lời bình luận`} icon="feed" tone="#a25ddc" />
        <Stat label="SĐT thu được" value={n(o.phones)} hint={`${Math.round(o.phoneRate * 100)}% hội thoại có SĐT`} icon="phone" tone="#e2445c" />
        <Stat label="Đang chờ trả lời" value={n(o.unanswered)} hint="Tin cuối là của khách" icon="clock" tone="#fdab3d" href="/w/inbox" />
        <Stat label="Phản hồi đầu tiên" value={fmtDuration(o.medianFirstResponseMs)} hint="Trung vị, trong giờ làm việc" icon="bolt" tone="#0086c0" />
        <Stat label="Phản hồi mọi phiên" value={fmtDuration(o.medianResponseMs)} hint="Trung vị, trong giờ làm việc" icon="trend" tone="#0086c0" />
        <Stat label="Trung bình phản hồi đầu" value={fmtDuration(o.avgFirstResponseMs)} hint="Bị kéo dài bởi vài ca chậm" icon="history" tone="#a0a0a0" />
      </div>

      {empty ? (
        <div className="card mt-5">
          <EmptyState icon="chart" title="Chưa có hội thoại trong khoảng này" desc="Chọn khoảng thời gian dài hơn hoặc bỏ bớt bộ lọc." />
        </div>
      ) : (
        <>
          <section className="card mt-5 p-4" aria-labelledby="h-daily">
            <h2 id="h-daily" className="section-title">
              Theo ngày
            </h2>
            <div className="mt-3 h-[260px]">
              <DailyChart daily={s.daily} />
            </div>
          </section>

          <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
            {/* Theo nhân viên */}
            <section className="card min-w-0 p-4" aria-labelledby="h-staff">
              <h2 id="h-staff" className="section-title">
                {s.full ? "Theo nhân viên" : "Của bạn"}
              </h2>
              {s.byStaff.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] whitespace-nowrap text-[13.5px]">
                    <thead className="text-left text-[12px] text-ink-2">
                      <tr className="border-b border-line">
                        <th className="py-2 pr-2 font-medium">Nhân viên</th>
                        <th className="px-2 text-right font-medium">Tin đã gửi</th>
                        <th className="px-2 text-right font-medium">Trả lời bình luận</th>
                        <th className="px-2 text-right font-medium" title="Một phiên = khách nhắn, nhân viên trả lời">
                          Phiên trả lời
                        </th>
                        <th className="px-2 text-right font-medium">Phản hồi TB</th>
                        <th className="px-2 text-right font-medium">Trung vị</th>
                        <th className="px-2 text-right font-medium">SĐT mang về</th>
                        <th className="px-2 text-right font-medium">Hội thoại</th>
                        <th className="pl-2 text-right font-medium">Chất lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.byStaff.map((r) => (
                        <tr key={r.name} className="border-b border-line-soft last:border-0">
                          <td className="py-2 pr-2">
                            <span className="flex items-center gap-2 font-medium">
                              <Avatar name={r.name} size={22} />
                              {r.name}
                            </span>
                          </td>
                          <td className="px-2 text-right tnum">{n(r.sent)}</td>
                          <td className="px-2 text-right tnum">{n(r.commentReplies)}</td>
                          <td className="px-2 text-right tnum">{n(r.sessions)}</td>
                          <td className="px-2 text-right tnum">{fmtDuration(r.avgResponseMs)}</td>
                          <td className="px-2 text-right tnum">{fmtDuration(r.medianResponseMs)}</td>
                          <td className="px-2 text-right tnum">{n(r.phones)}</td>
                          <td className="px-2 text-right tnum">{n(r.convs)}</td>
                          <td className="pl-2 text-right tnum">
                            {r.quality == null ? (
                              "—"
                            ) : (
                              <span className={r.quality >= 80 ? "badge-success" : r.quality >= 60 ? "badge-warning" : "badge-danger"} title={`Trung bình ${r.qualityN} hội thoại`}>
                                {r.quality}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-ink-2">Chưa có nhân viên nào trả lời trong khoảng này.</p>
              )}
            </section>

            {/* Top phản hồi nhanh */}
            <section className="card h-fit p-4" aria-labelledby="h-fast">
              <h2 id="h-fast" className="section-title">
                Top 5 phản hồi nhanh nhất
              </h2>
              <ol className="mt-3 grid gap-2">
                {s.fastest.map((x, i) => (
                  <li key={x.name} className="flex items-center gap-2">
                    <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[12px] font-semibold ${i === 0 ? "bg-[#ffcb00] text-[#323338]" : "bg-surface-2"}`}>{i + 1}</span>
                    <Avatar name={x.name} size={22} />
                    <span className="min-w-0 flex-1 truncate font-medium">{x.name}</span>
                    <span className="text-right text-[13px] tnum">
                      {fmtDuration(x.medianResponseMs)}
                      <span className="block text-[11.5px] text-ink-2">{n(x.sessions)} phiên</span>
                    </span>
                  </li>
                ))}
                {!s.fastest.length && <li className="text-[13px] text-ink-2">Chưa có phiên trả lời.</li>}
              </ol>
            </section>
          </div>

          {/* Theo trang */}
          <section className="card mt-5 p-4" aria-labelledby="h-page">
            <h2 id="h-page" className="section-title">
              Theo trang / kênh
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] whitespace-nowrap text-[13.5px]">
                <thead className="text-left text-[12px] text-ink-2">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-2 font-medium">Trang / kênh</th>
                    <th className="px-2 text-right font-medium">Hội thoại mới</th>
                    <th className="px-2 text-right font-medium">Tin đến</th>
                    <th className="px-2 text-right font-medium">Tin đi</th>
                    <th className="px-2 text-right font-medium">Bình luận</th>
                    <th className="px-2 text-right font-medium">SĐT</th>
                    <th className="pl-2 text-right font-medium">Phản hồi trung vị</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byPage.map((p) => (
                    <tr key={p.key} className="border-b border-line-soft last:border-0">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{pageName(p.pageId, p.channel)}</span>
                        <span className="ml-2 text-[12px] text-ink-2">{CHANNEL_LABEL[p.channel] ?? p.channel}</span>
                      </td>
                      <td className="px-2 text-right tnum">{n(p.newConvs)}</td>
                      <td className="px-2 text-right tnum">{n(p.inMsgs)}</td>
                      <td className="px-2 text-right tnum">{n(p.outMsgs)}</td>
                      <td className="px-2 text-right tnum">{n(p.comments)}</td>
                      <td className="px-2 text-right tnum">{n(p.phones)}</td>
                      <td className="pl-2 text-right tnum">{fmtDuration(p.medianResponseMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {/* Theo thẻ */}
            <section className="card min-w-0 p-4" aria-labelledby="h-tags">
              <h2 id="h-tags" className="section-title">
                Theo thẻ
              </h2>
              {s.tags.length ? (
                <>
                  <ul className="mt-3 grid gap-1.5">
                    {s.tags.slice(0, 10).map((t, i) => {
                      const info = tagInfo(t.tag, i);
                      return (
                        <li key={t.tag} className="flex items-center gap-2 text-[13.5px]">
                          <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: info.color }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{info.name}</span>
                          <span className="tnum">{n(t.count)}</span>
                          <span className="w-20 text-right text-[12px] text-ink-2 tnum">+{n(t.newCount)} mới</span>
                        </li>
                      );
                    })}
                  </ul>
                  {topTagKeys.length > 0 && (
                    <div className="mt-4 h-[200px]">
                      <TagDailyChart rows={s.tagDaily} tags={topTagKeys.map((k, i) => ({ key: k, name: tagInfo(k, i).name, color: tagInfo(k, i).color }))} />
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-3 text-[13px] text-ink-2">Chưa có hội thoại nào được gắn thẻ.</p>
              )}
            </section>

            {/* Bản đồ nhiệt */}
            <section className="card min-w-0 p-4" aria-labelledby="h-heat">
              <h2 id="h-heat" className="section-title">
                Giờ khách nhắn nhiều
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-2">Tin đến theo thứ và giờ — xếp ca trực vào ô đậm.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-[11px]" aria-label="Bản đồ nhiệt tin đến theo thứ và giờ">
                  <thead>
                    <tr>
                      <th />
                      {Array.from({ length: 24 }, (_, h) => (
                        <th key={h} className="font-normal text-ink-2">
                          {h % 3 === 0 ? h : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <tr key={d}>
                        <th className="pr-1 text-left font-medium text-ink-2">{DAY_SHORT[d]}</th>
                        {s.heatmap[d].map((v, h) => (
                          <td key={h} title={`${DAY_SHORT[d]} ${h}h: ${v} tin`} className="h-5 rounded-[3px]" style={{ background: v ? `rgba(87,155,252,${0.15 + 0.85 * (v / heatMax)})` : "var(--surface-2)" }} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
