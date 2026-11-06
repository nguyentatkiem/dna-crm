"use client";

import { useEffect, useRef, useState } from "react";
import type { RecordDTO } from "@/lib/records";
import { Icon } from "../Icon";

type Mapped = { key: string; label: string; type: string; source: string; value: string; options?: string[] };
type Result = { kind: "business_card" | "id_card" | "other"; title: string; fields: Mapped[]; dropped: { source: string; label: string; value: string }[] };
type Dupe = { id: string; title: string; owner: string; reason: string; href?: string };

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 5 * 1024 * 1024;
const maskId = (v: string) => (v.length > 4 ? "•".repeat(v.length - 4) + v.slice(-4) : v);

/** Nút "Quét danh thiếp/CCCD": chụp/chọn ảnh → AI đọc → sửa lại → tạo khách (cảnh báo nếu có thể trùng). */
export function OcrButton({ objectKey, onExtracted }: { objectKey: string; onExtracted: (rec: RecordDTO) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        <Icon name="spark" size={16} className="text-[#a25ddc]" /> <span className="max-sm:hidden">Quét danh thiếp/CCCD</span>
        <span className="sm:hidden">Quét ảnh</span>
      </button>
      {open && (
        <OcrDialog
          objectKey={objectKey}
          onClose={() => setOpen(false)}
          onDone={(rec) => {
            setOpen(false);
            onExtracted(rec);
          }}
        />
      )}
    </>
  );
}

