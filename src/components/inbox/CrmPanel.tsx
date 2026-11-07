"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { Skeleton, toast } from "@/components/ui";
import { CreateTicketButton } from "@/components/care/CreateTicketButton";
import { SendSurveyButton } from "@/components/survey/SendSurveyButton";
import { IssueVoucherDrawer } from "@/components/voucher/IssueVoucherDrawer";
import { color } from "@/lib/colors";
import { ago, viMessage } from "@/lib/format";
import type { InboxDetail } from "@/lib/inbox-types";
import { OrderDrawer } from "./OrderDrawer";
import { QualityCard } from "./QualityCard";
import { api, ChannelBadge, Face, type Perms } from "./shared";

export type StatusOpt = { key: string; label: string; color: string };
export type CrmLabels = { contact: string; deal: string; appointment: string };

type Summary = {
  owner: string;
  status: string;
  totalSpent: number;
  orderCount: number;
  lastOrderAt: string | null;
  openTickets: number;
  lastNps: number | null;
  loyalty: { enabled: boolean; balance: number; tier: { name?: string } | null };
  score: number;
  rfm: { label: string; color: string } | null;
};
type TItem = { id: string; at: string; kind: string; icon: string; title: string; detail?: string; href?: string };
type OrderRow = { id: string; number: string; status: string; total: number; paid: number; createdAt: string };
type Detected = { name: string; phones: string[]; emails: string[]; address: string };
type Dupe = { id: string; title: string; owner: string; reason: string; href?: string };

/** "10/11" (ngày/tháng). toLocaleDateString("vi-VN") cho dạng "10-11", không quen mắt. Chuỗi "YYYY-MM-DD" đọc thẳng, không lệch múi giờ. */
const dm = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return `${m[3]}/${m[2]}`;
  const x = new Date(d);
  return isNaN(x.getTime()) ? d : `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}`;
};
const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;
const ORDER_ST: Record<string, string> = { new: "Mới", confirmed: "Đã xác nhận", shipping: "Đang giao", done: "Hoàn tất", cancelled: "Đã huỷ" };

