import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db, parseJson } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { allow, getAccess, recordScope } from "@/lib/permissions";
import { getSettings, maskSettings } from "@/lib/settings";
import { buildAdReport } from "@/lib/marketing/report";
import { parseSteps, resolveTemplate, sequenceStats } from "@/lib/marketing/sequences";
import { channelView } from "@/lib/marketing/guard";
import { dryRun } from "@/lib/marketing/messaging";
import { CHANNEL_LABEL, SEQ_TEMPLATES, STATUS_LABEL, type MsgChannel } from "@/lib/marketing/shared";
import { ago } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { AdsTab } from "./AdsTab";
import { SequencesTab } from "./SequencesTab";
import { ChannelsButton } from "./ChannelsDrawer";

const TABS = [
  ["ads", "Hiệu quả quảng cáo"],
  ["sequences", "Chăm sóc tự động"],
  ["log", "Nhật ký gửi"],
] as const;

type SP = Promise<{ tab?: string; days?: string; channel?: string; status?: string }>;

export default async function MarketingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "ads";
  const { user, workspace, config } = await requireApp();
  const wid = workspace.id;
  const acc = await getAccess(user.id, wid);
  const manage = allow(acc, "marketing_manage");
  const settings = getSettings(workspace);
  const scope = await recordScope({ user, workspace });

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold">Marketing</h1>
          <p className="mt-1 max-w-3xl text-ink-2">Biết mỗi đồng quảng cáo mang về bao nhiêu khách và doanh thu, rồi chăm sóc khách tự động qua Zalo, ZNS, SMS, email.</p>
        </div>
        {manage && <ChannelsButton initial={channelView(settings)} dryRun={dryRun()} />}
      </div>
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Marketing">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/w/marketing?tab=${k}`} className={`-mb-px flex-none border-b-2 px-3 py-2 text-[14px] ${tab === k ? "border-primary font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "ads" && <Ads wid={wid} days={[7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30} manage={allow(acc, "ads_manage")} settings={settings} scope={scope} config={config} />}
      {tab === "sequences" && <Sequences wid={wid} manage={manage} scope={scope} config={config} />}
      {tab === "log" && <Log wid={wid} channel={sp.channel} status={sp.status} />}
    </div>
  );
}

type Cfg = Awaited<ReturnType<typeof requireApp>>["config"];
type Scope = Awaited<ReturnType<typeof recordScope>>;

async function Ads({ wid, days, manage, settings, scope, config }: { wid: string; days: number; manage: boolean; settings: ReturnType<typeof getSettings>; scope: Scope; config: Cfg }) {
  const report = await buildAdReport(wid, config, days, scope);
  const masked = maskSettings(settings);
  const lastSync = await db.agentLog.findFirst({ where: { workspaceId: wid, agent: "Marketing Analyst", message: { contains: "đồng bộ" } }, orderBy: { createdAt: "desc" } });
  return (
    <AdsTab
      report={report}
      manage={manage}
      aiOn={!!process.env.ANTHROPIC_API_KEY}
      masked={{ fbAds: masked.fbAds ?? {}, googleAds: masked.googleAds ?? {} }}
      lastSync={lastSync ? { at: ago(lastSync.createdAt), text: lastSync.message } : null}
    />
  );
}

async function Sequences({ wid, manage, scope, config }: { wid: string; manage: boolean; scope: Scope; config: Cfg }) {
  const [list, stats, contacts, deals] = await Promise.all([
    db.sequence.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "asc" } }),
    sequenceStats(wid),
    db.record.findMany({ where: { ...scope, objectKey: "contacts" }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, title: true, ownerName: true, dataJson: true } }),
    db.record.findMany({ where: { ...scope, objectKey: "deals" }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true } }),
  ]);
  const phoneKey = getObject(config, "contacts")?.fields.find((f) => f.type === "phone")?.key;
  const first = contacts[0];
  const sample = {
    ten: first?.title ?? "Nguyễn Thị Lan",
    ten_doanh_nghiep: config.businessName,
    so_dien_thoai: (first && phoneKey ? String(parseJson<Record<string, string>>(first.dataJson, {})[phoneKey] ?? "") : "") || "0912345678",
    nguoi_phu_trach: first?.ownerName || config.team[0] || "Bạn",
  };
  const statuses = (k: "contacts" | "deals") => getObject(config, k)?.statuses.map((s) => ({ key: s.key, label: s.label })) ?? [];
  return (
    <SequencesTab
      manage={manage}
      sequences={list.map((s) => ({ id: s.id, name: s.name, triggerType: s.triggerType, objectKey: s.objectKey, triggerValue: s.triggerValue, enabled: s.enabled, stopOnReply: s.stopOnReply, steps: parseSteps(s.stepsJson), stats: stats[s.id] ?? { active: 0, total: 0, done: 0, sent: 0, replied: 0 } }))}
      statuses={{ contacts: statuses("contacts"), deals: statuses("deals") }}
      terms={{ contacts: config.terminology.contact, deals: config.terminology.deal }}
      sample={sample}
      records={{ contacts: contacts.map((c) => ({ id: c.id, title: c.title })), deals: deals.map((d) => ({ id: d.id, title: d.title })) }}
      templates={SEQ_TEMPLATES.map((t) => ({ key: t.key, desc: t.desc, ...resolveTemplate(t, config) }))}
      aiOn={!!process.env.ANTHROPIC_API_KEY}
    />
  );
}