function OcrDialog({ objectKey, onClose, onDone }: { objectKey: string; onClose: () => void; onDone: (rec: RecordDTO) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState<"" | "scan" | "save">("");
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [showId, setShowId] = useState(false);
  const [dupes, setDupes] = useState<Dupe[]>([]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  function pick(f: File | undefined) {
    setErr("");
    setRes(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setErr("Chỉ nhận ảnh JPG, PNG hoặc WebP");
    if (f.size > MAX) return setErr("Ảnh lớn hơn 5MB, hãy chụp lại hoặc giảm dung lượng");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  const valueOf = (source: string) => {
    const f = res?.fields.find((x) => x.source === source);
    return f ? values[f.key] ?? "" : "";
  };

  async function checkDupes(phone: string, email: string) {
    if (!phone && !email) return setDupes([]);
    try {
      const r = await fetch(`/api/c360/duplicates/check?${new URLSearchParams({ phone, email })}`);
      if (!r.ok) return setDupes([]); // chưa có tính năng tìm trùng (404) hoặc lỗi: bỏ qua
      const j = await r.json();
      setDupes(Array.isArray(j) ? j : (j.matches ?? []));
    } catch {
      setDupes([]);
    }
  }

  async function scan() {
    if (!file) return;
    setBusy("scan");
    setErr("");
    const fd = new FormData();
    fd.append("image", file);
    fd.append("objectKey", objectKey);
    const r = await fetch("/api/ai/ocr", { method: "POST", body: fd }).catch(() => null);
    setBusy("");
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return setErr(j.error ?? "Không quét được ảnh");
    const out = j as Result;
    setRes(out);
    setTitle(out.title);
    setValues(Object.fromEntries(out.fields.map((f) => [f.key, f.value])));
    setShowId(false);
    await checkDupes(out.fields.find((f) => f.source === "phone")?.value ?? "", out.fields.find((f) => f.source === "email")?.value ?? "");
  }

  async function save() {
    if (!res || !title.trim()) return setErr("Hãy nhập họ tên");
    setBusy("save");
    setErr("");
    const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
    const r = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectKey, title: title.trim(), data }) });
    setBusy("");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Không tạo được khách");
    onDone(j as RecordDTO);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/30 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-label="Quét danh thiếp hoặc CCCD" onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-panel sm:rounded-xl">
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
          <Icon name="spark" size={18} className="text-[#a25ddc]" />
          <h2 className="flex-1 text-[15px] font-semibold">Quét danh thiếp / CCCD</h2>
          <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            <button type="button" onClick={() => input.current?.click()} className="grid aspect-[1.6] place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-2 text-[13px] text-ink-2 hover:border-primary">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Ảnh đã chọn" className="h-full w-full object-contain" />
              ) : (
                <span className="grid place-items-center gap-1 p-3 text-center">
                  <Icon name="upload" size={22} />
                  Chụp hoặc chọn ảnh
                </span>
              )}
            </button>
            <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="Chọn ảnh danh thiếp hoặc CCCD" />
            <button type="button" className="btn-primary justify-center" disabled={!file || !!busy} onClick={() => void scan()}>
              {busy === "scan" ? "Đang đọc ảnh…" : res ? "Quét lại" : "Quét bằng AI"}
            </button>
            <p className="text-[12px] text-ink-2">Ảnh JPG/PNG/WebP tối đa 5MB. Ảnh chỉ dùng để đọc, không được lưu lại.</p>
          </div>

          <div className="grid content-start gap-3">
            {!res && !err && <p className="py-8 text-center text-[13.5px] text-ink-2">Chọn ảnh rồi bấm “Quét bằng AI”. Bạn sẽ được xem và sửa lại trước khi tạo khách.</p>}
            {err && <p className="rounded-md bg-[#df2f4a]/10 px-3 py-2 text-[13.5px] text-[#c4213a]">{err}</p>}
            {res && (
              <>
                <p className="text-[12.5px] text-ink-2">{res.kind === "id_card" ? "Đã nhận diện: căn cước / CMND" : res.kind === "business_card" ? "Đã nhận diện: danh thiếp" : "Ảnh khác: kiểm tra kỹ thông tin"}</p>
                <label className="grid gap-1">
                  <span className="text-[12.5px] text-ink-2">Họ tên</span>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                {res.fields.map((f) => (
                  <label key={f.key} className="grid gap-1">
                    <span className="text-[12.5px] text-ink-2">{f.label}</span>
                    {f.source === "idNumber" && !showId ? (
                      <span className="flex gap-2">
                        <input className="input tnum" value={maskId(values[f.key] ?? "")} readOnly aria-label={`${f.label} (đã che)`} />
                        <button type="button" className="btn-outline h-9 flex-none" onClick={() => setShowId(true)}>
                          <Icon name="eye" size={15} /> Hiện
                        </button>
                      </span>
                    ) : f.options ? (
                      <select className="input" value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                        <option value="">Chưa chọn</option>
                        {f.options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        onBlur={() => (f.source === "phone" || f.source === "email") && void checkDupes(valueOf("phone"), valueOf("email"))}
                      />
                    )}
                  </label>
                ))}
                {res.dropped.length > 0 && (
                  <div className="rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                    <b className="font-medium text-ink">Không lưu vì bảng chưa có trường phù hợp:</b>
                    <ul className="mt-1 grid gap-0.5">
                      {res.dropped.map((d) => (
                        <li key={d.source}>
                          {d.label}: {d.source === "idNumber" ? maskId(d.value) : d.value}
                        </li>
                      ))}
                    </ul>
                    {res.dropped.some((d) => d.source === "idNumber") && <p className="mt-1">Muốn lưu số CCCD, hãy thêm trường “Số CCCD” cho bảng khách trong Cài đặt.</p>}
                  </div>
                )}
                {dupes.length > 0 && (
                  <div className="rounded-md border border-[#fdab3d] bg-[#fdab3d]/10 px-3 py-2 text-[13px]">
                    <b className="font-medium">Có thể đã có khách này:</b>
                    <ul className="mt-1 grid gap-0.5">
                      {dupes.slice(0, 5).map((d, i) => (
                        <li key={d.id || i}>
                          {d.href ? (
                            <a href={d.href} target="_blank" rel="noopener" className="text-primary hover:underline">
                              {d.title}
                            </a>
                          ) : (
                            d.title
                          )}{" "}
                          <span className="text-ink-2">
                            · {d.reason}
                            {d.owner ? ` · ${d.owner} phụ trách` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="btn-primary" disabled={!res || !!busy || !title.trim()} onClick={() => void save()}>
            {busy === "save" ? "Đang tạo…" : dupes.length ? "Vẫn tạo khách mới" : "Tạo khách"}
          </button>
        </div>
      </div>
    </div>
  );
}
