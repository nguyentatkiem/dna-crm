"use client";

// Chọn và gửi mẫu tin WhatsApp đã duyệt (khi cửa sổ 24 giờ đã đóng, hoặc chủ động nhắn trước).
// Gắn vào Composer cho hội thoại channel "whatsapp":
//   {conv.channel === "whatsapp" && <WaTemplatePicker conversationId={conv.id} onSent={reload} />}
// Mặc định chỉ hiện băng "Cửa sổ 24 giờ đã đóng — dùng mẫu tin" khi cửa sổ đã đóng; always = luôn hiện nút chọn mẫu.
import { useCallback, useEffect, useMemo, useState } from "react";

type Template = { name: string; language: string; category: string; body: string; header: string; footer: string; params: number };
type Data = { window: { open: boolean; closesAt: string | null }; templates: Template[]; pending: number; simulated: boolean };

const fill = (body: string, params: string[]) => body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => params[Number(n) - 1] || `{{${n}}}`);

export function WaTemplatePicker({ conversationId, onSent, always = false }: { conversationId: string; onSent?: (r: { id: string; text: string }) => void; always?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const r = await fetch(`/api/channels/whatsapp/templates?conversationId=${encodeURIComponent(conversationId)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) {
      setError(j.error ?? "Không tải được mẫu tin");
      return;
    }
    setData(j as Data);
  }, [conversationId]);
  useEffect(() => {
    setData(null);
    setOpen(false);
    setPick("");
    load();
  }, [load]);

  const tpl = useMemo(() => data?.templates.find((t) => `${t.name}|${t.language}` === pick), [data, pick]);
  useEffect(() => setParams(Array.from({ length: tpl?.params ?? 0 }, () => "")), [tpl]);

  if (error) return always ? <p className="px-3 py-1.5 text-[12.5px] text-danger">{error}</p> : null;
  if (!data) return null;
  if (data.window.open && !always && !open) return null;

  async function send() {
    if (!tpl) return;
    setBusy(true);
    const r = await fetch("/api/channels/whatsapp/template-send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, template: tpl.name, language: tpl.language, params }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok || !j.ok) {
      setError(j.error || "Gửi mẫu tin thất bại");
      return;
    }
    setOpen(false);
    setPick("");
    onSent?.({ id: j.id, text: j.text });
  }

  return (
    <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-warning-soft p-2.5 text-[13px]" role="region" aria-label="Mẫu tin WhatsApp">
      <div className="flex flex-wrap items-center gap-2">
        {!data.window.open ? (
          <span className="font-medium text-warning">Cửa sổ 24 giờ đã đóng — dùng mẫu tin</span>
        ) : (
          <span className="text-ink-2">Cửa sổ 24 giờ còn mở{data.window.closesAt ? ` đến ${new Date(data.window.closesAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}</span>
        )}
        {data.simulated && <span className="badge-warning text-[11px]">Chạy thử</span>}
        <button type="button" className="btn-outline ml-auto h-7 px-2 text-[12.5px]" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
          {open ? "Đóng" : "Chọn mẫu tin"}
        </button>
      </div>
      {open && (
        <div className="grid gap-2">
          {!data.templates.length ? (
            <p className="text-ink-2">Chưa có mẫu tin nào được duyệt{data.pending ? ` (${data.pending} mẫu đang chờ duyệt)` : ""}. Tạo mẫu ở WhatsApp Manager → Message templates.</p>
          ) : (
            <>
              <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Mẫu tin">
                <option value="">— Chọn mẫu tin đã duyệt —</option>
                {data.templates.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} · {t.language} · {t.category === "MARKETING" ? "Tiếp thị" : t.category === "UTILITY" ? "Tiện ích" : t.category}
                  </option>
                ))}
              </select>
              {tpl && (
                <>
                  {params.map((v, i) => (
                    <label key={i} className="grid gap-0.5">
                      <span className="label">Biến {`{{${i + 1}}}`}</span>
                      <input className="input" value={v} maxLength={1000} onChange={(e) => setParams((p) => p.map((x, k) => (k === i ? e.target.value : x)))} />
                    </label>
                  ))}
                  <div className="whitespace-pre-wrap rounded-md bg-surface p-2 text-ink">
                    {tpl.header && <p className="font-semibold">{tpl.header}</p>}
                    <p>{fill(tpl.body, params)}</p>
                    {tpl.footer && <p className="mt-1 text-[12px] text-ink-2">{tpl.footer}</p>}
                  </div>
                  <div className="flex justify-end">
                    <button type="button" className="btn-primary" disabled={busy || params.some((x) => !x.trim())} onClick={send}>
                      {busy ? "Đang gửi…" : "Gửi mẫu tin"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
