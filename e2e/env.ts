// Cấu hình dùng chung cho máy chủ E2E, Playwright và các script tạo dữ liệu.
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "e2e", ".data");
export const APP_DIR = path.join(DATA_DIR, "app");
export const E2E_PORT = Number(process.env.E2E_PORT || 3333);
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const DATABASE_URL = `file:${path.join(DATA_DIR, "e2e.db")}`;

/** Biến môi trường của server kiểm thử (không lấy từ .env của dự án). */
export const E2E_ENV: Record<string, string> = {
  DATABASE_URL,
  SESSION_SECRET: "e2e-secret-chi-dung-cho-kiem-thu-playwright-0123456789",
  APP_URL: BASE_URL,
  NEXT_PUBLIC_APP_URL: BASE_URL,
  MESSAGING_DRY_RUN: "1",
  PAY_DRY_RUN: "1",
  CRM_JOBS: "off",
  ANTHROPIC_API_KEY: "",
  TZ: "Asia/Ho_Chi_Minh",
  NEXT_TELEMETRY_DISABLED: "1",
};

/** Tài khoản kiểm thử (seed-users.ts tạo; demo do scripts/demo.ts tạo). */
export const USERS = {
  owner: { email: "demo@dnacrm.local", password: "demo12345", name: "Chủ Demo" },
  staff: { email: "staff@e2e.local", password: "staff12345", name: "Nhân Viên E2E" },
} as const;
