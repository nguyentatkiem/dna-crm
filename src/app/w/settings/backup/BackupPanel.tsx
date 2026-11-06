"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

type B = { name: string; size: number; createdAt: string; dbSize?: number };

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function BackupPanel({ initial, enabled: en0, keep: keep0, workspaceName, provider }: { initial: B[]; enabled: boolean; keep: number; workspaceName: string; provider: string }) {
  const [list, setList] = useState(initial);
  const [enabled, setEnabled] = useState(en0);
  const [keep, setKeep] = useState(keep0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [restore, setRestore] = useState<B | null>(null);
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState("");

  async function reload() {
    const r = await fetch("/api/backup");
    if (r.ok) setList((await r.json()).backups);
  }

  async function backupNow() {
    setBusy("create");
    setMsg(null);
    const r = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không sao lưu được" });
    setMsg({ ok: true, text: `Đã tạo bản sao lưu ${d.name} (${size(d.size)}, ${d.counts?.record ?? 0} mục).` });
    reload();
  }

  async function saveAuto(next: { enabled?: boolean; keep?: number }) {
    setBusy("auto");
    const r = await fetch("/api/backup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không lưu được" });
    setEnabled(d.enabled);
    setKeep(d.keep);
    setMsg({ ok: true, text: d.enabled ? `Đã bật sao lưu tự động mỗi ngày, giữ ${d.keep} bản gần nhất.` : "Đã tắt sao lưu tự động." });
  }

  async function upload(f: File) {
    setBusy("upload");
    setMsg(null);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/backup", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không tải lên được" });
    setMsg({ ok: true, text: `Đã tải lên thành bản ${d.name}. Bấm Khôi phục ở dòng đó nếu muốn dùng.` });
    reload();
  }

  async function doRestore() {
    if (!restore) return;
    setBusy("restore");
    const r = await fetch(`/api/backup/${encodeURIComponent(restore.name)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed }) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Khôi phục không thành công" });
    setRestore(null);
    setMsg({ ok: true, text: `Đã khôi phục ${d.counts?.record ?? 0} mục từ ${restore.name}. Bản trước khi khôi phục được lưu là ${d.safety}.` });
    reload();
  }

  const openRestore = (b: B) => {
    setRestore(b);
    setStep(1);
    setTyped("");
  };

  return (
    <>
      {msg && (
        <p role="status" className={`mt-4 rounded-lg px-4 py-2.5 text-[14px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card min-w-0 p-0">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold">Bản sao lưu</h2>
              <p className="text-[13px] text-ink-2">{list.length ? `${list.length} bản, mới nhất ${when(list[0].createdAt)}` : "Chưa có bản nào"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={`btn-outline cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
                <Icon name="upload" size={16} /> {busy === "upload" ? "Đang tải lên..." : "Tải lên"}
                <input
                  type="file"
                  accept=".gz,.json,application/gzip,application/json"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(f);
                  }}
                />
              </label>
              <button type="button" className="btn-primary" onClick={backupNow} disabled={!!busy}>
                <Icon name="database" size={16} /> {busy === "create" ? "Đang sao lưu..." : "Sao lưu ngay"}
              </button>
            </div>
          </header>
          {list.length === 0 ? (
            <div className="grid place-items-center gap-2 px-6 py-12 text-center">
              <Icon name="database" size={30} className="text-ink-2" />
              <b>Chưa có bản sao lưu</b>
              <p className="max-w-sm text-[14px] text-ink-2">Bấm “Sao lưu ngay” để tạo bản đầu tiên. Khi bật tự động, CRM tự sao lưu mỗi ngày lúc đang chạy.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line-soft)]">
              {list.map((b, i) => (
                <li key={b.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-2 text-primary">
                    <Icon name="history" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14.5px] tnum">
                      {when(b.createdAt)} {i === 0 && <span className="ml-1 rounded-full bg-info-soft px-2 py-0.5 text-[11.5px] font-medium text-info">Mới nhất</span>}
                    </b>
                    <span className="block truncate font-mono text-[12px] text-ink-2">
                      {b.name} · {size(b.size)}
                    </span>
                  </span>
                  <span className="flex flex-none gap-1">
                    <a className="btn-ghost" href={`/api/backup/${encodeURIComponent(b.name)}`} download>
                      <Icon name="download" size={16} /> <span className="hidden sm:inline">Tải về</span>
                    </a>
                    <button type="button" className="btn-ghost text-danger" onClick={() => openRestore(b)} disabled={!!busy}>
                      <Icon name="refresh" size={16} /> <span className="hidden sm:inline">Khôi phục</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="grid content-start gap-4">
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold">Sao lưu tự động</h2>
                <p className="mt-1 text-[13px] text-ink-2">Mỗi ngày một bản khi CRM đang chạy.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Bật sao lưu tự động"
                disabled={busy === "auto"}
                onClick={() => saveAuto({ enabled: !enabled })}
                className={`relative h-6 w-11 flex-none rounded-full transition ${enabled ? "bg-primary" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            <label className="label mt-4" htmlFor="backup-keep">
              Số bản giữ lại
            </label>
            <div className="flex gap-2">
              <input id="backup-keep" type="number" min={1} max={365} className="input w-24 tnum" value={keep} onChange={(e) => setKeep(Number(e.target.value))} />
              <button type="button" className="btn-outline" onClick={() => saveAuto({ keep: Math.max(1, Math.min(365, Math.round(keep) || 14)) })} disabled={!!busy}>
                Lưu
              </button>
            </div>
            <p className="mt-2 text-[12.5px] text-ink-2">Bản cũ hơn sẽ tự xoá. Mặc định 14 bản (2 tuần).</p>
          </section>
          <section className="card p-5 text-[13px] text-ink-2">
            <h2 className="mb-2 text-[14px] font-semibold text-ink">Mẹo an toàn</h2>
            <ul className="grid list-disc gap-1.5 pl-4">
              <li>Thỉnh thoảng tải một bản về máy hoặc Google Drive, phòng khi máy chủ hỏng.</li>
              <li>Khôi phục ghi đè toàn bộ dữ liệu hiện tại; CRM tự sao lưu bản hiện tại ngay trước đó.</li>
              <li>
                Đang dùng cơ sở dữ liệu <b className="text-ink">{provider === "sqlite" ? "SQLite" : "Postgres"}</b>. Sao lưu cả hệ thống bằng lệnh <code className="rounded bg-surface-2 px-1">npm run backup</code>.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {restore && (
        <>
          <div className="anim-fade fixed inset-0 z-40 bg-black/30" onClick={() => !busy && setRestore(null)} aria-hidden="true" />
          <div role="dialog" aria-label="Khôi phục bản sao lưu" className="anim-fade fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-5 shadow-panel">
            <h2 className="text-[18px] font-semibold">Khôi phục bản {when(restore.createdAt)}?</h2>
            {step === 1 ? (
              <>
                <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2.5 text-[14px] text-warning">
                  Toàn bộ dữ liệu hiện tại của workspace (khách, giao dịch, cuộc gọi, hội thoại, tài liệu...) sẽ bị thay bằng dữ liệu trong bản sao lưu. Những gì thêm sau thời điểm này sẽ mất.
                </p>
                <p className="mt-2 text-[13px] text-ink-2">CRM sẽ tự sao lưu dữ liệu hiện tại trước khi khôi phục để bạn quay lại được.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className="btn-ghost" onClick={() => setRestore(null)}>
                    Huỷ
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setStep(2)}>
                    Tôi hiểu, tiếp tục
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="label mt-3" htmlFor="restore-confirm">
                  Gõ tên workspace <b className="text-ink">{workspaceName}</b> để xác nhận
                </label>
                <input id="restore-confirm" className="input w-full" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className="btn-ghost" onClick={() => setStep(1)} disabled={!!busy}>
                    Quay lại
                  </button>
                  <button type="button" className="btn-primary bg-danger hover:bg-danger" onClick={doRestore} disabled={typed.trim() !== workspaceName.trim() || !!busy}>
                    {busy === "restore" ? "Đang khôi phục..." : "Khôi phục"}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
