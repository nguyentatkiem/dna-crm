"use client";

// Tab WhatsApp / Shopee / TikTok Shop ở Hộp thư → Kênh: kết nối, URL webhook, uỷ quyền shop, đồng bộ đơn.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, EmptyState, toast } from "@/components/ui";
import type { ChannelAccountDTO, Platform } from "@/lib/channels/accounts";

type Account = ChannelAccountDTO & { conversations: number };
export type ChannelsData = {
  items: Account[];
  orders: Record<string, { count: number; total: number }>;
  hooks: Record<"instagram" | "whatsapp" | "shopee" | "tiktok" | "shopeeRedirect" | "tiktokRedirect", string>;
  canConnect: boolean;
};

const json = (method: string, body?: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
async function call<T>(url: string, init?: RequestInit): Promise<T | null> {
  const r = await fetch(url, init).catch(() => null);
  if (!r) {
    toast("Mất kết nối, thử lại sau", "error");
    return null;
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    toast(j.error ?? j.result?.error ?? "Không thực hiện được", "error");
    return null;
  }
  return j as T;
}

export function useChannels() {
  const [data, setData] = useState<ChannelsData | null>(null);
  const load = useCallback(async () => setData((await call<ChannelsData>("/api/channels")) ?? { items: [], orders: {}, hooks: {} as ChannelsData["hooks"], canConnect: false }), []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, load };
}

type Field = { key: string; label: string; secret?: boolean; placeholder?: string; hint?: string; required?: boolean };
const META: Record<Platform, { title: string; color: string; letter: string; intro: React.ReactNode; fields: Field[] }> = {
  whatsapp: {
    title: "WhatsApp Business (Cloud API)",
    color: "#1da851",
    letter: "wa",
    intro: (
      <>
        Meta for Developers → App → WhatsApp → API Setup: lấy <b>Phone number ID</b>, <b>WhatsApp Business Account ID</b> và access token (nên dùng System User token vĩnh viễn). Ở Configuration → Webhook: dán URL bên dưới, Verify token tự đặt, đăng ký trường <b>messages</b>. Ngoài 24 giờ kể từ tin cuối của khách chỉ gửi được <b>mẫu tin đã duyệt</b>.
      </>
    ),
    fields: [
      { key: "phoneNumberId", label: "Phone number ID", placeholder: "1065xxxxxxxxxxx", required: true },
      { key: "wabaId", label: "WhatsApp Business Account ID", placeholder: "Để tải mẫu tin" },
      { key: "accessToken", label: "Access token", secret: true, placeholder: "EAA…", required: true },
      { key: "appSecret", label: "App Secret", secret: true, hint: "Kiểm chữ ký X-Hub-Signature-256 của webhook." },
      { key: "verifyToken", label: "Verify token (tự đặt)", secret: true },
    ],
  },
  shopee: {
    title: "Shopee",
    color: "#ee4d2d",
    letter: "S",
    intro: (
      <>
        Shopee Open Platform → App: lấy <b>Partner ID</b> và <b>Partner Key</b>, đặt Redirect URL như bên dưới. Lưu khoá rồi bấm <b>Kết nối qua Shopee</b> để chủ shop uỷ quyền. Ở Push Mechanism: dán URL webhook, bật Order Status Push. CRM tự kéo đơn mỗi 10 phút; sàn che SĐT người mua thì đơn vẫn ghi, không tạo khách ảo.
      </>
    ),
    fields: [
      { key: "partnerId", label: "Partner ID", required: true },
      { key: "partnerKey", label: "Partner Key", secret: true, required: true },
      { key: "shopId", label: "Shop ID (không bắt buộc)", hint: "Tự điền sau khi uỷ quyền." },
      { key: "baseUrl", label: "Máy chủ API (không bắt buộc)", placeholder: "https://partner.shopeemobile.com", hint: "Sandbox: https://partner.test-stable.shopeemobile.com" },
    ],
  },
  tiktok: {
    title: "TikTok Shop",
    color: "#25262b",
    letter: "tt",
    intro: (
      <>
        TikTok Shop Partner Center → App: lấy <b>App Key</b>, <b>App Secret</b> (và <b>Service ID</b> nếu có), đặt Redirect URL như bên dưới. Lưu khoá rồi bấm <b>Kết nối qua TikTok Shop</b>. Ở Webhooks: dán URL webhook, bật Order status change. CRM tự kéo đơn mỗi 10 phút.
      </>
    ),
    fields: [
      { key: "appKey", label: "App Key", required: true },
      { key: "appSecret", label: "App Secret", secret: true, required: true },
      { key: "serviceId", label: "Service ID (không bắt buộc)", hint: "Có thì dùng trang uỷ quyền mới services.tiktokshop.com." },
      { key: "baseUrl", label: "Máy chủ API (không bắt buộc)", placeholder: "https://open-api.tiktokglobalshop.com" },
    ],
  },
};

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "chưa");
const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast("Đã sao chép"), () => toast("Không sao chép được", "error"));

function CopyRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid gap-1">
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1 font-mono text-[12.5px]" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-outline" onClick={() => copy(value)} aria-label={`Sao chép ${label}`}>
          <Icon name="copy" size={14} />
        </button>
      </div>
    </div>
  );
}

export function ChannelsTab({ platform, data, reload }: { platform: Platform; data: ChannelsData | null; reload: () => void }) {
  const meta = META[platform];
  const [form, setForm] = useState<{ id?: string; name: string; creds: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState("");
  if (!data) return <div className="skeleton mt-3 h-40" />;
  const items = data.items.filter((a) => a.platform === platform);
  const hook = data.hooks[platform];
  const redirect = platform === "shopee" ? data.hooks.shopeeRedirect : platform === "tiktok" ? data.hooks.tiktokRedirect : "";
  const orders = data.orders[platform];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy("save");
    const j = await call<{ item: Account; warning: string }>("/api/channels", json("POST", { id: form.id, platform, name: form.name.trim() || undefined, creds: form.creds }));
    setBusy("");
    if (!j) return;
    toast(j.warning || `Đã lưu ${j.item.name}`);
    setForm(null);
    reload();
  }
  async function act(a: Account, what: "toggle" | "remove" | "sync" | "connect") {
    if (what === "remove" && !confirm(`Ngắt kết nối ${a.name}? Khoá bị xoá; hội thoại và đơn đã đồng bộ vẫn giữ.`)) return;
    setBusy(`${what}:${a.id}`);
    if (what === "toggle") await call(`/api/channels/${a.id}`, json("PATCH", { active: !a.active }));
    if (what === "remove" && (await call(`/api/channels/${a.id}`, json("DELETE")))) toast("Đã ngắt kết nối");
    if (what === "sync") {
      const j = await call<{ result: { created: number; updated: number; total: number } }>(`/api/channels/${a.id}/sync`, json("POST"));
      if (j) toast(`Đã đồng bộ ${j.result.total} đơn · ${j.result.created} mới · ${j.result.updated} cập nhật`);
    }
    if (what === "connect") {
      const j = await call<{ url: string }>(`/api/channels/${a.id}/connect`);
      setBusy("");
      if (j?.url) window.location.href = j.url;
      return;
    }
    setBusy("");
    reload();
  }

  return (
    <div className="mt-3 grid gap-3">
      <div className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-lg text-[14px] font-bold text-white" style={{ background: meta.color }} aria-hidden>
            {meta.letter}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{meta.title}</p>
            <p className="text-[13px] text-ink-2">{meta.intro}</p>
          </div>
          {data.canConnect && !form && (
            <button type="button" className="btn-primary" onClick={() => setForm({ name: "", creds: {} })}>
              <Icon name="plus" size={15} /> {platform === "whatsapp" ? "Thêm số" : "Thêm shop"}
            </button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <CopyRow label="URL webhook" value={hook} />
          <CopyRow label="Redirect URL (uỷ quyền)" value={redirect} />
        </div>
        {form && (
          <form onSubmit={save} className="grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
            <label className="grid gap-1 sm:col-span-2">
              <span className="label">Tên hiển thị (không bắt buộc)</span>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={platform === "whatsapp" ? "Lấy từ WhatsApp nếu để trống" : "Ví dụ: Shop chính hãng"} />
            </label>
            {meta.fields.map((f) => (
              <label key={f.key} className="grid gap-1">
                <span className="label">
                  {f.label}
                  {f.required && !form.id && <span className="text-danger"> *</span>}
                </span>
                <input
                  className={`input ${f.secret ? "font-mono" : ""}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  required={f.required && !form.id}
                  value={form.creds[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, creds: { ...form.creds, [f.key]: e.target.value } })}
                  placeholder={form.id && f.secret ? "Để trống = giữ khoá cũ" : f.placeholder}
                />
                {f.hint && <span className="text-[12px] text-ink-2">{f.hint}</span>}
              </label>
            ))}
            <p className="text-[12px] text-ink-2 sm:col-span-2">Khoá chỉ lưu trên máy chủ, không hiện lại trên trình duyệt. Khoá bắt đầu bằng “demo_” chạy thử: không gọi {meta.title}.</p>
            <div className="flex gap-2 sm:col-span-2">
              <button className="btn-primary" disabled={busy === "save"}>
                <Icon name="check" size={15} /> {busy === "save" ? "Đang kiểm tra…" : "Lưu"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Huỷ
              </button>
            </div>
          </form>
        )}
      </div>

      {platform !== "whatsapp" && orders && (
        <p className="text-[13px] text-ink-2">
          Đã đồng bộ{" "}
          <Link href={`/w/orders?q=`} className="font-medium text-primary hover:underline">
            {orders.count} đơn
          </Link>{" "}
          · {orders.total.toLocaleString("vi-VN")} ₫. Đơn khớp sản phẩm theo SKU (không khớp thì ghi dòng tự do).
        </p>
      )}

      {!items.length ? (
        <div className="card">
          <EmptyState icon={platform === "whatsapp" ? "chat" : "cart"} title={platform === "whatsapp" ? "Chưa kết nối số WhatsApp nào" : `Chưa kết nối shop ${meta.title}`} desc={data.canConnect ? "Bấm Thêm để bắt đầu." : "Nhờ chủ workspace kết nối."} compact />
        </div>
      ) : (
        items.map((a) => {
          const pending = a.accountId.startsWith("pending_");
          return (
            <div key={a.id} className={`card grid gap-2 p-4 ${a.active ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15.5px] font-semibold">
                    <span className="truncate">{a.name}</span>
                    {a.demo && <Badge tone="warning">Chạy thử</Badge>}
                    {!a.active && <Badge>Đang tắt</Badge>}
                    {pending && <Badge tone="danger">Chờ uỷ quyền</Badge>}
                  </p>
                  <p className="text-[12.5px] text-ink-2">
                    {platform === "whatsapp" ? (
                      <>
                        Phone number ID <span className="font-mono">{a.accountId}</span>
                        {a.settings.displayPhone && <> · {a.settings.displayPhone}</>} · Token <span className="font-mono">{a.creds.accessToken || "chưa có"}</span> ·{" "}
                        <Link href="/w/inbox?channel=whatsapp" className="hover:underline">
                          {a.conversations} hội thoại
                        </Link>
                      </>
                    ) : (
                      <>
                        Shop ID <span className="font-mono">{pending ? "—" : a.accountId}</span> · Token {a.creds.accessToken ? <span className="font-mono">{a.creds.accessToken}</span> : <b className="text-danger">chưa có</b>}
                        {a.creds.expiresAt && <> · hết hạn {when(a.creds.expiresAt)}</>}
                      </>
                    )}
                  </p>
                  <p className="text-[12.5px] text-ink-2">
                    Webhook gần nhất: {when(a.settings.lastWebhookAt)}
                    {platform !== "whatsapp" && (
                      <>
                        {" "}
                        · Đồng bộ đơn: {when(a.lastSyncAt)}
                        {a.settings.lastSyncCount !== undefined && ` (${a.settings.lastSyncCount} đơn)`}
                      </>
                    )}
                  </p>
                  {a.settings.lastError && <p className="mt-1 rounded bg-danger-soft px-2 py-1 text-[12.5px] text-danger">{a.settings.lastError}</p>}
                </div>
                {data.canConnect && (
                  <div className="flex flex-wrap items-center gap-2">
                    {platform !== "whatsapp" && (
                      <>
                        <button type="button" className={pending ? "btn-primary" : "btn-outline"} disabled={!!busy} onClick={() => act(a, "connect")}>
                          <Icon name="link" size={14} /> {pending ? `Kết nối qua ${meta.title}` : "Uỷ quyền lại"}
                        </button>
                        <button type="button" className="btn-outline" disabled={!!busy || pending} onClick={() => act(a, "sync")}>
                          <Icon name="refresh" size={14} /> {busy === `sync:${a.id}` ? "Đang đồng bộ…" : "Đồng bộ ngay"}
                        </button>
                      </>
                    )}
                    <button type="button" className="btn-ghost" onClick={() => setForm({ id: a.id, name: a.name, creds: {} })}>
                      Sửa khoá
                    </button>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                      <input type="checkbox" checked={a.active} onChange={() => act(a, "toggle")} className="h-4 w-4 accent-[var(--primary)]" /> Bật
                    </label>
                    <button type="button" className="btn-ghost text-danger" onClick={() => act(a, "remove")} aria-label={`Ngắt kết nối ${a.name}`}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                )}
              </div>
              {a.demo && <p className="rounded bg-warning-soft px-3 py-2 text-[12.5px] text-warning">{platform === "whatsapp" ? "Số dùng token mẫu: gửi tin và mẫu tin được giả lập, không gửi lên WhatsApp." : "Shop dùng khoá mẫu: đồng bộ đơn dùng dữ liệu mẫu, không gọi sàn."}</p>}
            </div>
          );
        })
      )}
    </div>
  );
}
