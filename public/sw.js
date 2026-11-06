/* Service worker của DNA CRM: chạy offline cơ bản + nhận thông báo đẩy. Đổi VERSION để xoá cache cũ. */
const VERSION = "dna-crm-v1";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon-32.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Trang: mạng trước, lỗi mạng thì lấy bản đã lưu, không có thì trang offline. */
async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    // Chỉ lưu trang tải thành công, không lưu trang chuyển hướng (đăng nhập).
    if (res.ok && res.type === "basic" && !res.redirected) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await caches.match(OFFLINE_URL)) || new Response("Mất kết nối", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

/** Tệp tĩnh có mã băm: trả bản đã lưu ngay, đồng thời tải bản mới ở nền. */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API, tải file, máy chủ dev: luôn đi mạng, không đụng tới.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.startsWith("/uploads/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (req.mode === "navigate") event.respondWith(networkFirst(req));
});

// ---------- Thông báo đẩy ----------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "DNA CRM";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/maskable-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/w" },
      lang: "vi",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/w", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === target && "focus" in c) return c.focus();
      }
      // Có cửa sổ app đang mở thì chuyển nó tới trang cần xem.
      const any = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (any && "navigate" in any) return any.navigate(target).then((c) => (c ? c.focus() : self.clients.openWindow(target)));
      return self.clients.openWindow(target);
    }),
  );
});

// Đăng xuất: trang gửi postMessage({ type: "logout" }) để xoá các trang đã lưu của người dùng.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "logout") event.waitUntil(caches.delete(PAGES));
});