async function Log({ wid, channel, status }: { wid: string; channel?: string; status?: string }) {
  const where = { workspaceId: wid, ...(channel ? { channel } : {}), ...(status ? { status } : {}) };
  const [items, total, seqs] = await Promise.all([
    db.outMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 150 }),
    db.outMessage.count({ where }),
    db.sequence.findMany({ where: { workspaceId: wid }, select: { id: true, name: true } }),
  ]);
  const ids = [...new Set(items.map((i) => i.recordId).filter((x): x is string => !!x))];
  const recs = ids.length ? await db.record.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, objectKey: true } }) : [];
  const title = new Map(recs.map((r) => [r.id, r]));
  const seqName = new Map(seqs.map((s) => [s.id, s.name]));
  const href = (p: { channel?: string; status?: string }) => {
    const q = new URLSearchParams({ tab: "log" });
    const c = "channel" in p ? p.channel : channel;
    const s = "status" in p ? p.status : status;
    if (c) q.set("channel", c);
    if (s) q.set("status", s);
    return `/w/marketing?${q}`;
  };
  const chip = (on: boolean) => `chip ${on ? "chip-on" : ""}`;
  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ channel: undefined })} className={chip(!channel)}>
          Mọi kênh
        </Link>
        {(Object.keys(CHANNEL_LABEL) as MsgChannel[]).map((c) => (
          <Link key={c} href={href({ channel: c })} className={chip(channel === c)}>
            {CHANNEL_LABEL[c]}
          </Link>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-[var(--line)] sm:block" />
        <Link href={href({ status: undefined })} className={chip(!status)}>
          Mọi trạng thái
        </Link>
        {Object.entries(STATUS_LABEL).map(([k, [label]]) => (
          <Link key={k} href={href({ status: k })} className={chip(status === k)}>
            {label}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-ink-2">{total} tin{total > items.length ? ` · hiện ${items.length} tin mới nhất` : ""}</p>
      <div className="card mt-2 overflow-hidden">
        {!items.length && (
          <div className="grid place-items-center gap-2 px-6 py-12 text-center text-ink-2">
            <Icon name="send" />
            <p>Chưa có tin nào{channel || status ? " khớp bộ lọc" : ""}. Tin gửi từ kịch bản chăm sóc và nút “Gửi thử” sẽ hiện ở đây.</p>
          </div>
        )}
        <ul className="divide-y divide-[var(--line-soft)]">
          {items.map((m) => {
            const [label, color] = STATUS_LABEL[m.status] ?? [m.status, "#c4c4c4"];
            const r = m.recordId ? title.get(m.recordId) : undefined;
            return (
              <li key={m.id} className="grid gap-1 px-4 py-3 text-[13.5px] md:grid-cols-[120px_110px_minmax(0,1fr)_100px] md:items-start md:gap-3">
                <span className="text-ink-2">{ago(m.createdAt)}</span>
                <span className="font-medium">{CHANNEL_LABEL[m.channel as MsgChannel] ?? m.channel}</span>
                <span className="min-w-0">
                  <span className="block truncate">
                    {r ? (
                      <Link href={`/w/b/${r.objectKey}?open=${r.id}`} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                    ) : (
                      <b className="font-medium">{m.recordId ? "Khách đã xoá" : m.to || "Không rõ người nhận"}</b>
                    )}
                    {m.sequenceId && <span className="text-ink-2"> · {seqName.get(m.sequenceId) ?? "Kịch bản đã xoá"}</span>}
                    {m.provider === "sample" && <span className="ml-1 rounded bg-surface-2 px-1.5 text-[11.5px] text-ink-2">mẫu</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-ink-2">{m.subject ? `${m.subject} · ` : ""}{m.body}</span>
                  {m.error && <span className="mt-0.5 block text-[12.5px] text-[#d83a52]">{m.error}</span>}
                </span>
                <span className="inline-flex h-6 w-fit items-center rounded px-2 text-[12px] font-medium text-white" style={{ background: color }}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
