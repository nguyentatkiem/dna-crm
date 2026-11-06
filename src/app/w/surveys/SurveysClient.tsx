"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Drawer, EmptyState } from "@/components/ui";
import { SegmentSelect } from "@/components/survey/SegmentSelect";
import { SURVEY_CHANNELS, SURVEY_CHANNEL_LABEL, SURVEY_KIND_LABEL, type SurveyChannel, type SurveyKind, type SurveyPref } from "@/lib/survey/shared";
import type { SurveyDTO } from "@/lib/survey/api";

type Item = SurveyDTO & { sent: number; answeredInvites: number; submitted: number; nps: number | null; avgRating: number | null };

export const npsTone = (n: number | null) => (n == null ? "text-ink-2" : n >= 50 ? "text-success" : n >= 0 ? "text-warning" : "text-danger");

// Khảo sát CSAT, hoặc khảo sát tuỳ chỉnh chỉ có câu chấm sao: hiện điểm sao trung bình thay cho NPS.
const showStars = (s: Item) => s.kind === "csat" || (s.nps == null && s.avgRating != null);

export function SurveysClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sendTo, setSendTo] = useState<Item | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/surveys");
    if (!r.ok) return setItems([]);
    const j = await r.json();
    setItems(j.items);
    setCanManage(j.canManage);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(s: Item) {
    setItems((x) => x?.map((i) => (i.id === s.id ? { ...i, active: !s.active } : i)) ?? null);
    const r = await fetch(`/api/surveys/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) }).catch(() => null);
    // Lỗi thì trả lại trạng thái cũ.
    if (!r?.ok) setItems((x) => x?.map((i) => (i.id === s.id ? { ...i, active: s.active } : i)) ?? null);
  }
  async function copy(s: Item) {
    await navigator.clipboard?.writeText(`${location.origin}/s/f/${s.publicKey}`).catch(() => undefined);
    setCopied(s.id);
    setTimeout(() => setCopied(""), 1800);
  }

  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold">Khảo sát & đánh giá</h1>
          <p className="mt-1 text-ink-2">Đo NPS, mức hài lòng sau dịch vụ. Gửi link riêng cho từng khách hoặc dán link mở lên fanpage, mã QR tại quầy.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`btn-ghost ${showSettings ? "bg-primary-selected" : ""}`} onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>
              <Icon name="settings" size={15} /> Cài đặt
            </button>
            <Link href="/w/surveys/new" className="btn-primary">
              <Icon name="plus" size={15} /> Khảo sát mới
            </Link>
          </div>
        )}
      </div>

      {showSettings && items && <Settings surveys={items} onClose={() => setShowSettings(false)} />}

      <div className="mt-5">
        {items === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-40" />
            ))}
          </div>
        ) : !items.length ? (
          <div className="card">
            <EmptyState icon="chart" title="Chưa có khảo sát nào" desc="Tạo khảo sát NPS để biết khách có sẵn lòng giới thiệu bạn không, hoặc CSAT để đo hài lòng sau mỗi lần phục vụ." action={canManage ? { label: "Tạo khảo sát", href: "/w/surveys/new" } : undefined} />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((s) => (
              <div key={s.id} className={`card grid gap-3 p-4 ${s.active ? "" : "opacity-70"}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/w/surveys/${s.id}`} className="block truncate text-[16px] font-semibold hover:underline">
                      {s.name}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                      <Badge tone="accent">{SURVEY_KIND_LABEL[s.kind as SurveyKind] ?? s.kind}</Badge>
                      {s.questions.length} câu hỏi
                      {!s.active && <Badge>Đang tắt</Badge>}
                    </p>
                  </div>
                  {canManage && (
                    <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                      <input type="checkbox" checked={s.active} onChange={() => toggle(s)} className="h-4 w-4 accent-[var(--primary)]" /> Bật
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-[var(--row-hover)] p-2">
                    <p className={`font-title text-[22px] font-semibold tnum ${showStars(s) ? "" : npsTone(s.nps)}`}>{showStars(s) ? (s.avgRating != null ? `${s.avgRating}★` : "–") : s.nps ?? "–"}</p>
                    <p className="text-[12px] text-ink-2">{showStars(s) ? "Điểm TB" : "NPS"}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--row-hover)] p-2">
                    <p className="font-title text-[22px] font-semibold tnum">{s.submitted}</p>
                    <p className="text-[12px] text-ink-2">Câu trả lời</p>
                  </div>
                  <div className="rounded-lg bg-[var(--row-hover)] p-2">
                    <p className="font-title text-[22px] font-semibold tnum">{s.sent ? `${Math.round((s.answeredInvites / s.sent) * 100)}%` : "–"}</p>
                    <p className="text-[12px] text-ink-2">Phản hồi / {s.sent} lời mời</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/w/surveys/${s.id}`} className="btn-outline h-8">
                    <Icon name="chart" size={14} /> Báo cáo
                  </Link>
                  {canManage && (
                    <Link href={`/w/surveys/${s.id}/edit`} className="btn-ghost h-8">
                      <Icon name="edit" size={14} /> Sửa
                    </Link>
                  )}
                  <button type="button" className="btn-ghost h-8" onClick={() => copy(s)}>
                    <Icon name={copied === s.id ? "check" : "link"} size={14} /> {copied === s.id ? "Đã chép" : "Link mở"}
                  </button>
                  {canManage && s.active && (
                    <button type="button" className="btn-ghost h-8" onClick={() => setSendTo(s)}>
                      <Icon name="send" size={14} /> Gửi nhóm khách
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <SendSegment survey={sendTo} onClose={() => setSendTo(null)} onDone={load} />
    </>
  );
}

function SendSegment({ survey, onClose, onDone }: { survey: Item | null; onClose: () => void; onDone: () => void }) {
  const [segmentId, setSegmentId] = useState("");
  const [channel, setChannel] = useState<SurveyChannel>("zalo");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => setMsg(""), [survey]);
  async function send() {
    if (!survey || !segmentId) return setMsg("Chọn nhóm khách trước");
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/surveys/${survey.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segmentId, channel }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Không gửi được");
    setMsg(`Đã tạo ${j.sent}/${j.total} lời mời${j.failed ? `, ${j.failed} khách gửi không thành công (xem hoạt động của khách)` : ""}.`);
    onDone();
  }
  return (
    <Drawer open={!!survey} onClose={onClose} title="Gửi khảo sát cho nhóm khách" subtitle={survey?.name} width={440}>
      <div className="grid gap-3.5 px-5 py-4">
        <label className="grid gap-1">
          <span className="label">Nhóm khách</span>
          <SegmentSelect value={segmentId} onChange={setSegmentId} />
        </label>
        <label className="grid gap-1">
          <span className="label">Kênh gửi</span>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as SurveyChannel)}>
            {SURVEY_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {SURVEY_CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-ink-2">Mỗi khách nhận một link riêng, trả lời một lần. Nội dung tin sửa ở Cài đặt.</span>
        </label>
        {msg && <p className="rounded-md bg-[var(--row-hover)] px-3 py-2 text-[13.5px]">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn-primary" onClick={send} disabled={busy}>
            {busy ? "Đang gửi…" : "Gửi khảo sát"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}

function Settings({ surveys, onClose }: { surveys: Item[]; onClose: () => void }) {
  const [p, setP] = useState<SurveyPref | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/surveys/settings").then((r) => r.json()).then(setP).catch(() => undefined);
  }, []);
  if (!p) return <div className="skeleton mt-4 h-32" />;
  async function save() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/surveys/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? "Đã lưu" : j.error ?? "Không lưu được");
  }
  return (
    <section className="card mt-4 grid gap-3 p-4">
      <h2 className="section-title">Cài đặt khảo sát</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="label">Tự gửi khi phiếu hỗ trợ “Đã xử lý”</span>
          <select className="input" value={p.afterTicketSurveyId} onChange={(e) => setP({ ...p, afterTicketSurveyId: e.target.value })}>
            <option value="">Không gửi</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">Kênh gửi sau phiếu</span>
          <select className="input" value={p.afterTicketChannel} onChange={(e) => setP({ ...p, afterTicketChannel: e.target.value as SurveyChannel })}>
            {SURVEY_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {SURVEY_CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1">
        <span className="label">Mẫu tin mời trả lời</span>
        <textarea className="textarea min-h-[70px]" value={p.message} onChange={(e) => setP({ ...p, message: e.target.value })} maxLength={1000} />
        <span className="text-[12px] text-ink-2">Biến: {"{link}"} (bắt buộc), {"{ten}"}, {"{ten_doanh_nghiep}"}, {"{nguoi_phu_trach}"}.</span>
      </label>
      <div className="flex items-center justify-end gap-2">
        {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
        <button type="button" className="btn-ghost" onClick={onClose}>
          Đóng
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          Lưu cài đặt
        </button>
      </div>
    </section>
  );
}
