import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getRole } from "@/lib/permissions";
import { B_STATUS } from "@/lib/marketing/broadcast";
import { CHANNEL_COLOR, CHANNEL_LABEL, type MsgChannel } from "@/lib/marketing/shared";
import { ago, dateVi } from "@/lib/format";
import { Icon } from "@/components/Icon";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default async function BroadcastsPage() {
  const { user, workspace } = await requireApp();
  const manage = can(await getRole(user.id, workspace.id), "manage_marketing");
  const list = await db.broadcast.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const segIds = [...new Set(list.map((b) => b.segmentId).filter((x): x is string => !!x))];
  const segs = segIds.length ? await db.segment.findMany({ where: { id: { in: segIds } }, select: { id: true, name: true } }) : [];
  const segName = new Map(segs.map((s) => [s.id, s.name]));
  const sent = list.reduce((s, b) => s + b.sent, 0);

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold">Gửi hàng loạt</h1>
          <p className="mt-1 max-w-3xl text-ink-2">Gửi email, SMS, Zalo ZNS, Zalo OA cho cả nhóm khách một lần: tự bỏ người đã từ chối, thiếu địa chỉ, trùng số. Đếm lượt mở và nhấp với email.</p>
        </div>
        {manage && (
          <Link href="/w/broadcasts/new" className="btn-primary">
            <Icon name="plus" size={16} /> Tạo đợt gửi
          </Link>
        )}
      </div>

      {!!list.length && (
        <p className="mt-4 text-[13px] text-ink-2">
          {list.length} đợt · <span className="tnum">{sent.toLocaleString("vi-VN")}</span> tin đã gửi
        </p>
      )}
      <section className="mt-2 grid gap-3">
        {!list.length && (
          <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-selected text-primary">
              <Icon name="megaphone" />
            </span>
            <h2 className="text-[17px] font-semibold">Chưa có đợt gửi nào</h2>
            <p className="max-w-lg text-[14px] text-ink-2">Tạo đợt gửi đầu tiên: chọn kênh, chọn nhóm khách, viết nội dung với biến {"{ten}"} rồi gửi thử cho chính bạn trước.</p>
          </div>
        )}
        {list.map((b) => {
          const [label, color] = B_STATUS[b.status] ?? [b.status, "#c4c4c4"];
          const ch = b.channel as MsgChannel;
          return (
            <Link key={b.id} href={`/w/broadcasts/${b.id}`} className="card card-hover grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate text-[15.5px] font-semibold">{b.name}</h3>
                  <span className="inline-flex h-5 items-center rounded px-1.5 text-[11.5px] font-medium text-white" style={{ background: color }}>
                    {label}
                  </span>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[ch] }} />
                    {CHANNEL_LABEL[ch] ?? b.channel}
                  </span>
                  <span>· {b.segmentId ? `Nhóm ${segName.get(b.segmentId) ?? "đã xoá"}` : "Tất cả khách"}</span>
                  <span>· {b.status === "scheduled" && b.scheduledAt ? `Gửi lúc ${dateVi(b.scheduledAt)} ${b.scheduledAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : b.finishedAt ? `Xong ${ago(b.finishedAt)}` : `Tạo ${ago(b.createdAt)}`}</span>
                </p>
              </div>
              <dl className="grid grid-cols-4 gap-3 text-center text-[12px] text-ink-2 md:flex md:gap-5">
                {[
                  ["đã gửi", String(b.sent)],
                  ["lỗi", String(b.failed)],
                  ["mở", b.channel === "email" ? pct(b.opened, b.sent) : "–"],
                  ["nhấp", b.channel === "email" ? pct(b.clicked, b.sent) : "–"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dd className="tnum text-[16px] font-semibold text-ink">{v}</dd>
                    <dt>{k}</dt>
                  </div>
                ))}
              </dl>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
