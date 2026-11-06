"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { CHANNEL_COLOR, CHANNEL_LABEL, VARS } from "@/lib/marketing/shared";

type BChannel = "email" | "zns" | "sms" | "zalo";
const CHANNELS: BChannel[] = ["email", "sms", "zns", "zalo"];
const CH_ICON: Record<BChannel, string> = { email: "mail", sms: "sms", zns: "chat", zalo: "chat" };

export type ComposerInitial = { id?: string; name: string; channel: BChannel; segmentId: string; subject: string; body: string; templateId: string; scheduledAt: string };
type Preview = {
  counts: { total: number; send: number; missing: number; unsubscribed: number; duplicate: number };
  notReady: string | null;
  dryRun: boolean;
  sample: { name: string; to: string; subject: string; body: string; html: string } | null;
  missingNames: string[];
};

const DEFAULT_BODY: Record<BChannel, string> = {
  email: "Chào {ten},\n\n{ten_doanh_nghiep} gửi anh/chị ưu đãi dành riêng trong tháng này.\n\nXem chi tiết: https://\n\nTrân trọng,\n{nguoi_phu_trach}",
  sms: "{ten_doanh_nghiep}: Chao {ten}, uu dai rieng cho anh/chi thang nay. Lien he {nguoi_phu_trach} de dat lich.",
  zns: "Ưu đãi dành riêng cho {ten} tại {ten_doanh_nghiep}.",
  zalo: "Chào {ten}, {ten_doanh_nghiep} có ưu đãi mới dành riêng cho anh/chị. Anh/chị cần tư vấn cứ nhắn em nhé!",
};

