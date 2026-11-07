import path from "node:path";
import { defineConfig } from "vitest/config";

// Kiểm thử thuần (không cần server, không đụng database thật). Chạy: npm test
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // tsconfig để jsx: "preserve" cho Next; kiểm thử .tsx (vd. mẫu in) cần biến JSX thành lời gọi React.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    env: { SESSION_SECRET: "test-secret-chi-dung-khi-chay-kiem-thu-0123456789", CRM_JOBS: "off" },
  },
});
