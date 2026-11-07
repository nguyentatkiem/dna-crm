import Link from "next/link";
import type { Record as DbRecord } from "@prisma/client";
import { requireApp } from "@/lib/auth";
import { HealthBanner } from "@/app/w/settings/health/HealthBanner";
import { db } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { computeKpis, wonLost } from "@/lib/metrics";
import { recordScope } from "@/lib/permissions";
import { forecastWorkspace } from "@/lib/predict";
import { color } from "@/lib/colors";
import { ago, heat, vnd } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stat } from "@/components/ui/Stat";
import { Sparkline } from "@/components/ui/Sparkline";
import { MiniBars } from "@/components/ui/MiniBars";

const DAY = 864e5;

const KPI_STYLE: Record<string, { icon: string; tone: string; href: string }> = {
  won_amount: { icon: "target", tone: "#00c875", href: "/w/b/deals" },
  open_amount: { icon: "deals", tone: "#579bfc", href: "/w/b/deals" },
  new_contacts: { icon: "users", tone: "#a25ddc", href: "/w/b/contacts" },
  appointments: { icon: "calendar", tone: "#0086c0", href: "/w/b/appointments" },
  win_rate: { icon: "trend", tone: "#fdab3d", href: "/w/b/deals" },
  hot_contacts: { icon: "spark", tone: "#df2f4a", href: "/w/b/contacts" },
};

const SHORTCUTS = [
  { href: "/w/inbox", label: "Hộp thư", desc: "Zalo, Messenger, website", icon: "chat", tone: "#579bfc" },
  { href: "/w/telesales", label: "Telesales", desc: "Gọi, ghi âm, chấm điểm", icon: "phone", tone: "#00c875" },
  { href: "/w/marketing", label: "Marketing & ROAS", desc: "Chi phí QC ra doanh thu", icon: "megaphone", tone: "#fdab3d" },
  { href: "/w/dashboards", label: "Dashboard", desc: "Báo cáo tự thiết kế", icon: "chart", tone: "#0086c0" },
  { href: "/w/docs", label: "Tài liệu", desc: "Ghi chú, kịch bản, quy trình", icon: "doc", tone: "#a25ddc" },
  { href: "/w/automations", label: "Tự động hoá", desc: "Khi… thì… không cần code", icon: "bolt", tone: "#df2f4a" },
];

/** Chuỗi 14 ngày gần nhất cho sparkline. */
function series(rows: DbRecord[], pick: (r: DbRecord) => Date | null, value: (r: DbRecord) => number, start: number) {
  const out = Array.from({ length: 14 }, () => 0);
  for (const r of rows) {
    const d = pick(r);
    if (!d) continue;
    const i = Math.floor((d.getTime() - start) / DAY);
    if (i >= 0 && i < 14) out[i] += value(r);
  }
  return out;
}
const delta = (s: number[]) => {
  const a = s.slice(7).reduce((x, y) => x + y, 0);
  const b = s.slice(0, 7).reduce((x, y) => x + y, 0);
  return b > 0 ? ((a - b) / b) * 100 : null;
};
const monthLabel = (m: string) => {
  const x = m.match(/^(\d{4})-(\d{2})/);
  return x ? `T${Number(x[2])}/${x[1].slice(2)}` : m;
};