/** datetime-local cần dạng YYYY-MM-DDTHH:mm theo giờ máy. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function Composer({ initial, segments, notReady }: { initial?: ComposerInitial; segments: { id: string; name: string }[]; notReady: Record<string, string | null> }) {
  const router = useRouter();
  const [f, setF] = useState<ComposerInitial>(initial ?? { name: "", channel: "email", segmentId: "", subject: "Ưu đãi riêng cho {ten}", body: DEFAULT_BODY.email, templateId: "", scheduledAt: "" });
  const [when, setWhen] = useState<"now" | "later">(initial?.scheduledAt ? "later" : "now");
  const [at, setAt] = useState(initial?.scheduledAt ? localInput(new Date(initial.scheduledAt)) : localInput(new Date(Date.now() + 3600e3)));
  const [pv, setPv] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof ComposerInitial>(k: K, v: ComposerInitial[K]) => setF((x) => ({ ...x, [k]: v }));

  // Đếm người nhận + xem trước, chờ 400ms sau lần gõ cuối.
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await fetch("/api/broadcasts/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: f.channel, segmentId: f.segmentId || null, subject: f.subject, body: f.body, templateId: f.templateId }) });
      setLoading(false);
      if (r.ok) setPv(await r.json());
    }, 400);
    return () => clearTimeout(t);
  }, [f.channel, f.segmentId, f.subject, f.body, f.templateId]);

  function switchChannel(c: BChannel) {
    setF((x) => ({ ...x, channel: c, body: !x.body.trim() || Object.values(DEFAULT_BODY).includes(x.body) ? DEFAULT_BODY[c] : x.body }));
    setTestMsg(null);
  }

  function insertVar(v: string) {
    const el = bodyRef.current;
    if (!el) return set("body", f.body + v);
    const s = el.selectionStart ?? f.body.length;
    const e = el.selectionEnd ?? s;
    set("body", f.body.slice(0, s) + v + f.body.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + v.length, s + v.length);
    });
  }

  async function sendTest() {
    setTestMsg(null);
    const r = await fetch("/api/broadcasts/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: f.channel, segmentId: f.segmentId || null, subject: f.subject, body: f.body, templateId: f.templateId, to: testTo }) });
    const j = await r.json();
    if (!r.ok) return setTestMsg({ ok: false, text: j.error });
    if (j.ok && !j.skipped) setTestMsg({ ok: true, text: `Đã gửi thử tới ${testTo}. Kiểm tra hộp thư/điện thoại của bạn.` });
    else if (j.ok) setTestMsg({ ok: true, text: `${j.error}. Tin đã ghi vào Nhật ký gửi.` });
    else setTestMsg({ ok: false, text: `Không gửi được: ${j.error}` });
  }

  async function save(mode: "draft" | "now" | "later") {
    setMsg(null);
    if (mode !== "draft" && pv?.notReady && !pv.dryRun && !confirm(`${pv.notReady}.\nNếu gửi bây giờ, mọi tin sẽ bị bỏ qua với lý do này. Vẫn tiếp tục?`)) return;
    if (mode === "now" && !confirm(`Gửi ${CHANNEL_LABEL[f.channel]} tới ${pv?.counts.send ?? 0} khách ngay bây giờ?`)) return;
    setBusy(true);
    const payload = { ...f, segmentId: f.segmentId || null, when: mode, scheduledAt: mode === "later" ? new Date(at).toISOString() : null };
    const r = await fetch(f.id ? `/api/broadcasts/${f.id}` : "/api/broadcasts", { method: f.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error);
    router.push(`/w/broadcasts/${f.id ?? j.id}`);
    router.refresh();
  }

  const c = pv?.counts;
  const smsLen = f.channel === "sms" ? (pv?.sample?.body ?? f.body).length : 0;

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-4">
        <section className="card grid gap-4 p-4 sm:p-5">
          <label className="grid gap-1">
            <span className="label">Tên đợt gửi</span>
            <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Ưu đãi tháng 11 cho khách quen" maxLength={120} />
          </label>
          <div className="grid gap-1">
            <span className="label">Kênh</span>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((ch) => (
                <button key={ch} type="button" onClick={() => switchChannel(ch)} aria-pressed={f.channel === ch} className={`chip gap-1.5 ${f.channel === ch ? "chip-on" : ""}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[ch] }} />
                  <Icon name={CH_ICON[ch]} size={15} />
                  {CHANNEL_LABEL[ch]}
                </button>
              ))}
            </div>
            {notReady[f.channel] && (
              <p className="mt-1 rounded bg-warning-soft px-3 py-2 text-[13px] text-warning">
                {notReady[f.channel]}. {pv?.dryRun ? "Đang bật chế độ chạy thử nên tin chỉ được ghi nhật ký." : "Tin sẽ bị bỏ qua cho tới khi cấu hình xong ở Marketing → Kênh gửi."}
              </p>
            )}
          </div>
          <label className="grid gap-1">
            <span className="label">Gửi tới</span>
            <select className="input" value={f.segmentId} onChange={(e) => set("segmentId", e.target.value)}>
              <option value="">Tất cả khách</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  Nhóm: {s.name}
                </option>
              ))}
            </select>
            {!segments.length && <span className="text-[12.5px] text-ink-2">Chưa có nhóm khách nào. Tạo nhóm khách (bộ lọc đã lưu) để gửi cho đúng người.</span>}
          </label>
          {f.channel === "email" && (
            <label className="grid gap-1">
              <span className="label">Tiêu đề email</span>
              <input className="input" value={f.subject} onChange={(e) => set("subject", e.target.value)} maxLength={300} />
            </label>
          )}
          {f.channel === "zns" && (
            <label className="grid gap-1">
              <span className="label">Mã template ZNS</span>
              <input className="input font-mono text-[13px]" value={f.templateId} onChange={(e) => set("templateId", e.target.value)} placeholder="Để trống = dùng template mặc định" maxLength={60} />
              <span className="text-[12.5px] text-ink-2">ZNS gửi theo template Zalo đã duyệt; các biến ten, ten_doanh_nghiep, so_dien_thoai, nguoi_phu_trach được truyền vào template.</span>
            </label>
          )}
          <div className="grid gap-1">
            <span className="label">{f.channel === "zns" ? "Ghi chú nội dung (lưu nhật ký)" : "Nội dung"}</span>
            <textarea ref={bodyRef} className="textarea min-h-[180px] font-[inherit]" value={f.body} onChange={(e) => set("body", e.target.value)} maxLength={5000} />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-ink-2">Chèn biến:</span>
              {VARS.map(([v, label]) => (
                <button key={v} type="button" className="badge hover:bg-hover" onClick={() => insertVar(v)} title={label}>
                  {v}
                </button>
              ))}
              {f.channel === "sms" && <span className={`ml-auto text-[12.5px] tnum ${smsLen > 160 ? "text-warning" : "text-ink-2"}`}>{smsLen} ký tự · {Math.max(1, Math.ceil(smsLen / 160))} tin</span>}
            </div>
            {f.channel === "sms" && <span className="text-[12.5px] text-ink-2">Nên viết không dấu. Cuối tin tự thêm link “Tu choi nhan tin”.</span>}
            {f.channel === "email" && <span className="text-[12.5px] text-ink-2">Cuối email tự thêm link ngừng nhận tin. Link trong nội dung được đếm lượt nhấp, kèm pixel đếm lượt mở.</span>}
          </div>
        </section>

        <section className="card grid gap-3 p-4 sm:p-5">
          <h2 className="section-title">Gửi thử cho tôi</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={f.channel === "email" ? "email-cua-ban@gmail.com" : f.channel === "zalo" ? "Zalo user id của bạn" : "Số điện thoại của bạn"} />
            <button type="button" className="btn-outline flex-none justify-center" onClick={sendTest} disabled={!testTo.trim()}>
              <Icon name="send" size={16} /> Gửi thử
            </button>
          </div>
          {testMsg && (
            <p role="status" className={`rounded px-3 py-2 text-[13px] ${testMsg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
              {testMsg.text}
            </p>
          )}
        </section>

        <section className="card grid gap-3 p-4 sm:p-5">
          <h2 className="section-title">Thời điểm gửi</h2>
          <div className="segmented w-fit">
            <button type="button" aria-pressed={when === "now"} onClick={() => setWhen("now")}>
              Gửi ngay
            </button>
            <button type="button" aria-pressed={when === "later"} onClick={() => setWhen("later")}>
              <Icon name="clock" size={14} /> Hẹn giờ
            </button>
          </div>
          {when === "later" && <input type="datetime-local" className="input w-full sm:w-64" value={at} onChange={(e) => setAt(e.target.value)} />}
          {msg && <p className="rounded bg-danger-soft px-3 py-2 text-[13px] text-danger">{msg}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy || !f.name.trim()} onClick={() => save(when)}>
              <Icon name={when === "now" ? "send" : "clock"} size={16} /> {when === "now" ? `Gửi tới ${c?.send ?? 0} khách` : "Hẹn giờ gửi"}
            </button>
            <button type="button" className="btn-outline" disabled={busy || !f.name.trim()} onClick={() => save("draft")}>
              Lưu nháp
            </button>
          </div>
          <p className="text-[12.5px] text-ink-2">Hệ thống gửi theo lô 30 tin mỗi phút, có thể huỷ giữa chừng. Khách đã nhận sẽ không bị gửi lại.</p>
        </section>
      </div>

      <aside className="grid min-w-0 content-start gap-4 lg:sticky lg:top-4">
        <section className="card p-4" aria-busy={loading}>
          <h2 className="section-title">Người nhận</h2>
          <p className="mt-2 text-[30px] font-semibold leading-none tnum">
            {c ? c.send : "…"}
            <span className="ml-1.5 text-[14px] font-normal text-ink-2">/ {c?.total ?? 0} khách sẽ nhận</span>
          </p>
          <dl className="mt-3 grid gap-1.5 text-[13.5px]">
            {[
              ["Thiếu " + (f.channel === "email" ? "email" : f.channel === "zalo" ? "Zalo (chưa quan tâm OA)" : "số điện thoại"), c?.missing ?? 0],
              ["Đã từ chối nhận tin", c?.unsubscribed ?? 0],
              ["Trùng địa chỉ", c?.duplicate ?? 0],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-2">
                <dt className="text-ink-2">Bỏ qua · {k}</dt>
                <dd className="tnum font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {!!pv?.missingNames.length && <p className="mt-2 text-[12.5px] text-ink-2">VD thiếu địa chỉ: {pv.missingNames.join(", ")}</p>}
        </section>
        <section className="card overflow-hidden">
          <header className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
            <Icon name="eye" size={16} />
            <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-medium">Xem trước{pv?.sample ? ` · ${pv.sample.name}` : ""}</h2>
          </header>
          {!pv?.sample ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-2">{loading ? "Đang dựng tin…" : "Chưa có khách nào trong nhóm này."}</p>
          ) : f.channel === "email" ? (
            <div className="grid gap-0">
              <p className="truncate border-b border-line-soft px-4 py-2 text-[13px]">
                <span className="text-ink-2">Tới:</span> {pv.sample.to || "(khách chưa có email)"}
                <br />
                <span className="text-ink-2">Tiêu đề:</span> <b className="font-medium">{pv.sample.subject}</b>
              </p>
              <iframe title="Xem trước email" sandbox="" srcDoc={pv.sample.html} className="h-[360px] w-full bg-white" />
            </div>
          ) : (
            <div className="bg-surface-2 p-4">
              <p className="mb-2 text-[12px] text-ink-2">Tới: {pv.sample.to || "(chưa có địa chỉ)"}</p>
              <div className="max-w-[300px] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-surface px-3.5 py-2.5 text-[14px] shadow-sm">{pv.sample.body}</div>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
