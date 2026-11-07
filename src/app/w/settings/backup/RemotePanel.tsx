"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export type RemoteView = {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  keep: number;
  secretSet: boolean;
  secretHint: string;
  lastAt?: string;
  lastOk?: boolean;
  lastError?: string;
  lastName?: string;
};

const PRESETS: { name: string; endpoint: string; region: string; hint: string }[] = [
  { name: "Cloudflare R2", endpoint: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com", region: "auto", hint: "R2 → Manage API tokens → quyền Object Read & Write cho bucket." },
  { name: "AWS S3", endpoint: "https://s3.ap-southeast-1.amazonaws.com", region: "ap-southeast-1", hint: "Tạo IAM user chỉ có quyền s3:PutObject, s3:ListBucket, s3:DeleteObject trên bucket." },
  { name: "Backblaze B2", endpoint: "https://s3.us-west-004.backblazeb2.com", region: "us-west-004", hint: "B2 → Application Keys → tạo key cho bucket. Endpoint xem ở trang bucket." },
  { name: "MinIO tự cài", endpoint: "https://minio.congty.vn", region: "us-east-1", hint: "Dùng Access Key của MinIO." },
];
const when = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function RemotePanel({ initial }: { initial: RemoteView }) {
  const [cfg, setCfg] = useState(initial);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof RemoteView, v: string | number | boolean) => setCfg((c) => ({ ...c, [k]: v }));
  const body = (extra: Record<string, unknown> = {}) => ({ endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket, prefix: cfg.prefix, accessKeyId: cfg.accessKeyId, keep: cfg.keep, enabled: cfg.enabled, ...(secret ? { secretAccessKey: secret } : {}), ...extra });

  async function call(method: string, b: unknown, tag: string) {
    setBusy(tag);
    setMsg(null);
    const r = await fetch("/api/backup/remote", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    return { ok: r.ok, j };
  }
  async function save(enabled = cfg.enabled) {
    const { ok, j } = await call("PUT", body({ enabled }), "save");
    if (!ok) return setMsg({ ok: false, text: j.error ?? "Không lưu được" });
    setCfg(j);
    setSecret("");
    setMsg({ ok: true, text: j.enabled ? "Đã lưu. Mỗi bản sao lưu tự động sẽ được đẩy lên kho ngoài." : "Đã lưu (đang tắt)." });
  }
  async function test() {
    const { ok, j } = await call("POST", body({ action: "test" }), "test");
    setMsg(ok ? { ok: true, text: "Kết nối tốt: đã ghi và xoá thử một file nhỏ trên bucket." } : { ok: false, text: j.error ?? "Không kết nối được" });
  }
  async function push() {
    const { ok, j } = await call("POST", { action: "push" }, "push");
    if (ok) setCfg(j.cfg);
    setMsg(ok ? { ok: true, text: `Đã đẩy ${j.name} lên kho ngoài${j.removed ? `, xoá ${j.removed} bản cũ` : ""}.` } : { ok: false, text: j.error ?? "Không đẩy được" });
  }

  return (
    <section id="remote" className="card mt-4 scroll-mt-20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Sao lưu ra ngoài máy chủ</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">Máy chủ hỏng ổ đĩa hoặc bị xoá thì bản sao lưu nằm cùng máy cũng mất. Bật mục này để mỗi bản sao lưu tự động được đẩy lên kho S3-compatible (Cloudflare R2, AWS S3, Backblaze B2, MinIO).</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={cfg.enabled}
          aria-label="Bật sao lưu ra ngoài"
          disabled={!!busy}
          onClick={() => save(!cfg.enabled)}
          className={`relative h-6 w-11 flex-none rounded-full transition ${cfg.enabled ? "bg-primary" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${cfg.enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {cfg.lastAt && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${cfg.lastOk ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          Lần đẩy gần nhất {when(cfg.lastAt)}: {cfg.lastOk ? `thành công (${cfg.lastName})` : `lỗi — ${cfg.lastError}`}
        </p>
      )}
      {msg && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-[12.5px]">
        <span className="text-ink-2">Mẫu nhanh:</span>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="chip" title={p.hint} onClick={() => setCfg((c) => ({ ...c, endpoint: p.endpoint, region: p.region }))}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] sm:col-span-2">
          Endpoint
          <input id="rb-endpoint" className="input h-10 font-mono text-[13px]" value={cfg.endpoint} onChange={(e) => set("endpoint", e.target.value)} placeholder="https://<account>.r2.cloudflarestorage.com" />
        </label>
        <label className="grid gap-1 text-[13px]">
          Bucket
          <input id="rb-bucket" className="input h-10" value={cfg.bucket} onChange={(e) => set("bucket", e.target.value)} placeholder="crm-backup" />
        </label>
        <label className="grid gap-1 text-[13px]">
          Vùng (region)
          <input id="rb-region" className="input h-10" value={cfg.region} onChange={(e) => set("region", e.target.value)} placeholder="auto / ap-southeast-1" />
        </label>
        <label className="grid gap-1 text-[13px]">
          Access Key ID
          <input id="rb-key" className="input h-10 font-mono text-[13px]" autoComplete="off" value={cfg.accessKeyId} onChange={(e) => set("accessKeyId", e.target.value)} />
        </label>
        <label className="grid gap-1 text-[13px]">
          Secret Access Key
          <input id="rb-secret" type="password" className="input h-10 font-mono text-[13px]" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={cfg.secretSet ? `Đã lưu ${cfg.secretHint} — để trống nếu không đổi` : ""} />
        </label>
        <label className="grid gap-1 text-[13px]">
          Thư mục trong bucket
          <input id="rb-prefix" className="input h-10" value={cfg.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="dna-crm/" />
        </label>
        <label className="grid gap-1 text-[13px]">
          Số bản giữ trên kho ngoài
          <input id="rb-keep" type="number" min={1} max={365} className="input h-10" value={cfg.keep} onChange={(e) => set("keep", Number(e.target.value))} />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => save()} disabled={!!busy}>
          {busy === "save" ? "Đang lưu..." : "Lưu"}
        </button>
        <button type="button" className="btn-outline" onClick={test} disabled={!!busy}>
          <Icon name="refresh" size={15} /> {busy === "test" ? "Đang thử..." : "Thử kết nối"}
        </button>
        <button type="button" className="btn-outline" onClick={push} disabled={!!busy || !cfg.enabled}>
          <Icon name="upload" size={15} /> {busy === "push" ? "Đang đẩy..." : "Đẩy bản mới nhất ngay"}
        </button>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-2">Khoá bí mật chỉ lưu trên máy chủ, không hiển thị lại. Nên tạo khoá riêng chỉ có quyền trên đúng bucket này.</p>
    </section>
  );
}
