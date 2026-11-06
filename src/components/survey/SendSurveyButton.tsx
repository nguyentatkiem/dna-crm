"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Drawer } from "@/components/ui";
import { ContactPicker, type PickedContact } from "@/components/care/ContactPicker";
import { SURVEY_CHANNELS, SURVEY_CHANNEL_LABEL, type SurveyChannel } from "@/lib/survey/shared";

type Opt = { id: string; name: string; kind: string };

/**
 * Nút "Gửi khảo sát" cho một khách (gắn ở hồ sơ khách). Không truyền recordId thì cho chọn khách.
 * Tạo link riêng (/s/<token>), có thể gửi luôn qua Zalo/ZNS/SMS/email.
 */
export function SendSurveyButton({ recordId, surveyId, className = "btn-outline", label = "Gửi khảo sát" }: { recordId?: string; surveyId?: string; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Opt[] | null>(null);
  const [sid, setSid] = useState(surveyId ?? "");
  const [channel, setChannel] = useState<SurveyChannel>("link");
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || opts) return;
    fetch("/api/surveys?active=1")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => {
        const items = (j.items as Opt[]).map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
        setOpts(items);
        setSid((x) => x || items[0]?.id || "");
      })
      .catch(() => setOpts([]));
  }, [open, opts]);

  async function send() {
    const rid = recordId ?? contact?.id;
    if (!sid) return setErr("Chọn khảo sát");
    if (!rid) return setErr("Chọn khách");
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/surveys/${sid}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId: rid, channel }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không gửi được");
    setUrl(j.url.startsWith("/") ? `${location.origin}${j.url}` : j.url);
    if (!j.ok && j.error) setErr(`Đã tạo link nhưng chưa gửi được: ${j.error}`);
  }

  async function copy() {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => { setUrl(""); setErr(""); setOpen(true); }}>
        <Icon name="chart" size={15} /> {label}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Gửi khảo sát cho khách" subtitle="Mỗi khách một link riêng, chỉ trả lời được một lần" width={440}>
        <div className="grid gap-3.5 px-5 py-4">
          {url ? (
            <>
              <div className="grid justify-items-center gap-2 py-4 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
                  <Icon name="check" size={22} />
                </span>
                <p className="font-medium">{channel === "link" ? "Đã tạo link khảo sát" : `Đã gửi qua ${SURVEY_CHANNEL_LABEL[channel]}`}</p>
              </div>
              <div className="flex gap-2">
                <input className="input font-mono text-[12.5px]" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link khảo sát" />
                <button type="button" className="btn-outline flex-none" onClick={copy}>
                  <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Đã chép" : "Chép"}
                </button>
              </div>
              {err && <p className="text-[13px] text-warning">{err}</p>}
              <div className="flex justify-end">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Đóng
                </button>
              </div>
            </>
          ) : (
            <>
              {!recordId && (
                <div className="grid gap-1">
                  <span className="label">Khách</span>
                  <ContactPicker value={contact} onChange={setContact} />
                </div>
              )}
              <label className="grid gap-1">
                <span className="label">Khảo sát</span>
                {opts && !opts.length ? (
                  <span className="text-[13px] text-ink-2">Chưa có khảo sát đang bật. Tạo ở mục Khảo sát.</span>
                ) : (
                  <select className="input" value={sid} onChange={(e) => setSid(e.target.value)}>
                    {(opts ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="grid gap-1">
                <span className="label">Gửi qua</span>
                <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as SurveyChannel)}>
                  {SURVEY_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {SURVEY_CHANNEL_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              {err && (
                <p role="alert" className="text-[13px] text-danger">
                  {err}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Huỷ
                </button>
                <button type="button" className="btn-primary" onClick={send} disabled={busy || !opts?.length}>
                  <Icon name="send" size={14} /> {busy ? "Đang gửi…" : channel === "link" ? "Tạo link" : "Gửi"}
                </button>
              </div>
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
