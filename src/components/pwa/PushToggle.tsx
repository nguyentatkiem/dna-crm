"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { viMessage } from "@/lib/format";

/** Khoá VAPID dạng base64url → Uint8Array cho pushManager.subscribe. */
function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "hidden" | "off" | "on" | "denied" | "busy";

/**
 * Bật/tắt thông báo đẩy trên thiết bị này. Chỉ hiện khi máy chủ đã cấu hình VAPID (GET /api/push/key)
 * và trình duyệt hỗ trợ (cần service worker đã đăng ký: production hoặc NEXT_PUBLIC_PWA_DEV=1).
 */
export function PushToggle({ className = "" }: { className?: string }) {
  const [key, setKey] = useState("");
  const [state, setState] = useState<State>("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return alive && setState("hidden");
      const r = await fetch("/api/push/key").catch(() => null);
      const k = r?.ok ? ((await r.json()).key as string) : "";
      if (!alive) return;
      if (!k) return setState("hidden");
      setKey(k);
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (alive) setState(sub ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state === "hidden" || state === "loading") return null;

  async function enable() {
    setErr("");
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), test: true }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Không lưu được đăng ký");
      setState("on");
    } catch (e) {
      setErr(viMessage(e, "Không bật được thông báo"));
      setState("off");
    }
  }

  async function disable() {
    setErr("");
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setErr(viMessage(e, "Không tắt được"));
      setState("on");
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Icon name="bell" size={18} className="text-ink-2" />
          <span>
            <span className="block font-medium">Thông báo trên thiết bị này</span>
            <span className="text-[13px] text-ink-2">{state === "on" ? "Đang bật: việc đến hạn, @nhắc tên, khách mới… hiện cả khi đóng app." : state === "denied" ? "Trình duyệt đang chặn thông báo. Hãy cho phép trong cài đặt trang web." : "Nhận thông báo ngay cả khi không mở CRM."}</span>
          </span>
        </span>
        {state !== "denied" && (
          <button type="button" className={state === "on" ? "btn-outline" : "btn-primary"} disabled={state === "busy"} onClick={state === "on" ? disable : enable}>
            {state === "busy" ? "Đang xử lý…" : state === "on" ? "Tắt" : "Bật thông báo"}
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}
    </div>
  );
}
