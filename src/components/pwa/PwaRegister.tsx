"use client";

import { useEffect } from "react";

/** Đăng ký service worker: chỉ khi build production, hoặc khi đặt NEXT_PUBLIC_PWA_DEV=1 để thử ở máy dev. */
export function PwaRegister() {
  useEffect(() => {
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_PWA_DEV === "1";
    if (!enabled || !("serviceWorker" in navigator)) return;
    const go = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("[pwa]", e));
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}

/** Gọi khi đăng xuất: xoá các trang đã lưu offline của người dùng trên máy này. */
export function clearPwaPages() {
  navigator.serviceWorker?.controller?.postMessage({ type: "logout" });
}
