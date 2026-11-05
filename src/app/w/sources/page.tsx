import { headers } from "next/headers";
import { isOwner, requireApp } from "@/lib/auth";
import { db, parseJson } from "@/lib/db";
import { ensureHookKey, getSettings, maskSettings } from "@/lib/settings";
import { CHANNELS, type Channel } from "@/lib/sources/ingest";
import { PROVIDERS } from "@/lib/sources/providers";
import { POSITIVE, TALKED } from "@/lib/calls";
import { wonLost } from "@/lib/metrics";
import { ago, vnd } from "@/lib/format";
import { Connections } from "./Connections";

const CH_COLOR: Record<Channel, string> = { ads: "#579bfc", organic: "#00c875", zalo: "#0068ff", ecommerce: "#fdab3d", website: "#a25ddc", call: "#0086c0", other: "#c4c4c4" };
const STATUS: Record<string, [string, string]> = { created: ["Lead mới", "#00c875"], merged: ["Gộp khách cũ", "#579bfc"], duplicate: ["Trùng, bỏ qua", "#c4c4c4"], ignored: ["Không có lead", "#c4c4c4"], error: ["Lỗi", "#df2f4a"] };

export default async function SourcesPage() {
  const { workspace, user, config } = await requireApp();
  const wid = workspace.id;
  const since = new Date(Date.now() - 30 * 864e5);
  const [contacts, deals, calls, events, owner, hookKey] = await Promise.all([
    db.record.findMany({ where: { workspaceId: wid, objectKey: "contacts", createdAt: { gte: since } }, select: { id: true, dataJson: true, score: true } }),
    db.record.findMany({ where: { workspaceId: wid, objectKey: "deals" }, select: { dataJson: true, amount: true, status: true } }),
    db.call.findMany({ where: { workspaceId: wid, recordId: { not: null } }, select: { recordId: true, outcome: true } }),
    db.leadEvent.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 40 }),
    isOwner(user.id, wid),
    ensureHookKey(workspace),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const { won } = wonLost(config);

  // Gom theo nguồn: lead → gọi được → hẹn/chốt, và doanh thu đơn hàng thắng.
  const talked = new Set(calls.filter((c) => TALKED.has(c.outcome)).map((c) => c.recordId));
  const positive = new Set(calls.filter((c) => POSITIVE.has(c.outcome)).map((c) => c.recordId));
  type Row = { channel: Channel; source: string; campaign: string; leads: number; hot: number; talked: number; positive: number; revenue: number };
  const rows = new Map<string, Row>();
  const row = (channel: Channel, source: string, campaign: string) => {
    const k = `${channel}|${source}|${campaign}`;
    if (!rows.has(k)) rows.set(k, { channel, source, campaign, leads: 0, hot: 0, talked: 0, positive: 0, revenue: 0 });
    return rows.get(k)!;
  };
  for (const c of contacts) {
    const d = parseJson<Record<string, string>>(c.dataJson, {});
    const r = row((d._kenh as Channel) || "other", d._nguon || d.nguon || "Nhập tay", d._chien_dich || "");
    r.leads++;
    if (c.score >= 70) r.hot++;
    if (talked.has(c.id)) r.talked++;
    if (positive.has(c.id)) r.positive++;
  }
  for (const d of deals) {
    const x = parseJson<Record<string, string>>(d.dataJson, {});
    if (x._kenh && won.has(d.status)) row(x._kenh as Channel, x._nguon || "", "").revenue += d.amount;
  }
  const table = [...rows.values()].sort((a, b) => b.leads - a.leads || b.revenue - a.revenue);
  const byChannel = (Object.keys(CHANNELS) as Channel[]).map((ch) => ({ ch, n: table.filter((r) => r.channel === ch).reduce((s, r) => s + r.leads, 0) })).filter((x) => x.n);
  const total = contacts.length || 1;

  const stats = Object.fromEntries(
    PROVIDERS.map((p) => {
      const ev = events.filter((e) => e.provider === p.key);
      return [p.key, { count: ev.filter((e) => e.status === "created" || e.status === "merged").length, last: ev[0] ? ago(ev[0].createdAt) : "", lastError: ev[0]?.status === "error" ? ev[0].message : "" }];
    }),
  );
  const providers = PROVIDERS.map((p) => ({ key: p.key, label: p.label, channel: p.channel, guide: p.guide, secrets: p.secrets }));

  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Nguồn khách</h1>
      <p className="mt-1 max-w-3xl text-ink-2">Mọi lead từ quảng cáo, Zalo OA, sàn thương mại điện tử, website đổ về một chỗ: tự chống trùng theo số điện thoại, gắn kênh và chiến dịch, chạy tự động hoá như khách nhập tay.</p>

      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold">30 ngày qua: {contacts.length} lead</h2>
          <span className="text-[13px] text-ink-2">Gọi được: {talked.size} · Hẹn/chốt qua điện thoại: {positive.size}</span>
        </div>
        <div className="mt-3 flex h-7 overflow-hidden rounded" role="img" aria-label="Tỷ lệ lead theo kênh">
          {byChannel.map((x) => (
            <span key={x.ch} title={`${CHANNELS[x.ch]}: ${x.n}`} style={{ width: `${(x.n / total) * 100}%`, background: CH_COLOR[x.ch] }} />
          ))}
          {!byChannel.length && <span className="flex-1 bg-[var(--line-soft)]" />}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {byChannel.map((x) => (
            <li key={x.ch} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CH_COLOR[x.ch] }} />
              {CHANNELS[x.ch]} <b className="tnum">{x.n}</b> <span className="text-ink-2">({Math.round((x.n / total) * 100)}%)</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead className="text-left text-[12.5px] text-ink-2">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">Nguồn / chiến dịch</th>
                <th className="font-medium">Kênh</th>
                <th className="text-right font-medium">Lead</th>
                <th className="text-right font-medium">Nóng</th>
                <th className="text-right font-medium">Gọi được</th>
                <th className="text-right font-medium">Hẹn/chốt</th>
                <th className="text-right font-medium">Doanh thu đơn</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={`${r.channel}${r.source}${r.campaign}`} className="border-b border-[var(--line-soft)]">
                  <td className="py-2">
                    <b className="font-medium">{r.source}</b>
                    {r.campaign && <span className="block text-[12px] text-ink-2">{r.campaign}</span>}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: CH_COLOR[r.channel] }} />
                      {CHANNELS[r.channel]}
                    </span>
                  </td>
                  <td className="tnum text-right">{r.leads}</td>
                  <td className="tnum text-right">{r.hot}</td>
                  <td className="tnum text-right">{r.leads ? `${Math.round((r.talked / r.leads) * 100)}%` : "–"}</td>
                  <td className="tnum text-right">{r.leads ? `${Math.round((r.positive / r.leads) * 100)}%` : "–"}</td>
                  <td className="tnum text-right">{r.revenue ? vnd(r.revenue) : "–"}</td>
                </tr>
              ))}
              {!table.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-ink-2">
                    Chưa có lead trong 30 ngày. Kết nối một nguồn bên dưới rồi bấm “Gửi thử”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Connections providers={providers} stats={stats} base={`${origin}/api/hooks/${hookKey}`} masked={owner ? maskSettings(getSettings(workspace)) : {}} owner={owner} formUrl={`${origin}/f/${workspace.formKey}`} />

      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-[16px] font-semibold">Nhật ký nhận lead</h2>
        {!events.length && <p className="text-ink-2">Chưa nhận sự kiện nào.</p>}
        <ul className="grid divide-y divide-[var(--line-soft)]">
          {events.map((e) => {
            const [label, col] = STATUS[e.status] ?? [e.status, "#c4c4c4"];
            return (
              <li key={e.id} className="grid grid-cols-[110px_150px_130px_minmax(0,1fr)] items-center gap-3 py-2 text-[13.5px] max-md:grid-cols-2">
                <span className="text-ink-2">{ago(e.createdAt)}</span>
                <b className="font-medium">{PROVIDERS.find((p) => p.key === e.provider)?.label ?? e.provider}</b>
                <span className="inline-flex w-fit rounded px-2 py-0.5 text-[12px] font-medium text-white" style={{ background: col }}>
                  {label}
                </span>
                <span className="truncate text-ink-2">{e.message || (e.recordId ? "Đã vào bảng khách" : "")}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
