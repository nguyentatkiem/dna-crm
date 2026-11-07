import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./e2e/env";

// Kiểm thử E2E: server + database RIÊNG (e2e/server.ts), không đụng prisma/dev.db hay server dev :3210.
// Chạy: npm run test:e2e   |   giao diện: npm run test:e2e:ui   |   dùng lại server đang chạy: E2E_REUSE=1
export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: "./e2e/.data/results",
  fullyParallel: true,
  // SQLite chỉ có một luồng ghi: 2 worker là vừa.
  workers: Number(process.env.E2E_WORKERS || 2),
  retries: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.data/report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // Dùng Google Chrome đã cài trên máy (không tải trình duyệt của Playwright). CI: npx playwright install chromium và đặt E2E_CHANNEL=chromium.
    channel: process.env.E2E_CHANNEL || "chrome",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    serviceWorkers: "block",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL || "chrome", storageState: "e2e/.data/auth/owner.json" },
      dependencies: ["setup"],
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      // Viewport 375px, giữ Chrome desktop (không cần WebKit).
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL || "chrome", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, storageState: "e2e/.data/auth/owner.json" },
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npx tsx e2e/server.ts",
    url: `${BASE_URL}/login`,
    timeout: 240_000,
    reuseExistingServer: process.env.E2E_REUSE === "1",
    // Nhật ký từng request của next dev: bật bằng E2E_SERVER_LOG=1.
    stdout: process.env.E2E_SERVER_LOG ? "pipe" : "ignore",
    stderr: "pipe",
  },
});
