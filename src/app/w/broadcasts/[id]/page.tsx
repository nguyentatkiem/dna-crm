import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getRole } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { channelReady } from "@/lib/marketing/messaging";
import { B_CHANNELS, B_STATUS, type BChannel } from "@/lib/marketing/broadcast";
import { CHANNEL_LABEL, STATUS_LABEL, type MsgChannel } from "@/lib/marketing/shared";
import { ago, dateVi } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Composer } from "../Composer";
import { BroadcastActions } from "../Actions";

type P = { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "–");
const time = (d: Date) => `${dateVi(d)} ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;

export default async function BroadcastPage({ params, searchParams }: P) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireApp();
  const manage = can(await getRole(user.id, workspace.id), "manage_marketing");
  const b = await db.broadcast.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!b) notFound();
  const editable = manage && (b.status === "draft" || b.status === "scheduled");

  if (editable && sp.edit) {
    const segments = await db.segment.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    const s = getSettings(workspace);
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <Link href={`/w/broadcasts/${b.id}`} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
          <Icon name="chevron" size={14} className="rotate-90" /> {b.name}
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold">Sửa đợt gửi</h1>
        <Composer
          segments={segments}
          notReady={Object.fromEntries(B_CHANNELS.map((c) => [c, channelReady(s, c)]))}
          initial={{ id: b.id, name: b.name, channel: b.channel as BChannel, segmentId: b.segmentId ?? "", subject: b.subject, body: b.body, templateId: b.templateId, scheduledAt: b.status === "scheduled" && b.scheduledAt ? b.scheduledAt.toISOString() : "" }}
        />
      </div>
    );
  }

  const [messages, groups, errors, seg] = await Promise.all([
    db.outMessage.findMany({ where: { broadcastId: b.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.outMessage.groupBy({ by: ["status"], where: { broadcastId: b.id }, _count: { _all: true } }),
    db.outMessage.groupBy({ by: ["error"], where: { broadcastId: b.id, status: { in: ["failed", "skipped"] } }, _count: { _all: true }, orderBy: { _count: { error: "desc" } }, take: 5 }),
    b.segmentId ? db.segment.findUnique({ where: { id: b.segmentId }, select: { name: true } }) : null,
  ]);
  const ids = [...new Set(messages.map((m) => m.recordId).filter((x): x is string => !!x))];
  const recs = ids.length ? await db.record.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, objectKey: true } }) : [];
  const rec = new Map(recs.map((r) => [r.id, r]));
  const dry = groups.find((g) => g.status === "dry_run")?._count._all ?? 0;
  const [label, color] = B_STATUS[b.status] ?? [b.status, "#c4c4c4"];
  const email = b.channel === "email";
  const done = b.sent + b.failed + b.skipped;
  const progress = b.total ? Math.min(100, Math.round((done / b.total) * 100)) : 0;

  const cards: [string, string, string?][] = [
    ["Tổng người nhận", String(b.total)],
    ["Đã gửi", String(b.sent), dry ? `${dry} tin chạy thử, không gửi thật` : pct(b.sent, b.total)],
    ["Lỗi", String(b.failed), pct(b.failed, b.total)],
    ["Bỏ qua", String(b.skipped), pct(b.skipped, b.total)],
    ["Mở", email ? String(b.opened) : "–", email ? `${pct(b.opened, b.sent)} số đã gửi` : "Chỉ đếm với email"],
    ["Nhấp", email ? String(b.clicked) : "–", email ? `${pct(b.clicked, b.sent)} số đã gửi · ${pct(b.clicked, b.opened)} số đã mở` : "Chỉ đếm với email"],
  ];

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/broadcasts" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <Icon name="chevron" size={14} className="rotate-90" /> Gửi hàng loạt
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-[24px] font-semibold">{b.name}</h1>
            <span className="inline-flex h-6 items-center rounded px-2 text-[12px] font-medium text-white" style={{ background: color }}>
              {label}
            </span>
          </div>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {CHANNEL_LABEL[b.channel as MsgChannel] ?? b.channel} · {b.segmentId ? `Nhóm ${seg?.name ?? "đã xoá"}` : "Tất cả khách"}
            {b.scheduledAt && ` · ${b.status === "scheduled" ? "Hẹn gửi" : "Bắt đầu"} ${time(b.startedAt ?? b.scheduledAt)}`}
            {b.finishedAt && ` · Kết thúc ${ago(b.finishedAt)}`}
            {b.createdBy && ` · Tạo bởi ${b.createdBy}`}
          </p>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Link href={`/w/broadcasts/${b.id}?edit=1`} className="btn-outline">
                <Icon name="edit" size={16} /> Sửa
              </Link>
            )}
            <BroadcastActions id={b.id} status={b.status} name={b.name} />
          </div>
        )}
      </div>

      {(b.status === "sending" || b.status === "scheduled") && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {b.status === "scheduled" ? "Chờ tới giờ gửi." : `Đã xử lý ${done}/${b.total} người nhận (${progress}%). Mỗi phút gửi tối đa 30 tin.`}
          </p>
        </div>
      )}

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([k, v, hint]) => (
          <div key={k} className="card p-4">
            <p className="text-[12.5px] text-ink-2">{k}</p>
            <p className="tnum mt-1 text-[24px] font-semibold leading-tight">{v}</p>
            {hint && <p className="mt-0.5 text-[12px] text-ink-2">{hint}</p>}
          </div>
        ))}
      </section>

      {!!errors.length && (
        <section className="card mt-5 p-4">
          <h2 className="section-title">Lý do lỗi / bỏ qua</h2>
          <ul className="mt-2 grid gap-1.5 text-[13.5px]">
            {errors.map((e) => (
              <li key={e.error} className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words text-danger">{e.error || "Không rõ"}</span>
                <span className="tnum flex-none font-medium">{e._count._all} tin</span>
              </li>
            ))}
          </ul>
          {errors.some((e) => /cấu hình/i.test(e.error)) && (
            <p className="mt-2 text-[12.5px] text-ink-2">
              Kênh chưa cấu hình: vào <Link href="/w/marketing" className="text-primary hover:underline">Marketing → Kênh gửi</Link> để nhập khoá, rồi tạo lại đợt gửi.
            </p>
          )}
        </section>
      )}

      <section className="mt-5">
        <h2 className="section-title">Tin gần nhất</h2>
        <div className="card mt-2 overflow-hidden">
          {!messages.length && <p className="px-4 py-10 text-center text-[13.5px] text-ink-2">{b.status === "draft" ? "Đợt gửi đang là nháp." : b.status === "scheduled" ? "Chưa tới giờ gửi." : "Chưa có tin nào."}</p>}
          <ul className="divide-y divide-[var(--line-soft)]">
            {messages.map((m) => {
              const [sl, sc] = STATUS_LABEL[m.status] ?? [m.status, "#c4c4c4"];
              const r = m.recordId ? rec.get(m.recordId) : undefined;
              return (
                <li key={m.id} className="grid gap-1 px-4 py-3 text-[13.5px] md:grid-cols-[110px_minmax(0,1fr)_90px] md:items-start md:gap-3">
                  <span className="text-ink-2">{ago(m.createdAt)}</span>
                  <span className="min-w-0">
                    <span className="block truncate">
                      {r ? (
                        <Link href={`/w/b/${r.objectKey}?open=${r.id}`} className="font-medium hover:underline">
                          {r.title}
                        </Link>
                      ) : (
                        <b className="font-medium">{m.recordId ? "Khách đã xoá" : "Không gắn khách"}</b>
                      )}
                      <span className="text-ink-2"> · {m.to || "không có địa chỉ"}</span>
                    </span>
                    {m.error && <span className="mt-0.5 block break-words text-[12.5px] text-danger">{m.error}</span>}
                  </span>
                  <span className="inline-flex h-6 w-fit items-center rounded px-2 text-[12px] font-medium text-white" style={{ background: sc }}>
                    {sl}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="card mt-5 p-4">
        <h2 className="section-title">Nội dung</h2>
        {b.subject && <p className="mt-2 font-medium">{b.subject}</p>}
        {b.templateId && <p className="mt-1 text-[13px] text-ink-2">Template ZNS: {b.templateId}</p>}
        <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-ink-2">{b.body}</p>
      </section>
    </div>
  );
}