export default async function HomePage() {
  const ctx = await requireApp();
  const { user, workspace, config } = ctx;
  const wid = workspace.id;
  const now = new Date();
  const today = new Date(now.toDateString());
  const endToday = new Date(today.getTime() + DAY);
  const scope = await recordScope(ctx);
  const conv = db.conversation as typeof db.conversation | undefined;

  const [records, tasks, logs, calls, convs, forecast] = await Promise.all([
    db.record.findMany({ where: scope }),
    db.task.findMany({ where: { workspaceId: wid, done: false }, orderBy: { dueAt: "asc" }, take: 50 }),
    db.agentLog.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 7 }),
    db.call.findMany({ where: { workspaceId: wid, callbackAt: { gte: new Date(today.getTime() - 7 * DAY), lt: endToday } }, orderBy: { callbackAt: "asc" }, take: 40 }),
    conv ? conv.findMany({ where: { workspaceId: wid, unread: { gt: 0 } }, orderBy: { lastAt: "desc" }, take: 5 }).catch(() => []) : [],
    forecastWorkspace(wid).catch(() => null),
  ]);

  const visible = new Set(records.map((r) => r.id));
  const restricted = "OR" in scope;
  const byId = new Map(records.map((r) => [r.id, r]));
  const term = config.terminology;
  const deals = getObject(config, "deals");
  const contacts = getObject(config, "contacts");
  const { won, lost } = wonLost(config);
  const dealRows = records.filter((r) => r.objectKey === "deals");
  const contactRows = records.filter((r) => r.objectKey === "contacts");

  // KPI + sparkline 14 ngày
  const start = today.getTime() - 13 * DAY;
  const kpis = computeKpis(config, records).map((k, i) => {
    const metric = config.kpis[i]?.metric ?? "";
    const s =
      metric === "won_amount"
        ? series(dealRows.filter((d) => won.has(d.status)), (d) => d.updatedAt, (d) => d.amount, start)
        : metric === "open_amount"
          ? series(dealRows.filter((d) => !won.has(d.status) && !lost.has(d.status)), (d) => d.createdAt, (d) => d.amount, start)
          : metric === "new_contacts"
            ? series(contactRows, (c) => c.createdAt, () => 1, start)
            : metric === "appointments"
              ? series(records.filter((r) => r.objectKey === "appointments"), (r) => r.createdAt, () => 1, start)
              : metric === "win_rate"
                ? series(dealRows.filter((d) => won.has(d.status)), (d) => d.updatedAt, () => 1, start)
                : series(contactRows.filter((c) => c.score >= 70), (c) => c.createdAt, () => 1, start);
    return { ...k, metric, series: s, delta: delta(s), style: KPI_STYLE[metric] ?? KPI_STYLE.open_amount };
  });

  // Hôm nay: việc, hẹn gọi lại, tin chưa đọc
  const dueTasks = tasks.filter((t) => t.dueAt && t.dueAt < endToday && (!restricted || !t.recordId || visible.has(t.recordId) || t.assignee === user.name)).slice(0, 6);
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < today).length;
  const later = calls.length
    ? await db.call.findMany({ where: { workspaceId: wid, recordId: { in: calls.map((c) => c.recordId).filter((x): x is string => !!x) } }, select: { recordId: true, startedAt: true }, orderBy: { startedAt: "desc" } })
    : [];
  const lastCall = new Map<string, Date>();
  for (const c of later) if (c.recordId && !lastCall.has(c.recordId)) lastCall.set(c.recordId, c.startedAt);
  const seenRec = new Set<string>();
  const callbacks = calls
    .filter((c) => {
      if (c.recordId) {
        if (restricted && !visible.has(c.recordId)) return false;
        if (seenRec.has(c.recordId)) return false;
        seenRec.add(c.recordId);
        const last = lastCall.get(c.recordId);
        if (last && last > c.startedAt) return false; // đã gọi lại rồi
      } else if (restricted && c.agentName !== user.name) return false;
      return true;
    })
    .slice(0, 5);
  const unreadTotal = convs.reduce((s, c) => s + c.unread, 0);

  // Funnel theo giai đoạn
  const byStage = (deals?.statuses ?? []).map((s) => {
    const list = dealRows.filter((d) => d.status === s.key);
    return { ...s, count: list.length, amount: list.reduce((a, d) => a + d.amount, 0), lost: lost.has(s.key) };
  });
  const maxCount = Math.max(1, ...byStage.map((s) => s.count));
  const hot = contactRows.filter((r) => r.score >= 70).sort((a, b) => b.score - a.score).slice(0, 6);
  const stale = dealRows.filter((d) => !won.has(d.status) && !lost.has(d.status) && now.getTime() - d.updatedAt.getTime() > 7 * DAY).length;
  const hourGreeting = now.getHours() < 11 ? "Chào buổi sáng" : now.getHours() < 18 ? "Chào buổi chiều" : "Chào buổi tối";

  // Dự báo (lọc theo quyền xem)
  const fDeals = (forecast?.deals ?? []).filter((d) => !restricted || visible.has(d.id)).slice(0, 5);
  const hasForecast = !!forecast && (forecast.pipeline > 0 || forecast.deals.length > 0);
  const fallbackPipeline = dealRows.filter((d) => !won.has(d.status) && !lost.has(d.status)).reduce((s, d) => s + d.amount, 0);

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <HealthBanner workspaceId={workspace.id} userId={user.id} />
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-[300px]">
          <p className="text-[13.5px] capitalize text-ink-2">{now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-0.5 text-[24px] font-semibold sm:text-[26px]">
            {hourGreeting}, {user.name}!
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/w/b/contacts" className="btn-primary">
            <Icon name="plus" size={16} /> Thêm {term.contact.toLowerCase()}
          </Link>
          <Link href="/w/telesales" className="btn-outline">
            <Icon name="phone" size={16} /> Gọi khách tiếp
          </Link>
        </div>
      </header>

      <section className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-accent-soft bg-gradient-to-r from-accent-soft to-surface-2 p-4">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-accent text-white">
          <Icon name="spark" size={20} />
        </span>
        <div className="min-w-0 flex-1 basis-[260px]">
          <p className="section-title">Daily Briefing Agent</p>
          <p className="mt-0.5 text-[14.5px]">
            Bạn có <b>{hot.length} {term.contact.toLowerCase()} nóng</b> nên gọi hôm nay, <b>{tasks.length} việc đang mở</b>
            {overdue ? (
              <>
                {" "}
                trong đó <b className="text-danger">{overdue} việc quá hạn</b>
              </>
            ) : null}
            {callbacks.length ? (
              <>
                , <b>{callbacks.length} hẹn gọi lại</b> đến hạn
              </>
            ) : null}
            {unreadTotal ? (
              <>
                , <b>{unreadTotal} tin chưa đọc</b>
              </>
            ) : null}{" "}
            và <b>{stale} {term.deal.toLowerCase()}</b> chưa được cập nhật hơn 7 ngày.
          </p>
        </div>
        <Link href="/w/my-work" className="btn-outline bg-surface">
          Xem việc của tôi
        </Link>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Stat key={k.label} label={k.label} value={k.value} hint={k.hint} delta={k.delta} icon={k.style.icon} tone={k.style.tone} href={k.style.href}>
            <Sparkline data={k.series} color={k.style.tone} />
          </Stat>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card min-w-0 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-[16px] font-semibold">Dự báo doanh thu</h2>
            {hasForecast && forecast!.trainedOn > 0 && <span className="badge-accent">Học từ {forecast!.trainedOn} {term.deal.toLowerCase()} đã đóng</span>}
          </div>
          {!hasForecast ? (
            <EmptyState
              icon="trend"
              title="Cần thêm dữ liệu deal đã đóng"
              desc={
                <>
                  Khi có thêm {term.deal.toLowerCase()} thắng/thua, AI sẽ ước tính khả năng chốt từng mục và doanh thu kỳ vọng theo tháng. Hiện đang mở: <b className="text-ink">{vnd(fallbackPipeline)}</b>.
                </>
              }
              action={{ label: `Mở bảng ${deals?.label ?? term.deal}`, href: "/w/b/deals" }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[12.5px] text-ink-2">Pipeline đang mở</p>
                  <p className="font-title text-[22px] font-semibold tnum">{vnd(forecast!.pipeline)}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[12.5px] text-ink-2">Kỳ vọng (có trọng số)</p>
                  <p className="font-title text-[22px] font-semibold text-success tnum">{vnd(forecast!.weighted)}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <p className="section-title mb-1">Theo tháng dự kiến chốt</p>
                  {forecast!.byMonth.length ? (
                    <MiniBars rows={forecast!.byMonth.map((m) => ({ label: monthLabel(m.month), value: m.amount }))} color="#00c875" height={170} />
                  ) : (
                    <p className="py-8 text-center text-[13px] text-ink-2">Chưa có ngày dự kiến chốt.</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="section-title mb-1">Khả năng chốt cao nhất</p>
                  {fDeals.length === 0 && <p className="py-8 text-center text-[13px] text-ink-2">Chưa có mục nào.</p>}
                  <ul className="grid gap-1">
                    {fDeals.map((d) => (
                      <li key={d.id}>
                        <Link href={`/w/b/deals?open=${d.id}`} className="grid gap-1 rounded-md px-2 py-1.5 hover:bg-hover">
                          <span className="flex items-center gap-2 text-[13.5px]">
                            <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                            <span className="text-ink-2 tnum">{vnd(d.amount)}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, d.prob)}%`, background: d.prob >= 70 ? "#00c875" : d.prob >= 40 ? "#fdab3d" : "#df2f4a" }} />
                            </span>
                            <span className="w-9 text-right text-[12px] font-semibold tnum">{Math.round(d.prob)}%</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card min-w-0 p-5">
          <h2 className="mb-3 text-[16px] font-semibold">Hôm nay</h2>
          <TodayGroup title="Việc quá hạn & hôm nay" count={dueTasks.length} href="/w/my-work">
            {dueTasks.length === 0 ? (
              <p className="px-2 py-2 text-[13px] text-ink-2">Không có việc đến hạn. Tuyệt vời!</p>
            ) : (
              dueTasks.map((t) => {
                const late = t.dueAt! < today;
                return (
                  <Link key={t.id} href={t.recordId && byId.get(t.recordId) ? `/w/b/${byId.get(t.recordId)!.objectKey}?open=${t.recordId}` : "/w/my-work"} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] hover:bg-hover">
                    <span className={`h-2 w-2 flex-none rounded-full ${late ? "bg-danger" : "bg-[#fdab3d]"}`} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className={`text-[12px] ${late ? "text-danger" : "text-ink-2"}`}>{late ? "Quá hạn" : "Hôm nay"}</span>
                  </Link>
                );
              })
            )}
          </TodayGroup>
          <TodayGroup title="Hẹn gọi lại đến hạn" count={callbacks.length} href="/w/telesales">
            {callbacks.length === 0 ? (
              <p className="px-2 py-2 text-[13px] text-ink-2">Không có hẹn gọi lại nào hôm nay.</p>
            ) : (
              callbacks.map((c) => {
                const r = c.recordId ? byId.get(c.recordId) : undefined;
                return (
                  <Link key={c.id} href={r ? `/w/b/${r.objectKey}?open=${r.id}` : "/w/telesales"} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] hover:bg-hover">
                    <Icon name="phone" size={14} className="flex-none text-success" />
                    <span className="min-w-0 flex-1 truncate">{r?.title || c.phone || "Khách"}</span>
                    <span className="text-[12px] text-ink-2 tnum">{c.callbackAt!.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </Link>
                );
              })
            )}
          </TodayGroup>
          <TodayGroup title="Tin chưa đọc" count={unreadTotal} href="/w/inbox" last>
            {convs.length === 0 ? (
              <p className="px-2 py-2 text-[13px] text-ink-2">Hộp thư đã đọc hết.</p>
            ) : (
              convs.map((c) => (
                <Link key={c.id} href={`/w/inbox?c=${c.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] hover:bg-hover">
                  <Avatar name={c.name || "Khách"} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name || "Khách"}</span>
                    <span className="block truncate text-[12px] text-ink-2">{c.lastText}</span>
                  </span>
                  <span className="count-dot">{c.unread}</span>
                </Link>
              ))
            )}
          </TodayGroup>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold">
              {term.deal} theo {deals?.statusLabel.toLowerCase() ?? "giai đoạn"}
            </h2>
            <Link href="/w/b/deals" className="text-[13px] text-primary hover:underline">
              Mở bảng
            </Link>
          </div>
          {dealRows.length === 0 ? (
            <EmptyState compact icon="deals" title={`Chưa có ${term.deal.toLowerCase()} nào`} desc="Thêm mục đầu tiên để xem phễu bán hàng." action={{ label: "Mở bảng", href: "/w/b/deals" }} />
          ) : (
            <div className="grid gap-2">
              {byStage.map((s, i) => {
                const prev = i > 0 && !s.lost ? byStage[i - 1].count : 0;
                return (
                  <div key={s.key} className="grid grid-cols-[minmax(0,100px)_minmax(0,1fr)_auto] items-center gap-3 text-[13.5px] sm:grid-cols-[130px_minmax(0,1fr)_120px]">
                    <span className="truncate">{s.label}</span>
                    <span className="relative h-7 overflow-hidden rounded-md bg-surface-2">
                      <span className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.max(2, (s.count / maxCount) * 100)}%`, background: color(s.color).bg, opacity: s.lost ? 0.55 : 1 }} />
                      <span className="relative flex h-full items-center px-2 text-[12px] font-semibold text-white mix-blend-normal tnum" style={{ textShadow: "0 1px 2px rgba(0,0,0,.25)" }}>
                        {s.count}
                      </span>
                    </span>
                    <span className="text-right tnum">
                      <b>{vnd(s.amount)}</b>
                      {prev > 0 && <span className="hidden text-[12px] text-ink-2 sm:inline"> · {Math.round((s.count / prev) * 100)}%</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card min-w-0 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold">{contacts?.label ?? term.contact} nóng cần gọi</h2>
            <Link href="/w/telesales" className="text-[13px] text-primary hover:underline">
              Gọi ngay
            </Link>
          </div>
          {hot.length === 0 && <EmptyState compact icon="spark" title="Chưa có khách điểm cao" desc="Thêm khách mới để Lead Qualifier chấm điểm nóng/ấm/lạnh." />}
          <ul className="grid">
            {hot.map((c) => (
              <li key={c.id}>
                <Link href={`/w/b/contacts?open=${c.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-hover">
                  <Avatar name={c.title} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.title}</span>
                    <span className="block truncate text-[12px] text-ink-2">{c.ownerName || "Chưa giao"}</span>
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold text-white tnum" style={{ background: color(heat(c.score).color).bg }}>
                    {c.score}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="card min-w-0 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold">Hoạt động của AI Agent</h2>
            <Link href="/w/agents" className="text-[13px] text-primary hover:underline">
              Đội agent
            </Link>
          </div>
          {logs.length === 0 && <EmptyState compact icon="bot" title="Agent chưa ghi nhận hoạt động" desc="Bật agent trong trang AI Agent để chúng bắt đầu làm việc." />}
          <ol className="relative grid gap-3 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-line-soft">
            {logs.map((l) => (
              <li key={l.id} className="relative flex gap-3 text-[13.5px]">
                <span className="z-[1] grid h-6 w-6 flex-none place-items-center rounded-full bg-accent-soft text-accent">
                  <Icon name="bot" size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <b>{l.agent}</b> <span className="text-ink-2">· {ago(l.createdAt)}</span>
                  <span className="block text-ink">{l.message}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card min-w-0 p-5">
          <h2 className="mb-3 text-[16px] font-semibold">Lối tắt</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {SHORTCUTS.map((s) => (
              <Link key={s.href} href={s.href} className="card-hover group flex min-w-0 flex-col gap-2 rounded-lg border border-line-soft p-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${s.tone}1f`, color: s.tone }}>
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium group-hover:text-primary">{s.label}</span>
                  <span className="block truncate text-[12px] text-ink-2">{s.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function TodayGroup({ title, count, href, last, children }: { title: string; count: number; href: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={last ? "" : "mb-3 border-b border-line-soft pb-3"}>
      <div className="mb-1 flex items-center gap-2 px-2">
        <p className="section-title flex-1">{title}</p>
        {count > 0 && <span className="badge tnum">{count}</span>}
        <Link href={href} className="text-[12px] text-primary hover:underline">
          Xem
        </Link>
      </div>
      <div className="grid">{children}</div>
    </div>
  );
}
