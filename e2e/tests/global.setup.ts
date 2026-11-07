// Đăng nhập một lần cho từng vai trò, lưu storageState; làm nóng các trang chính (next dev biên dịch lần đầu chậm).
import fs from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { USERS } from "../env";

const WARM = ["/w", "/w/b/contacts", "/w/inbox", "/w/products", "/w/quotes", "/w/quotes/new", "/w/orders", "/w/orders/new", "/w/stock", "/w/kb", "/w/chat", "/w/reports", "/w/perf/overview", "/w/kpi", "/w/settings", "/w/settings/roles", "/w/settings/security", "/w/trash", "/w/my-work", "/w/inbox/posts", "/w/payments", "/w/dashboards", "/w/telesales", "/w/tickets", "/w/feed"];

for (const role of ["owner", "staff"] as const) {
  setup(`đăng nhập ${role}`, async ({ request, baseURL }) => {
    setup.setTimeout(240_000);
    const u = USERS[role];
    const r = await request.post("/api/auth/login", { data: { email: u.email, password: u.password } });
    expect(r.ok(), await r.text()).toBeTruthy();
    fs.mkdirSync("e2e/.data/auth", { recursive: true });
    await request.storageState({ path: `e2e/.data/auth/${role}.json` });
    if (role === "owner") {
      // Biên dịch trước (song song từng nhóm nhỏ) để bài kiểm thử không chờ Turbopack.
      for (let i = 0; i < WARM.length; i += 5) await Promise.all(WARM.slice(i, i + 5).map((p) => request.get(`${baseURL}${p}`, { timeout: 120_000 })));
    }
  });
}
