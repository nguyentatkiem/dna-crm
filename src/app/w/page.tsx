import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { computeKpis, wonLost } from "@/lib/metrics";
import { color } from "@/lib/colors";
import { ago, heat, vnd } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";

export default async function HomePage() {
  const { user, workspace, config } = await requireApp();
  const wid = workspace.id;
  const [records, tasks, logs] = await Promise.all([
    db.record.findMany({ where: { workspaceId: wid } }),
    db.task.findMany({ where: { workspaceId: wid, done: false }, orderBy: { dueAt: "asc" }, take: 6 }),
    db.agentLog.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const kpis = computeKpis(config, records);
  const deals = getObject(config, "deals");
  const contacts = getObject(config, "contacts");
  const { won } = wonLost(config);
  const dealRows = records.filter((r) => r.objectKey === "deals");
  const byStage = (deals?.statuses ?? []).map((s) => {
    const list = dealRows.filter((d) => d.status === s.key);
    return { ...s, count: list.length, amount: list.reduce((a, d) => a + d.amount, 0) };
  });
  const maxAmount = Math.max(1, ...byStage.map((s) => s.amount));
  const hot = records.filter((r) => r.objectKey === "contacts" && r.score >= 70).sort((a, b) => b.score - a.score).slice(0, 5);
  const now = new Date();
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < new Date(now.toDateString())).length;
  const stale = dealRows.filter((d) => !won.has(d.status) && Date.now() - d.updatedAt.getTime() > 7 * 864e5).length;
  const hourGreeting = now.getHours() < 11 ? "Chào buổi sáng" : now.getHours() < 18 ? "Chào buổi chiều" : "Chào buổi tối";

  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <p className="text-[14px] text-ink-2">{now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1 className="mt-1 text-[26px] font-semibold">
        {hourGreeting}, {user.name}!
      </h1>

      <section className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-[#d9c5f0] bg-surface-2 p-4">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#a25ddc] text-white">
          <Icon name="spark" size={20} />
        </span>
        <div className="min-w-0 flex-1 basis-[260px]">
          <p className="label">Daily Briefing Agent</p>
          <p className="mt-0.5 text-[14.5px]">
            Bạn có <b>{hot.length} {config.terminology.contact.toLowerCase()} nóng</b> nên gọi hôm nay, <b>{tasks.length} việc đang mở</b>
            {overdue ? <> trong đó <b className="text-[#df2f4a]">{overdue} việc quá hạn</b></> : null}, và <b>{stale} {config.terminology.deal.toLowerCase()}</b> chưa được cập nhật hơn 7 ngày.
          </p>
        </div>
        <Link href="/w/my-work" className="btn-outline">
          Xem việc của tôi
        </Link>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-[13px] text-ink-2">{k.label}</p>
            <p className="mt-1 font-title text-[28px] font-semibold tnum">{k.value}</p>
            <p className="text-[12.5px] text-ink-2">{k.hint}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">
              {config.terminology.deal} theo {deals?.statusLabel.toLowerCase()}
            </h2>
            <Link href="/w/b/deals" className="text-[13px] text-primary hover:underline">
              Mở bảng
            </Link>
          </div>
          <div className="grid gap-2.5">
            {byStage.map((s) => (
              <div key={s.key} className="grid grid-cols-[110px_minmax(0,1fr)_90px] items-center gap-3 text-[13.5px]">
                <span className="truncate">{s.label}</span>
                <span className="h-6 overflow-hidden rounded bg-surface-2">
                  <span className="block h-full rounded" style={{ width: `${Math.max(2, (s.amount / maxAmount) * 100)}%`, background: color(s.color).bg }} />
                </span>
                <span className="text-right tnum">
                  <b>{vnd(s.amount)}</b> <span className="text-ink-2">· {s.count}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-[16px] font-semibold">{contacts?.label} nóng cần gọi</h2>
          {hot.length === 0 && <p className="py-6 text-center text-ink-2">Chưa có khách điểm cao. Thêm khách mới để Lead Qualifier chấm điểm.</p>}
          <ul className="grid">
            {hot.map((c) => (
              <li key={c.id}>
                <Link href={`/w/b/contacts?open=${c.id}`} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-hover">
                  <Avatar name={c.title} size={30} />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                  <span className="rounded-full px-2 py-0.5 text-[12px] text-white tnum" style={{ background: color(heat(c.score).color).bg }}>
                    {c.score}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 text-[16px] font-semibold">Việc sắp tới</h2>
          {tasks.length === 0 && <p className="py-6 text-center text-ink-2">Không còn việc nào. Tuyệt vời!</p>}
          <ul className="grid divide-y divide-[var(--line-soft)]">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-[14px]">
                <span className={`h-2 w-2 flex-none rounded-full ${t.dueAt && t.dueAt < new Date(now.toDateString()) ? "bg-[#df2f4a]" : "bg-[#fdab3d]"}`} />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-[12px] text-ink-2">{t.source}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-[16px] font-semibold">Hoạt động của AI Agent</h2>
          {logs.length === 0 && <p className="py-6 text-center text-ink-2">Agent chưa ghi nhận hoạt động nào.</p>}
          <ul className="grid divide-y divide-[var(--line-soft)]">
            {logs.map((l) => (
              <li key={l.id} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-2.5 text-[13.5px]">
                <b className="truncate">{l.agent}</b>
                <span>
                  {l.message} <span className="text-[12px] text-ink-2">· {ago(l.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
