"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Quote } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { LinesView, TotalsBox } from "@/components/sales/LinesView";
import { QuoteBadge } from "@/components/sales/Status";
import type { Line } from "@/lib/sales/lines";
import { dmy, quoteExpired, type Ser } from "@/lib/sales/shared";

type Rec = { id: string; title: string; objectKey: string } | null;
type Perm = { seeAll: boolean; mine: boolean; editable: boolean; canDelete: boolean };

export function QuoteDetail({ q: initial, items, deal, contact, order, link, perm, dealLabel }: { q: Ser<Quote>; items: Line[]; deal: Rec; contact: Rec; order: { id: string; number: string } | null; link: string; perm: Perm; dealLabel: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<"reject" | "accept" | "delete" | null>(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const expired = quoteExpired(q);
  const st = q.status;

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/quotes/${q.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setAsk(null);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Không thực hiện được" }), null;
    return j;
  }

  const run = async (action: string, done: string, extra?: Record<string, unknown>) => {
    const j = await act(action, extra);
    if (!j) return;
    if (action === "order" && j.orderId) return router.push(`/w/orders/${j.orderId}`);
    if (action === "duplicate" && j.id) return router.push(`/w/quotes/${j.id}?edit=1`);
    if (j.id) setQ((x) => ({ ...x, ...j }));
    setMsg({ ok: true, text: j.message ?? done });
    router.refresh();
  };

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/quotes/${q.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Không xoá được" });
    router.push("/w/quotes");
    router.refresh();
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg({ ok: false, text: "Trình duyệt không cho sao chép, hãy chọn và copy link thủ công" });
    }
  };

  const canSend = perm.mine && !expired && (st === "approved" || st === "sent" || (perm.seeAll && st === "draft"));
  const canAccept = perm.mine && !expired && (st === "approved" || st === "sent");
  const canOrder = ["approved", "sent", "accepted"].includes(st);

  return (
    <div className="mt-1 grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-semibold">
            <span className="tnum">{q.number}</span>
            <QuoteBadge q={q} />
          </h1>
          <p className="mt-1 text-ink-2">
            {q.title || "Báo giá"} · lập bởi {q.createdBy || "–"} ngày <span suppressHydrationWarning>{dmy(q.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perm.editable && (
            <Link href={`/w/quotes/${q.id}?edit=1`} className="btn-outline">
              <Icon name="edit" size={15} /> Sửa
            </Link>
          )}
          <Link href={`/w/quotes/${q.id}/print`} className="btn-outline">
            <Icon name="download" size={15} /> In / PDF
          </Link>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => run("duplicate", "Đã nhân bản")}>
            <Icon name="copy" size={15} /> Nhân bản
          </button>
          {perm.canDelete && (
            <button type="button" className="btn-ghost text-[#df2f4a]" onClick={() => setAsk("delete")}>
              <Icon name="trash" size={15} /> Xoá
            </button>
          )}
        </div>
      </div>

      {/* Thanh việc cần làm theo trạng thái */}
      <section className="card flex flex-wrap items-center gap-2 p-3">
        {st === "draft" && !perm.seeAll && perm.mine && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run("submit", "Đã gửi duyệt, quản lý sẽ nhận thông báo")}>
            <Icon name="send" size={15} /> Gửi duyệt
          </button>
        )}
        {perm.seeAll && (st === "pending" || st === "draft") && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run("approve", "Đã duyệt báo giá")}>
            <Icon name="check" size={15} /> Duyệt
          </button>
        )}
        {perm.seeAll && st === "pending" && (
          <button type="button" className="btn-outline" disabled={busy} onClick={() => (setText(""), setAsk("reject"))}>
            Không duyệt
          </button>
        )}
        {canSend && (
          <button type="button" className={st === "approved" ? "btn-primary" : "btn-outline"} disabled={busy} onClick={() => run("send", st === "sent" ? "Link báo giá ở bên dưới" : "Đã chuyển sang Đã gửi. Gửi link cho khách nhé.")}>
            <Icon name="link" size={15} /> {st === "sent" ? "Lấy link" : "Gửi khách"}
          </button>
        )}
        {canAccept && (
          <button type="button" className="btn-outline" disabled={busy} onClick={() => (setText(q.customerName), setAsk("accept"))}>
            <Icon name="check" size={15} /> Khách đồng ý
          </button>
        )}
        {order ? (
          <Link href={`/w/orders/${order.id}`} className="btn-outline">
            <Icon name="cart" size={15} /> Đơn {order.number}
          </Link>
        ) : (
          canOrder && (
            <button type="button" className={st === "accepted" ? "btn-primary" : "btn-outline"} disabled={busy} onClick={() => run("order", "Đã tạo đơn")}>
              <Icon name="cart" size={15} /> Tạo đơn hàng
            </button>
          )
        )}
        {st === "pending" && !perm.seeAll && <span className="text-[13.5px] text-ink-2">Đang chờ quản lý duyệt.</span>}
        {expired && <span className="text-[13.5px] text-warning">Báo giá đã hết hạn. Sửa ngày hiệu lực hoặc nhân bản để gửi lại.</span>}
        {q.rejectReason && st !== "accepted" && <span className="text-[13.5px] text-danger">Lý do: {q.rejectReason}</span>}
      </section>

      {ask && (
        <section className="card anim-fade grid gap-2 p-4">
          {ask === "delete" ? (
            <p className="text-[14px]">Xoá hẳn báo giá {q.number}? Không hoàn tác được.</p>
          ) : (
            <label className="grid gap-1">
              <span className="label">{ask === "reject" ? "Lý do không duyệt (người lập sẽ thấy)" : "Tên người đại diện khách xác nhận"}</span>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={ask === "reject" ? 500 : 120} autoFocus />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ask === "delete" ? "btn bg-[#df2f4a] text-white" : "btn-primary"}
              disabled={busy}
              onClick={() => (ask === "delete" ? remove() : ask === "reject" ? run("reject", "Đã trả báo giá về nháp", { reason: text }) : run("accept", "Đã ghi nhận khách đồng ý và tạo đơn hàng", { name: text }))}
            >
              {ask === "delete" ? "Xoá" : ask === "reject" ? "Trả về nháp" : "Xác nhận"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAsk(null)}>
              Huỷ
            </button>
          </div>
        </section>
      )}

      {msg && (
        <p role="status" className={`rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      {(st === "sent" || st === "accepted" || st === "rejected") && (
        <section className="card grid gap-2 p-4">
          <h2 className="section-title">Link gửi khách</h2>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input readOnly value={link} aria-label="Link báo giá công khai" className="input min-w-0 flex-1 basis-60 font-mono text-[12.5px]" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-outline h-9" onClick={copy}>
              <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Đã chép" : "Chép link"}
            </button>
            <a href={link} target="_blank" rel="noreferrer" className="btn-ghost h-9">
              <Icon name="open" size={15} /> Mở
            </a>
          </div>
          {st === "sent" && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-ink-2">Gửi tự động:</span>
              <button type="button" className="btn-ghost h-8" disabled={busy || !q.contactId} title={q.contactId ? "" : "Cần gắn khách trong CRM"} onClick={() => run("message", "Đã gửi", { channel: "zalo" })}>
                <Icon name="chat" size={15} /> Zalo
              </button>
              <button type="button" className="btn-ghost h-8" disabled={busy || !q.customerEmail} title={q.customerEmail ? "" : "Báo giá chưa có email khách"} onClick={() => run("message", "Đã gửi", { channel: "email" })}>
                <Icon name="mail" size={15} /> Email
              </button>
              <button type="button" className="btn-ghost h-8" disabled={busy || !q.customerPhone} title={q.customerPhone ? "" : "Báo giá chưa có SĐT khách"} onClick={() => run("message", "Đã gửi", { channel: "sms" })}>
                <Icon name="sms" size={15} /> SMS
              </button>
            </div>
          )}
          <p className="text-[12.5px] text-ink-2" suppressHydrationWarning>
            {q.viewedAt ? `Khách đã mở lần đầu lúc ${new Date(q.viewedAt).toLocaleString("vi-VN")}` : "Khách chưa mở link."}
            {q.acceptedAt && ` · ${q.acceptedName || "Khách"} chấp nhận ngày ${dmy(q.acceptedAt)}`}
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card grid min-w-0 grid-cols-1 gap-4 p-4">
          <LinesView lines={items} />
          <TotalsBox t={q} words />
          {q.note && (
            <div>
              <h3 className="section-title">Ghi chú</h3>
              <p className="mt-1 whitespace-pre-line text-[14px]">{q.note}</p>
            </div>
          )}
          {q.terms && (
            <div>
              <h3 className="section-title">Điều khoản</h3>
              <p className="mt-1 whitespace-pre-line text-[13.5px] text-ink-2">{q.terms}</p>
            </div>
          )}
        </section>
        <aside className="card grid content-start gap-3 p-4 text-[14px]">
          <div>
            <p className="label">Khách</p>
            <p className="mt-0.5 font-medium">{q.customerName}</p>
            <p className="text-[13px] text-ink-2 tnum">{[q.customerPhone, q.customerEmail].filter(Boolean).join(" · ")}</p>
            {contact && (
              <Link href={`/w/b/${contact.objectKey}?open=${contact.id}`} className="mt-1 inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                <Icon name="person" size={13} /> Mở hồ sơ khách
              </Link>
            )}
          </div>
          {deal && (
            <div>
              <p className="label">{dealLabel}</p>
              <Link href={`/w/b/${deal.objectKey}?open=${deal.id}`} className="mt-0.5 inline-block font-medium text-primary hover:underline">
                {deal.title}
              </Link>
            </div>
          )}
          <div>
            <p className="label">Hiệu lực đến</p>
            <p className="mt-0.5 tnum" suppressHydrationWarning>
              {dmy(q.validUntil) || "Không giới hạn"}
            </p>
          </div>
          {q.approvedBy && (
            <div>
              <p className="label">Duyệt</p>
              <p className="mt-0.5" suppressHydrationWarning>
                {q.approvedBy} · {dmy(q.approvedAt)}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
