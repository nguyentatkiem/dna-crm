"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, EmptyState, Tabs, toast } from "@/components/ui";
import type { PageDTO } from "@/lib/fb/admin";
import type { PageSettings } from "@/lib/fb/pages";

type Page = PageDTO & { inboxCount: number; commentCount: number; postCount: number };
type Mme = { id: string; pageId: string; ref: string; label: string; clicks: number; url: string; shortUrl: string; conversations: number; contacts: number; createdAt: string };
type Crm = { autoCreateContact: boolean; autoUpdatePhone: boolean; autoAddress: boolean; signature: string };

const json = (method: string, body?: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
async function call<T>(url: string, init?: RequestInit): Promise<T | null> {
  const r = await fetch(url, init).catch(() => null);
  if (!r) {
    toast("Mất kết nối, thử lại sau", "error");
    return null;
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    toast(j.error ?? "Không thực hiện được", "error");
    return null;
  }
  return j as T;
}

const TOGGLES: { key: keyof Omit<PageSettings, "signature">; label: string; hint: string }[] = [
  { key: "autoHidePhone", label: "Tự ẩn bình luận có SĐT", hint: "Đối thủ không thấy số của khách. Khách và bạn bè họ vẫn thấy bình luận." },
  { key: "autoHideAll", label: "Tự ẩn mọi bình luận", hint: "Dùng khi chạy quảng cáo dễ bị phá, chỉ trả lời qua inbox." },
  { key: "autoLike", label: "Tự thích bình luận", hint: "Trang bấm thích mọi bình luận mới để khách thấy được quan tâm." },
  { key: "autoMarkReadComments", label: "Tự đánh dấu đã đọc bình luận", hint: "Bình luận không tính là chưa đọc, không báo thông báo (vẫn lưu và tạo khách nếu có SĐT)." },
];

export function PagesClient({ canConnect, canSettings, canInbox }: { canConnect: boolean; canSettings: boolean; canInbox: boolean }) {
  const [tab, setTab] = useState("pages");
  const [pages, setPages] = useState<Page[] | null>(null);
  const load = useCallback(async () => {
    const j = await call<{ items: Page[] }>("/api/inbox/pages");
    setPages(j?.items ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Tabs
        className="mt-4"
        value={tab}
        onChange={setTab}
        items={[
          { key: "pages", label: "Trang đã kết nối", count: pages?.length },
          { key: "mme", label: "Link m.me theo nguồn" },
          { key: "crm", label: "CRM từ chat" },
        ]}
      />
      {tab === "pages" && <PagesTab pages={pages} reload={load} setPages={setPages} canConnect={canConnect} canSettings={canSettings} />}
      {tab === "mme" && <MmeTab pages={pages ?? []} canEdit={canInbox} />}
      {tab === "crm" && <CrmTab />}
    </>
  );
}

/* ───────────── Trang ───────────── */

function PagesTab({ pages, reload, setPages, canConnect, canSettings }: { pages: Page[] | null; reload: () => void; setPages: (fn: (p: Page[] | null) => Page[] | null) => void; canConnect: boolean; canSettings: boolean }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ pageId: "", token: "", name: "" });
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const j = await call<{ item: PageDTO; warning: string }>("/api/inbox/pages", json("POST", { pageId: form.pageId.trim(), token: form.token.trim(), name: form.name.trim() || undefined }));
    setBusy(false);
    if (!j) return;
    toast(j.warning || `Đã kết nối ${j.item.name}`);
    setForm({ pageId: "", token: "", name: "" });
    setAdding(false);
    reload();
  }

  async function patch(p: Page, body: { active?: boolean; settings?: Partial<PageSettings> }) {
    const j = await call<{ item: PageDTO }>(`/api/inbox/pages/${p.id}`, json("PATCH", body));
    if (j) setPages((x) => x?.map((i) => (i.id === p.id ? { ...i, ...j.item } : i)) ?? null);
    return !!j;
  }

  async function remove(p: Page) {
    if (!confirm(`Ngắt kết nối ${p.name}? Token và cài đặt của trang bị xoá; hội thoại cũ vẫn giữ.`)) return;
    if (await call(`/api/inbox/pages/${p.id}`, json("DELETE"))) {
      toast("Đã ngắt kết nối");
      reload();
    }
  }

  return (
    <div className="mt-3 grid gap-3">
      {canConnect && (
        <div className="card p-4">
          {!adding ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#1877f2] text-[18px] font-bold text-white" aria-hidden>
                f
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Kết nối fanpage</p>
                <p className="text-[13px] text-ink-2">
                  Cần Page ID và Page Access Token (quyền pages_messaging, pages_manage_engagement, pages_read_user_content). Đăng ký webhook trường <b>messages</b>, <b>messaging_referrals</b>, <b>feed</b> ở{" "}
                  <Link href="/w/sources" className="text-primary hover:underline">
                    Nguồn khách → Facebook
                  </Link>
                  .
                </p>
              </div>
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={15} /> Thêm trang
              </button>
            </div>
          ) : (
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="label">Page ID</span>
                <input className="input tnum" inputMode="numeric" required value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} placeholder="Ví dụ 104512345678901" />
              </label>
              <label className="grid gap-1">
                <span className="label">Tên hiển thị (không bắt buộc)</span>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lấy từ Facebook nếu để trống" />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="label">Page Access Token</span>
                <input className="input font-mono" type="password" autoComplete="off" required value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="EAA…" />
                <span className="text-[12px] text-ink-2">Token chỉ lưu trên máy chủ, không hiện lại trên trình duyệt. CRM kiểm tra token với Facebook trước khi lưu; mất mạng thì vẫn lưu kèm cảnh báo.</span>
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button className="btn-primary" disabled={busy}>
                  <Icon name="check" size={15} /> {busy ? "Đang kiểm tra…" : "Kết nối"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
                  Huỷ
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {pages === null ? (
        <div className="skeleton h-40" />
      ) : !pages.length ? (
        <div className="card">
          <EmptyState icon="page" title="Chưa kết nối trang nào" desc={canConnect ? "Thêm fanpage để nhận tin nhắn và bình luận vào Hộp thư." : "Nhờ chủ workspace kết nối fanpage."} />
        </div>
      ) : (
        pages.map((p) => <PageCard key={p.id} p={p} canConnect={canConnect} canSettings={canSettings} patch={patch} remove={remove} />)
      )}
    </div>
  );
}

function PageCard({ p, canConnect, canSettings, patch, remove }: { p: Page; canConnect: boolean; canSettings: boolean; patch: (p: Page, b: { active?: boolean; settings?: Partial<PageSettings> }) => Promise<boolean>; remove: (p: Page) => void }) {
  const [sig, setSig] = useState(p.settings.signature);
  useEffect(() => setSig(p.settings.signature), [p.settings.signature]);
  const sigDirty = sig.trim() !== p.settings.signature;
  return (
    <div className={`card grid gap-3 p-4 ${p.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-start gap-3">
        {p.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar} alt="" className="h-10 w-10 flex-none rounded-lg object-cover" />
        ) : (
          <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#1877f2] font-semibold text-white" aria-hidden>
            {(p.name[0] ?? "T").toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15.5px] font-semibold">
            <span className="truncate">{p.name}</span>
            {p.demo && <Badge tone="warning">Chạy thử</Badge>}
            {!p.active && <Badge>Đang tắt</Badge>}
            {p.platform === "instagram" && <Badge tone="accent">Instagram</Badge>}
          </p>
          <p className="text-[12.5px] text-ink-2">
            ID <span className="font-mono">{p.pageId}</span> · Token {p.hasToken ? <span className="font-mono">{p.tokenMasked}</span> : <b className="text-danger">chưa có</b>}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-ink-2">
            <Link href={`/w/inbox?page=${encodeURIComponent(p.pageId)}`} className="hover:underline">
              {p.inboxCount} hội thoại inbox
            </Link>
            <span>{p.commentCount} hội thoại bình luận</span>
            <Link href={`/w/inbox/posts?page=${encodeURIComponent(p.pageId)}`} className="hover:underline">
              {p.postCount} bài viết
            </Link>
          </p>
        </div>
        {canConnect && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <input type="checkbox" checked={p.active} onChange={() => patch(p, { active: !p.active })} className="h-4 w-4 accent-[var(--primary)]" /> Bật
            </label>
            <button type="button" className="btn-ghost text-danger" onClick={() => remove(p)} aria-label={`Ngắt kết nối ${p.name}`}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        )}
      </div>
      {p.demo && <p className="rounded bg-warning-soft px-3 py-2 text-[12.5px] text-warning">Trang dùng token mẫu: ẩn, thích, trả lời, nhắn riêng được giả lập, không gửi lên Facebook.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-start gap-2 rounded-lg bg-[var(--row-hover)] p-2.5">
            <input type="checkbox" disabled={!canSettings} checked={p.settings[t.key]} onChange={() => patch(p, { settings: { [t.key]: !p.settings[t.key] } })} className="mt-0.5 h-4 w-4 flex-none accent-[var(--primary)]" />
            <span>
              <span className="block text-[13.5px] font-medium">{t.label}</span>
              <span className="block text-[12px] text-ink-2">{t.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-1">
        <span className="label">Chữ ký cuối tin nhắn gửi đi</span>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1" maxLength={150} disabled={!canSettings} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Ví dụ: — Hương Spa ♥ Hotline 1900 xxxx" />
          {canSettings && (
            <button
              type="button"
              className="btn-outline"
              disabled={!sigDirty}
              onClick={async () => {
                if (await patch(p, { settings: { signature: sig.trim() } })) toast("Đã lưu chữ ký");
              }}
            >
              Lưu
            </button>
          )}
        </div>
        <span className="text-[12px] text-ink-2">{sig.length}/150 · Thêm vào cuối tin Messenger và tin nhắn riêng từ bình luận (không thêm vào trả lời bình luận công khai).</span>
      </div>
    </div>
  );
}

/* ───────────── Link m.me ───────────── */

function MmeTab({ pages, canEdit }: { pages: Page[]; canEdit: boolean }) {
  const [items, setItems] = useState<Mme[] | null>(null);
  const [others, setOthers] = useState<{ ref: string; conversations: number; contacts: number }[]>([]);
  const [form, setForm] = useState({ pageId: "", ref: "", label: "" });
  const load = useCallback(async () => {
    const j = await call<{ items: Mme[]; others: typeof others }>("/api/inbox/mme");
    setItems(j?.items ?? []);
    setOthers(j?.others ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const pageName = (id: string) => pages.find((p) => p.pageId === id)?.name ?? id;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const j = await call<{ item: Mme }>("/api/inbox/mme", json("POST", { ...form, pageId: form.pageId || pages[0]?.pageId || "" }));
    if (!j) return;
    toast("Đã tạo link");
    setForm({ ...form, ref: "", label: "" });
    load();
  }
  async function remove(m: Mme) {
    if (!confirm(`Xoá link ref=${m.ref}? Hội thoại đã ghi nguồn vẫn giữ.`)) return;
    if (await call(`/api/inbox/mme/${m.id}`, json("DELETE"))) load();
  }
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast("Đã sao chép"), () => toast("Không sao chép được", "error"));

  return (
    <div className="mt-3 grid gap-3">
      {canEdit && (
        <form onSubmit={create} className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1">
            <span className="label">Trang</span>
            <select className="input" value={form.pageId || pages[0]?.pageId || ""} onChange={(e) => setForm({ ...form, pageId: e.target.value })}>
              {pages.map((p) => (
                <option key={p.pageId} value={p.pageId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="label">Mã ref</span>
            <input className="input font-mono" required value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="to_roi_tet" />
          </label>
          <label className="grid gap-1">
            <span className="label">Ghi chú</span>
            <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Tờ rơi phát ở hội chợ" />
          </label>
          <button className="btn-primary" disabled={!pages.length}>
            <Icon name="link" size={15} /> Tạo link
          </button>
        </form>
      )}
      <p className="text-[13px] text-ink-2">Khách bấm link mở Messenger với trang, CRM ghi nguồn “ref” cho hội thoại. Link rút gọn đếm thêm lượt bấm.</p>
      {items === null ? (
        <div className="skeleton h-32" />
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon="link" title="Chưa có link m.me" desc="Tạo link riêng cho từng nơi đăng (bài viết, KOL, tờ rơi, mã QR) để biết nguồn nào mang khách về." compact />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Link</th>
                <th className="px-3 py-2 font-medium">Trang</th>
                <th className="px-3 py-2 text-right font-medium">Lượt bấm</th>
                <th className="px-3 py-2 text-right font-medium">Hội thoại</th>
                <th className="px-3 py-2 text-right font-medium">Thành khách</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <p className="font-medium">{m.label}</p>
                    <p className="font-mono text-[12px] text-ink-2">ref={m.ref}</p>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{pageName(m.pageId)}</td>
                  <td className="tnum px-3 py-2 text-right">{m.clicks}</td>
                  <td className="tnum px-3 py-2 text-right">
                    <Link href="/w/inbox?source=ref" className="hover:underline">
                      {m.conversations}
                    </Link>
                  </td>
                  <td className="tnum px-3 py-2 text-right">{m.contacts}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button type="button" className="btn-ghost" onClick={() => copy(m.shortUrl)} title={m.shortUrl}>
                      <Icon name="copy" size={14} /> Link rút gọn
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => copy(m.url)} title={m.url}>
                      m.me
                    </button>
                    {canEdit && (
                      <button type="button" className="btn-ghost text-danger" onClick={() => remove(m)} aria-label={`Xoá link ${m.ref}`}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!others.length && (
        <div className="card p-4">
          <p className="font-medium">Mã ref khác khách đã dùng</p>
          <p className="text-[12.5px] text-ink-2">Link tạo ở nơi khác (tự gõ, công cụ quảng cáo).</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {others.map((o) => (
              <span key={o.ref} className="chip font-mono">
                {o.ref} · {o.conversations} hội thoại
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── CRM từ chat ───────────── */

function CrmTab() {
  const [v, setV] = useState<Crm | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    call<{ value: Crm; canEdit: boolean }>("/api/inbox/pages/crm").then((j) => {
      if (j) {
        setV(j.value);
        setCanEdit(j.canEdit);
      }
    });
  }, []);
  async function save(next: Partial<Crm>) {
    const j = await call<{ value: Crm }>("/api/inbox/pages/crm", json("PUT", next));
    if (j) {
      setV(j.value);
      toast("Đã lưu");
    }
  }
  if (!v) return <div className="skeleton mt-3 h-40" />;
  const rows: { key: keyof Omit<Crm, "signature">; label: string; hint: string }[] = [
    { key: "autoCreateContact", label: "Tự tạo khách khi khách để lại SĐT", hint: "Trùng SĐT với khách cũ thì gắn vào khách đó (không tạo trùng). Nguồn ghi là Facebook Messenger / Bình luận Facebook / Zalo OA." },
    { key: "autoUpdatePhone", label: "Tự điền SĐT vào hồ sơ khách", hint: "Khách đã có hồ sơ mà chưa có SĐT thì điền số vừa nhắn." },
    { key: "autoAddress", label: "Tự lưu địa chỉ khách nhắn", hint: "Nhận diện “số…, đường/phố…, phường/xã…, quận/huyện…, tỉnh/TP” và ghi vào hồ sơ." },
  ];
  return (
    <div className="card mt-3 grid gap-3 p-4">
      {rows.map((r) => (
        <label key={r.key} className="flex items-start gap-2">
          <input type="checkbox" disabled={!canEdit} checked={v[r.key]} onChange={() => save({ [r.key]: !v[r.key] })} className="mt-0.5 h-4 w-4 flex-none accent-[var(--primary)]" />
          <span>
            <span className="block text-[13.5px] font-medium">{r.label}</span>
            <span className="block text-[12px] text-ink-2">{r.hint}</span>
          </span>
        </label>
      ))}
      <SignatureDefault value={v.signature} canEdit={canEdit} onSave={(signature) => save({ signature })} />
    </div>
  );
}

function SignatureDefault({ value, canEdit, onSave }: { value: string; canEdit: boolean; onSave: (s: string) => void }) {
  const [s, setS] = useState(value);
  return (
    <div className="grid gap-1 border-t border-[var(--border)] pt-3">
      <span className="label">Chữ ký chung (dùng khi trang chưa đặt chữ ký riêng)</span>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" maxLength={150} disabled={!canEdit} value={s} onChange={(e) => setS(e.target.value)} placeholder="— Đội chăm sóc khách hàng" />
        {canEdit && (
          <button type="button" className="btn-outline" disabled={s.trim() === value} onClick={() => onSave(s.trim())}>
            Lưu
          </button>
        )}
      </div>
      <span className="text-[12px] text-ink-2">{s.length}/150</span>
    </div>
  );
}
