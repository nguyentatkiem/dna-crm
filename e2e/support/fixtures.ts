// Fixture chung: gom lỗi trình duyệt (pageerror, lỗi hydration của React) và đánh rớt bài nếu có.
// Bài nào cố ý gây lỗi thì gọi allowErrors(/mẫu/).
import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { USERS } from "../env";

const HYDRATION = /hydrat|did not match|server rendered HTML|Text content does not match/i;

type ErrLog = { errs: string[]; allowed: RegExp[] };
type Fx = {
  errorLog: ErrLog;
  allowErrors: (re: RegExp) => void;
  /** Mở trang với phiên của một vai trò khác (nhân viên / người dùng tạm). */
  asUser: (who: "staff" | { email: string; password: string }) => Promise<Page>;
};

export async function loginContext(browser: Browser, email: string, password: string, baseURL: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL, storageState: undefined, serviceWorkers: "block", locale: "vi-VN" });
  const r = await ctx.request.post("/api/auth/login", { data: { email, password } });
  expect(r.ok(), `đăng nhập ${email}: ${r.status()} ${await r.text()}`).toBeTruthy();
  return ctx;
}

export const test = base.extend<Fx>({
  errorLog: async ({}, use) => {
    const log: ErrLog = { errs: [], allowed: [] };
    await use(log);
    const bad = log.errs.filter((e) => !log.allowed.some((re) => re.test(e)));
    expect(bad, "Trang có lỗi JavaScript / hydration").toEqual([]);
  },
  allowErrors: async ({ errorLog }, use) => use((re) => void errorLog.allowed.push(re)),
  page: async ({ page, errorLog }, use) => {
    watch(page, errorLog.errs);
    await use(page);
  },
  asUser: async ({ browser, baseURL, errorLog }, use) => {
    const ctxs: BrowserContext[] = [];
    await use(async (who) => {
      const u = who === "staff" ? USERS.staff : who;
      const ctx = await loginContext(browser, u.email, u.password, baseURL!);
      ctxs.push(ctx);
      const p = await ctx.newPage();
      watch(p, errorLog.errs);
      return p;
    });
    for (const c of ctxs) await c.close();
  },
});

function watch(page: Page, errs: string[]) {
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && HYDRATION.test(m.text())) errs.push(`hydration: ${m.text().slice(0, 500)}`);
  });
}

export { expect };
