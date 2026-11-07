"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import type { Check, CheckStatus } from "@/lib/health/types";

const ORDER = ["Hệ thống", "Kênh chat", "Gửi tin", "Thanh toán", "Thông báo đẩy", "AI", "Tổng đài"];
const CHIP: Record<CheckStatus, { cls: string; text: string }> = {
  ok: { cls: "badge-success", text: "Ổn" },
  warn: { cls: "badge-warning", text: "Cần xem" },
  error: { cls: "badge-danger", text: "Lỗi" },
  off: { cls: "badge", text: "Chưa dùng" },
};
type Err = { id: string; level: string; message: string; stack: string; path: string; count: number; firstAt: string; lastAt: string; resolved: boolean };
const when = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function HealthBoard({ initial, isOwner }: { initial: Check[]; isOwner: boolean }) {
  const [checks, setChecks] = useState(initial);
  const [busy, setBusy] = useState<string>("");
  const [at, setAt] = useState<string>("");

  async function testAll() {
    setBusy("*");
    const r = await fetch("/api/health?live=1");
    if (r.ok) {
      const j = await r.json();
      setChecks(j.checks);
      setAt(j.at);
    }
    setBusy("");
  }
  async function testOne(key: string) {
    setBusy(key);
    const r = await fetch(`/api/health?live=1&key=${encodeURIComponent(key)}`);
    if (r.ok) {
      const j = (await r.json()) as { checks: Check[] };
      setChecks((cur) => {
        const rest = cur.filter((c) => !j.checks.some((n) => n.key === c.key));
        const idx = cur.findIndex((c) => c.key === key);
        const next = [...rest];
        next.splice(Math.max(0, idx), 0, ...j.checks);
        return next;
      });
    }
    setBusy("");
  }

  const groups = [...new Set([...ORDER, ...checks.map((c) => c.group)])].filter((g) => checks.some((c) => c.group === g));
  const count = (s: CheckStatus) => checks.filter((c) => c.status === s).length;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={testAll} disabled={!!busy}>
          <Icon name="refresh" size={16} className={busy === "*" ? "animate-spin" : ""} /> {busy === "*" ? "Đang kiểm tra..." : "Kiểm tra tất cả"}
        </button>
        <span className="flex flex-wrap gap-2 text-[13px]">
          <span className="badge-danger">{count("error")} lỗi</span>
          <span className="badge-warning">{count("warn")} cần xem</span>
          <span className="badge-success">{count("ok")} ổn</span>
          <span className="badge">{count("off")} chưa dùng</span>
        </span>
        {at && <span className="text-[12.5px] text-ink-2">Gọi thử lúc {when(at)}</span>}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {groups.map((g) => (
          <section key={g} className="card min-w-0 p-0">
            <h2 className="border-b border-line-soft px-5 py-3 text-[15px] font-semibold">{g}</h2>
            <ul className="divide-y divide-[var(--line-soft)]">
              {checks
                .filter((c) => c.group === g)
                .map((c) => (
                  <li key={c.key} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <span className={`${CHIP[c.status].cls} mt-0.5 w-[78px] flex-none justify-center`}>{CHIP[c.status].text}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[14px]">{c.label}</b>
                      <span className="block break-words text-[13px] text-ink-2">{c.detail}</span>
                    </span>
                    <span className="flex flex-none gap-1">
                      {c.testable && (
                        <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => testOne(c.key)} disabled={!!busy}>
                          {busy === c.key ? "Đang thử..." : "Thử ngay"}
                        </button>
                      )}
                      {c.fixHref && c.status !== "ok" && (
                        <Link href={c.fixHref} className="btn-outline h-8 text-[13px]">
                          Sửa
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <Errors isOwner={isOwner} />
      <Deploy />
    </>
  );
}

function Errors({ isOwner }: { isOwner: boolean }) {
  const [list, setList] = useState<Err[] | null>(null);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`/api/health/errors${all ? "?all=1" : ""}`);
    if (r.ok) setList((await r.json()).errors);
  }, [all]);
  useEffect(() => {
    load();
  }, [load]);
  async function send(method: string, body: unknown) {
    await fetch("/api/health/errors", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }
  return (
    <section id="errors" className="card mt-6 scroll-mt-20 p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Nhật ký lỗi máy chủ</h2>
          <p className="text-[13px] text-ink-2">Cùng một lỗi được gộp một dòng. Lỗi mới sẽ báo cho chủ workspace. Thông tin cá nhân và khoá đã được che.</p>
        </div>
        <span className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Gồm lỗi đã xử lý
          </label>
          <button type="button" className="btn-outline h-8 text-[13px]" disabled={!list?.some((e) => !e.resolved)} onClick={() => send("PATCH", { all: true })}>
            Đánh dấu tất cả đã xử lý
          </button>
          {isOwner && (
            <button type="button" className="btn-ghost h-8 text-[13px] text-danger" onClick={() => send("DELETE", {})}>
              Xoá lỗi đã xử lý
            </button>
          )}
        </span>
      </header>
      {!list ? (
        <div className="h-16 animate-pulse bg-surface-2" />
      ) : list.length === 0 ? (
        <p className="px-5 py-8 text-center text-[14px] text-ink-2">Không có lỗi nào. Tốt lắm!</p>
      ) : (
        <ul className="divide-y divide-[var(--line-soft)]">
          {list.map((e) => (
            <li key={e.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <span className={`${e.resolved ? "badge" : e.level === "warn" ? "badge-warning" : "badge-danger"} mt-0.5 flex-none tnum`}>×{e.count}</span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === e.id ? "" : e.id)} aria-expanded={open === e.id}>
                  <b className={`block break-words text-[14px] ${e.resolved ? "text-ink-2 line-through" : ""}`}>{e.message}</b>
                  <span className="block text-[12.5px] text-ink-2">
                    {e.path || "Việc nền"} · lần đầu {when(e.firstAt)} · gần nhất {when(e.lastAt)}
                  </span>
                </button>
                <button type="button" className="btn-ghost h-8 flex-none text-[13px]" onClick={() => send("PATCH", { id: e.id, resolved: !e.resolved })}>
                  {e.resolved ? "Mở lại" : "Đã xử lý"}
                </button>
              </div>
              {open === e.id && e.stack && <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-2 p-3 text-[11.5px] leading-relaxed">{e.stack}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Deploy() {
  const items = [
    ["SESSION_SECRET", "Chuỗi ngẫu nhiên ≥ 32 ký tự (openssl rand -base64 32). Đổi thì mọi người phải đăng nhập lại."],
    ["APP_URL", "Địa chỉ HTTPS công khai, vd. https://crm.congty.vn"],
    ["DATABASE_URL", "PostgreSQL khi chạy thật nhiều người (npm run db:postgres)"],
    ["VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY", "Thông báo đẩy lên điện thoại (npx web-push generate-vapid-keys)"],
    ["ANTHROPIC_API_KEY", "Bật AI Agent dùng Claude"],
    ["MESSAGING_DRY_RUN", "Để trống khi chạy thật (1 = chỉ ghi nhật ký, không gửi)"],
    ["ERROR_WEBHOOK_URL", "Không bắt buộc: nhận JSON mỗi khi có lỗi mới (Slack/Discord/n8n...)"],
  ];
  return (
    <section id="trien-khai" className="card mt-6 scroll-mt-20 p-5">
      <h2 className="text-[15px] font-semibold">Biến môi trường khi triển khai</h2>
      <p className="mt-1 text-[13px] text-ink-2">
        Đặt trong file <code>.env</code> (hoặc phần <code>environment</code> của docker-compose) rồi khởi động lại CRM. Hướng dẫn đầy đủ: <code>docs/TRIEN-KHAI.md</code>.
      </p>
      <dl className="mt-3 grid gap-2 text-[13.5px] sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        {items.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-[12.5px] font-semibold">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