type Props = {
  detail: InboxDetail;
  me: string;
  labels: CrmLabels;
  statuses: StatusOpt[];
  hasAppointments: boolean;
  hasDeals: boolean;
  perms: Perms;
  businessName: string;
  /** SĐT người dùng bấm "Lưu vào khách" trong tin nhắn (nonce để bấm lại cùng số vẫn chạy). */
  savePhone: { phone: string; n: number } | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
};

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded bg-surface px-2 py-1.5">
      <div className="truncate text-[11px] text-ink-2">{label}</div>
      <div className={`truncate text-[13.5px] font-semibold tnum ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

/** Thẻ khách trong hội thoại + thao tác CRM ngay từ chat. */
export function CrmPanel({ detail, me, labels, statuses, hasAppointments, hasDeals, perms, businessName, savePhone, onBack, onChanged }: Props) {
  const { conversation: conv, record: r, activities } = detail;
  const term = labels.contact.toLowerCase();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [timeline, setTimeline] = useState<TItem[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingCard, setLoadingCard] = useState(false);
  const [mode, setMode] = useState<"" | "create" | "link" | "edit">("");
  const [detected, setDetected] = useState<Detected | null>(null);
  const [form, setForm] = useState({ title: "", phone: "", email: "", address: "", note: "" });
  const [dupes, setDupes] = useState<Dupe[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; title: string; phone: string; status: string }[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [mini, setMini] = useState<"" | "deal" | "appt">("");
  const [deal, setDeal] = useState({ title: "", amount: "" });
  const [appt, setAppt] = useState({ date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), time: "09:00", note: "" });
  const [edit, setEdit] = useState({ title: "", phone: "", email: "", address: "", status: "" });

  const recordId = r?.id ?? null;
  // Thẻ 360°: tổng chi, đơn gần nhất, NPS, dòng thời gian. Chặn kết quả cũ khi đổi hội thoại nhanh.
  const seq = useRef(0);
  const loadCard = useCallback(async () => {
    const my = ++seq.current;
    if (!recordId) {
      setSummary(null);
      setTimeline([]);
      setOrders([]);
      return;
    }
    setLoadingCard(true);
    try {
      const [c, o] = await Promise.all([
        api<{ summary: Summary | null; timeline: { items?: TItem[] } | TItem[] }>(`/api/c360/${recordId}?limit=6`).catch(() => null),
        api<{ orders: OrderRow[] }>(`/api/inbox/${conv.id}/order`).catch(() => ({ orders: [] })),
      ]);
      if (my !== seq.current) return;
      setSummary(c?.summary ?? null);
      const tl = c?.timeline;
      setTimeline((Array.isArray(tl) ? tl : (tl?.items ?? [])).slice(0, 6));
      setOrders(o.orders);
    } finally {
      if (my === seq.current) setLoadingCard(false);
    }
  }, [recordId, conv.id]);
  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  // Đổi hội thoại: đóng form đang mở.
  useEffect(() => {
    setMode("");
    setMini("");
    setErr("");
    setDetected(null);
  }, [conv.id]);

  async function openCreate(phone?: string) {
    setMode("create");
    setErr("");
    setForm({ title: /^Khách\b/.test(conv.name) ? "" : conv.name, phone: phone ?? conv.phones[0] ?? "", email: "", address: "", note: "" });
    try {
      const d = await api<Detected>(`/api/inbox/${conv.id}/contact`);
      setDetected(d);
      setForm((f) => ({ ...f, title: f.title || d.name, phone: f.phone || d.phones[0] || "", email: f.email || d.emails[0] || "", address: f.address || d.address }));
    } catch {
      setDetected(null);
    }
  }

  // Kiểm tra trùng khi nhập tên / SĐT / email (chờ 400ms, bỏ kết quả cũ).
  useEffect(() => {
    if (mode !== "create") return;
    const { phone, email, title } = form;
    if (!phone.trim() && !email.trim()) {
      setDupes([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const u = new URLSearchParams({ phone, email, name: title });
        const res = await api<{ matches: Dupe[] }>(`/api/c360/duplicates/check?${u}`);
        if (live) setDupes(res.matches);
      } catch {
        if (live) setDupes([]);
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [mode, form]);

  // Tìm khách có sẵn để nối.
  useEffect(() => {
    if (mode !== "link") return;
    let live = true;
    setFound(null);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: NonNullable<typeof found> }>(`/api/inbox/${conv.id}/link?q=${encodeURIComponent(q)}`);
        if (live) setFound(res.items);
      } catch {
        if (live) setFound([]);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, mode, conv.id]);

  async function run<T>(label: string, fn: () => Promise<T>, okMsg?: string) {
    if (busy) return null;
    setBusy(label);
    setErr("");
    try {
      const v = await fn();
      if (okMsg) toast(okMsg);
      return v;
    } catch (e) {
      setErr(viMessage(e, "Có lỗi, thử lại nhé"));
      return null;
    } finally {
      setBusy("");
    }
  }

  const link = (body: Record<string, unknown>, msg: string) =>
    run(
      "link",
      async () => {
        await api(`/api/inbox/${conv.id}/link`, { method: "POST", json: body });
        setMode("");
        await onChanged();
      },
      msg,
    );

  async function unlink() {
    if (!r || !confirm(`Bỏ gắn hội thoại này khỏi hồ sơ ${r.title}?`)) return;
    await run(
      "unlink",
      async () => {
        await api(`/api/inbox/${conv.id}`, { method: "PATCH", json: { recordId: null } });
        await onChanged();
      },
      "Đã bỏ gắn",
    );
  }

  function openEdit() {
    if (!r) return;
    setEdit({ title: r.title, phone: r.phone, email: r.email, address: r.address, status: r.status });
    setMode("edit");
  }
  async function saveEdit() {
    if (!r) return;
    const data: Record<string, string> = {};
    if (r.phoneKey && edit.phone !== r.phone) data[r.phoneKey] = edit.phone.trim();
    if (r.emailKey && edit.email !== r.email) data[r.emailKey] = edit.email.trim();
    if (r.addressKey && edit.address !== r.address) data[r.addressKey] = edit.address.trim();
    const body: Record<string, unknown> = {};
    if (edit.title.trim() && edit.title !== r.title) body.title = edit.title.trim();
    if (edit.status && edit.status !== r.status) body.status = edit.status;
    if (Object.keys(data).length) body.data = data;
    if (!Object.keys(body).length) return setMode("");
    await run(
      "edit",
      async () => {
        await api(`/api/records/${r.id}`, { method: "PATCH", json: body });
        setMode("");
        await onChanged();
        await loadCard();
      },
      "Đã lưu thông tin khách",
    );
  }

  // "Lưu vào khách" từ SĐT trong tin nhắn.
  const lastSave = useRef(0);
  useEffect(() => {
    if (!savePhone || savePhone.n === lastSave.current) return;
    lastSave.current = savePhone.n;
    if (!r) {
      void openCreate(savePhone.phone);
      return;
    }
    if (!r.phoneKey) {
      toast("Bảng khách chưa có ô số điện thoại", "error");
      return;
    }
    if (r.phone.replace(/\D/g, "") === savePhone.phone) {
      toast("Số này đã có trong hồ sơ");
      return;
    }
    if (r.phone && !confirm(`Thay số ${r.phone} bằng ${savePhone.phone} trong hồ sơ ${r.title}?`)) return;
    void run(
      "phone",
      async () => {
        await api(`/api/records/${r.id}`, { method: "PATCH", json: { data: { [r.phoneKey]: savePhone.phone } } });
        await onChanged();
      },
      `Đã lưu ${savePhone.phone} vào hồ sơ`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savePhone]);

  async function createDeal() {
    if (!deal.title.trim()) return setErr(`Cần tên ${labels.deal.toLowerCase()}`);
    const res = await run("deal", () => api<{ href: string; title: string }>(`/api/inbox/${conv.id}/contact`, { method: "POST", json: { action: "deal", title: deal.title, amount: Number(deal.amount) || 0 } }));
    if (res) {
      toast(`Đã tạo ${labels.deal.toLowerCase()} “${res.title}”`);
      setMini("");
      setDeal({ title: "", amount: "" });
      void loadCard();
    }
  }
  async function createAppt() {
    const res = await run("appt", () => api<{ href: string; title: string }>(`/api/inbox/${conv.id}/contact`, { method: "POST", json: { action: "appointment", date: appt.date, time: appt.time, note: appt.note } }));
    if (res) {
      toast(`Đã đặt ${labels.appointment.toLowerCase()} ${appt.time} ${dm(appt.date)}`);
      setMini("");
      void loadCard();
    }
  }

  const st = r ? color(r.statusColor) : null;
  const needRec = !r;
  const ActBtn = ({ icon, label, onClick, disabled, title }: { icon: string; label: string; onClick?: () => void; disabled?: boolean; title?: string }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className="btn-outline h-9 justify-start px-2.5 text-[12.5px]">
      <Icon name={icon} size={14} /> <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="min-w-0 p-4">
      <button type="button" onClick={onBack} className="btn-ghost -ml-2 mb-2 h-8 px-2 text-[13px] xl:hidden">
        <Icon name="chevron" size={16} className="rotate-90" /> Quay lại hội thoại
      </button>
      <div className="flex items-center gap-3">
        <Face c={conv} size={44} />
        <div className="min-w-0">
          <b className="block truncate text-[15px]">{r?.title ?? conv.name}</b>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2">
            <ChannelBadge channel={conv.channel} small page={conv.pageName || undefined} />
            <span className="truncate">{conv.assignee ? `Phụ trách chat: ${conv.assignee}` : "Chưa giao"}</span>
          </span>
        </div>
      </div>

      {r ? (
        <div className="card mt-4 p-3">
          {mode === "edit" ? (
            <form
              className="grid grid-cols-[minmax(0,1fr)] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit();
              }}
            >
              <label className="text-[12px] text-ink-2">
                Tên
                <input className="input mt-0.5 h-8" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              </label>
              {r.phoneKey && (
                <label className="text-[12px] text-ink-2">
                  Điện thoại
                  <input className="input mt-0.5 h-8 tnum" inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} list="crm-phones" />
                </label>
              )}
              {r.emailKey && (
                <label className="text-[12px] text-ink-2">
                  Email
                  <input className="input mt-0.5 h-8" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                </label>
              )}
              {r.addressKey && (
                <label className="text-[12px] text-ink-2">
                  Địa chỉ
                  <input className="input mt-0.5 h-8" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
                </label>
              )}
              {statuses.length > 0 && (
                <label className="text-[12px] text-ink-2">
                  Trạng thái
                  <select className="input mt-0.5 h-8 py-0" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                    {statuses.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <datalist id="crm-phones">
                {conv.phones.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="mt-1 flex gap-2">
                <button className="btn-primary h-8 flex-1 justify-center text-[13px]" disabled={!!busy} aria-busy={busy === "edit"}>
                  {busy === "edit" ? "Đang lưu…" : "Lưu"}
                </button>
                <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setMode("")}>
                  Huỷ
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <dl className="grid min-w-0 flex-1 grid-cols-[80px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px]">
                  <dt className="text-ink-2">Điện thoại</dt>
                  <dd className="truncate tnum">{r.phone ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : <span className="text-ink-2">Chưa có</span>}</dd>
                  {r.email && (
                    <>
                      <dt className="text-ink-2">Email</dt>
                      <dd className="truncate">{r.email}</dd>
                    </>
                  )}
                  {r.address && (
                    <>
                      <dt className="text-ink-2">Địa chỉ</dt>
                      <dd className="line-clamp-2">{r.address}</dd>
                    </>
                  )}
                  <dt className="text-ink-2">Trạng thái</dt>
                  <dd>
                    <span className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[12px]" style={{ background: st!.bg, color: st!.fg }}>
                      {r.statusLabel}
                    </span>
                  </dd>
                  <dt className="text-ink-2">Phụ trách</dt>
                  <dd className="flex min-w-0 items-center gap-1 truncate">{r.owner ? <><Avatar name={r.owner} size={16} /> {r.owner}</> : <span className="text-ink-2">Chưa có</span>}</dd>
                  {r.source && (
                    <>
                      <dt className="text-ink-2">Nguồn</dt>
                      <dd className="truncate">{r.source}</dd>
                    </>
                  )}
                </dl>
                <span className="flex-none rounded px-1.5 py-0.5 text-[12px] font-semibold text-white tnum" style={{ background: r.score >= 70 ? "#df2f4a" : r.score >= 40 ? "#fdab3d" : "#579bfc" }} title="Điểm khách">
                  {r.score}
                </span>
              </div>
              {loadingCard && !summary ? (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full rounded" />
                  ))}
                </div>
              ) : (
                summary && (
                  <div className="mt-3 grid grid-cols-2 gap-1.5 rounded bg-surface-2 p-1.5">
                    <Stat label="Tổng chi" value={money(summary.totalSpent)} />
                    <Stat label="Số đơn" value={summary.orderCount} />
                    <Stat label="Đơn gần nhất" value={summary.lastOrderAt ? dm(summary.lastOrderAt) : "—"} />
                    <Stat label="NPS gần nhất" value={summary.lastNps ?? "—"} tone={summary.lastNps == null ? "" : summary.lastNps >= 9 ? "text-success" : summary.lastNps <= 6 ? "text-danger" : "text-warning"} />
                    {summary.openTickets > 0 && <Stat label="Phiếu đang mở" value={summary.openTickets} tone="text-warning" />}
                    {summary.loyalty.enabled && <Stat label="Điểm thưởng" value={`${summary.loyalty.balance}${summary.loyalty.tier?.name ? ` · ${summary.loyalty.tier.name}` : ""}`} />}
                    {summary.rfm && <Stat label="Nhóm RFM" value={summary.rfm.label} />}
                  </div>
                )
              )}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <Link href={`/w/b/contacts?open=${r.id}`} className="btn-outline h-8 justify-center px-1 text-[12.5px]">
                  <Icon name="open" size={13} /> Hồ sơ
                </Link>
                <button type="button" className="btn-outline h-8 justify-center px-1 text-[12.5px]" onClick={openEdit}>
                  <Icon name="edit" size={13} /> Sửa
                </button>
                <Link href={`/w/telesales?record=${r.id}`} className="btn-primary h-8 justify-center px-1 text-[12.5px]">
                  <Icon name="phone" size={13} /> Gọi
                </Link>
              </div>
              <button type="button" onClick={unlink} disabled={!!busy} className="mt-2 w-full text-center text-[12px] text-ink-2 hover:text-ink hover:underline">
                Bỏ gắn hồ sơ
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="card mt-4 p-3">
          <p className="text-[13px] text-ink-2">Hội thoại chưa gắn với {term} nào. Gắn để xem lịch sử mua, chấm điểm, tạo đơn và gọi điện.</p>
          {mode === "" && (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
              <button type="button" className="btn-primary justify-center" onClick={() => void openCreate()}>
                <Icon name="plus" size={14} /> Tạo {term}
              </button>
              <button type="button" className="btn-outline justify-center" onClick={() => setMode("link")}>
                <Icon name="link" size={14} /> Nối với {term} có sẵn
              </button>
            </div>
          )}
          {mode === "create" && (
            <form
              className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void link({ mode: "create", ...form }, `Đã tạo ${term} ${form.title}`);
              }}
            >
              <label className="text-[12px] text-ink-2">
                Tên
                <input className="input mt-0.5 h-8" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </label>
              <label className="text-[12px] text-ink-2">
                Số điện thoại
                <input className="input mt-0.5 h-8 tnum" inputMode="tel" placeholder="Không bắt buộc" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} list="crm-detected-phones" />
              </label>
              <datalist id="crm-detected-phones">
                {[...new Set([...conv.phones, ...(detected?.phones ?? [])])].map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {(detected?.phones.length ?? 0) > 1 && (
                <div className="flex flex-wrap gap-1">
                  {detected!.phones.map((p) => (
                    <button key={p} type="button" className={`chip h-6 px-2 text-[11.5px] ${form.phone === p ? "chip-on" : ""}`} onClick={() => setForm({ ...form, phone: p })}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
              <label className="text-[12px] text-ink-2">
                Email
                <input className="input mt-0.5 h-8" type="email" placeholder="Không bắt buộc" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="text-[12px] text-ink-2">
                Địa chỉ
                <input className="input mt-0.5 h-8" placeholder="Không bắt buộc" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label className="text-[12px] text-ink-2">
                Ghi chú
                <textarea className="textarea mt-0.5 text-[13px]" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </label>
              {dupes.length > 0 && (
                <div className="rounded border border-warning/40 bg-warning-soft px-2.5 py-2 text-[12.5px]" role="alert">
                  <b className="text-warning">Có thể trùng khách đã có:</b>
                  <ul className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-1">
                    {dupes.slice(0, 4).map((d, i) => (
                      <li key={d.id || i} className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate">
                          {d.title} · {d.reason}
                          {d.owner ? ` · ${d.owner}` : ""}
                        </span>
                        {d.id && (
                          <button type="button" className="flex-none font-medium text-primary hover:underline" disabled={!!busy} onClick={() => void link({ mode: "existing", recordId: d.id }, `Đã nối với ${d.title}`)}>
                            Nối khách này
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-1 flex gap-2">
                <button className="btn-primary flex-1 justify-center" disabled={!!busy} aria-busy={busy === "link"}>
                  {busy === "link" ? "Đang tạo…" : dupes.length ? `Vẫn tạo ${term} mới` : `Tạo ${term}`}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMode("")}>
                  Huỷ
                </button>
              </div>
            </form>
          )}
          {mode === "link" && (
            <div className="mt-3">
              <input className="input" autoFocus placeholder="Tìm theo tên hoặc số điện thoại" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Tìm ${term}`} />
              <ul className="mt-2 max-h-60 overflow-y-auto">
                {found === null ? (
                  <li className="px-2 py-2">
                    <Skeleton lines={2} />
                  </li>
                ) : (
                  found.map((f) => (
                    <li key={f.id}>
                      <button type="button" disabled={!!busy} onClick={() => void link({ mode: "existing", recordId: f.id }, `Đã nối với ${f.title}`)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover">
                        <Avatar name={f.title} size={24} />
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-[13px] font-medium">{f.title}</b>
                          <span className="block truncate text-[11.5px] text-ink-2">{[f.phone, f.status].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                    </li>
                  ))
                )}
                {found && !found.length && <li className="px-2 py-2 text-[12.5px] text-ink-2">Không tìm thấy {term} phù hợp.</li>}
              </ul>
              <button type="button" className="btn-ghost mt-1 h-7 text-[12.5px]" onClick={() => setMode("")}>
                Huỷ
              </button>
            </div>
          )}
        </div>
      )}
      {perms.quality && <QualityCard convId={conv.id} canRescore={perms.rescore} version={conv.lastOutAt ?? ""} />}
      {err && (
        <p className="mt-2 rounded bg-danger-soft px-2 py-1 text-[12px] text-danger" role="alert">
          {err}
        </p>
      )}

      <h3 className="label mt-5">Thao tác từ chat</h3>
      <div data-tour="inbox-order" className="mt-2 grid grid-cols-2 gap-1.5">
        <ActBtn icon="cart" label="Tạo đơn hàng" onClick={() => setOrderOpen(true)} disabled={!perms.salesCreate} title={perms.salesCreate ? undefined : "Cần quyền tạo chứng từ bán hàng"} />
        {perms.salesCreate && r ? (
          <Link href={`/w/quotes/new?record=${r.id}`} className="btn-outline h-9 justify-start px-2.5 text-[12.5px]">
            <Icon name="receipt" size={14} /> <span className="truncate">Tạo báo giá</span>
          </Link>
        ) : (
          <ActBtn icon="receipt" label="Tạo báo giá" disabled title={needRec ? `Gắn ${term} trước` : "Cần quyền tạo chứng từ bán hàng"} />
        )}
        <CreateTicketButton conversationId={conv.id} recordId={r?.id} className="btn-outline h-9 justify-start px-2.5 text-[12.5px]" label="Phiếu hỗ trợ" />
        {hasDeals && <ActBtn icon="deals" label={`Tạo ${labels.deal.toLowerCase()}`} onClick={() => setMini(mini === "deal" ? "" : "deal")} disabled={needRec} title={needRec ? `Gắn ${term} trước` : undefined} />}
        {hasAppointments && <ActBtn icon="calendar" label={`Đặt ${labels.appointment.toLowerCase()}`} onClick={() => setMini(mini === "appt" ? "" : "appt")} disabled={needRec} title={needRec ? `Gắn ${term} trước` : undefined} />}
        {r ? <SendSurveyButton recordId={r.id} className="btn-outline h-9 justify-start px-2.5 text-[12.5px]" label="Gửi khảo sát" /> : <ActBtn icon="doc" label="Gửi khảo sát" disabled title={`Gắn ${term} trước`} />}
        <ActBtn icon="gift" label="Tặng voucher" onClick={() => setVoucherOpen(true)} disabled={needRec} title={needRec ? `Gắn ${term} trước` : undefined} />
      </div>
      {needRec && <p className="mt-1.5 text-[11.5px] text-ink-2">Một số thao tác cần gắn {term} trước.</p>}

      {mini === "deal" && (
        <form
          className="card mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void createDeal();
          }}
        >
          <b className="text-[13px]">Tạo {labels.deal.toLowerCase()}</b>
          <input className="input h-8" autoFocus placeholder={`Tên ${labels.deal.toLowerCase()}`} value={deal.title} onChange={(e) => setDeal({ ...deal, title: e.target.value })} />
          <input className="input h-8 tnum" type="number" min={0} step="1000" placeholder="Giá trị (₫)" value={deal.amount} onChange={(e) => setDeal({ ...deal, amount: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-primary h-8 flex-1 justify-center text-[13px]" disabled={!!busy} aria-busy={busy === "deal"}>
              {busy === "deal" ? "Đang tạo…" : "Tạo"}
            </button>
            <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setMini("")}>
              Huỷ
            </button>
          </div>
        </form>
      )}
      {mini === "appt" && (
        <form
          className="card mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void createAppt();
          }}
        >
          <b className="text-[13px]">Đặt {labels.appointment.toLowerCase()}</b>
          <div className="grid grid-cols-2 gap-2">
            <input className="input h-8" type="date" value={appt.date} onChange={(e) => setAppt({ ...appt, date: e.target.value })} required aria-label="Ngày hẹn" />
            <input className="input h-8" type="time" value={appt.time} onChange={(e) => setAppt({ ...appt, time: e.target.value })} aria-label="Giờ hẹn" />
          </div>
          <input className="input h-8" placeholder="Ghi chú (không bắt buộc)" value={appt.note} onChange={(e) => setAppt({ ...appt, note: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-primary h-8 flex-1 justify-center text-[13px]" disabled={!!busy} aria-busy={busy === "appt"}>
              {busy === "appt" ? "Đang đặt…" : "Đặt lịch"}
            </button>
            <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setMini("")}>
              Huỷ
            </button>
          </div>
        </form>
      )}

      {r && orders.length > 0 && (
        <div className="mt-5">
          <h3 className="label">Đơn gần đây</h3>
          <ul className="mt-2 grid gap-1">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/w/orders/${o.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-[12.5px] hover:bg-hover">
                  <Icon name="receipt" size={13} className="text-ink-2" />
                  <b className="font-medium">{o.number}</b>
                  <span className="text-ink-2">{ORDER_ST[o.status] ?? o.status}</span>
                  <span className="flex-1" />
                  <span className="tnum">{money(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r && (
        <div className="mt-5">
          <h3 className="label">Lịch sử gần đây</h3>
          {timeline.length || activities.length ? (
            <ol className="mt-2 space-y-2.5 border-l border-line pl-3">
              {(timeline.length ? timeline.map((t) => ({ id: t.id, body: t.title, sub: t.detail ?? "", at: t.at, href: t.href })) : activities.map((a) => ({ id: a.id, body: a.body, sub: a.author, at: a.at, href: undefined as string | undefined }))).map((a) => (
                <li key={a.id} className="relative text-[12.5px]">
                  <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full border-2 border-surface-2 bg-primary" />
                  {a.href ? (
                    <Link href={a.href} className="line-clamp-2 break-words hover:underline">
                      {a.body}
                    </Link>
                  ) : (
                    <p className="line-clamp-3 whitespace-pre-line break-words">{a.body}</p>
                  )}
                  <span className="line-clamp-1 text-[11px] text-ink-2">
                    {a.sub ? `${a.sub} · ` : ""}
                    {ago(a.at)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-2">Chưa có hoạt động.</p>
          )}
        </div>
      )}

      <OrderDrawer open={orderOpen} onClose={() => setOrderOpen(false)} conv={conv} record={r} me={me} businessName={businessName} address={r?.address ?? ""} onCreated={() => void Promise.all([onChanged(), loadCard()])} />
      {r && <IssueVoucherDrawer open={voucherOpen} onClose={() => setVoucherOpen(false)} recordId={r.id} onDone={() => void loadCard()} />}
    </div>
  );
}
