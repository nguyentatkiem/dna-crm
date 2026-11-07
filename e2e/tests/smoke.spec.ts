// Khói giao diện: mỗi trang chính tải xong, có tiêu đề, không lỗi JavaScript / hydration (fixture page đánh rớt khi có lỗi),
// không lỗi 5xx từ API trong lúc tải.
import { test, expect } from "../support/fixtures";
import { createContact } from "../support/api";

const PAGES: [string, string | RegExp][] = [
  ["/w", /^Chào buổi/],
  ["/w/b/contacts", "Khách"],
  ["/w/b/deals", "Liệu trình"],
  ["/w/my-work", /Việc/],
  ["/w/inbox", "Hộp thư"],
  ["/w/feed", /Bảng tin/],
  ["/w/dashboards", /Dashboard/],
  ["/w/products", "Sản phẩm & dịch vụ"],
  ["/w/stock", "Tồn kho"],
  ["/w/quotes", /Báo giá/],
  ["/w/orders", /Đơn hàng/],
  ["/w/payments", /Đối soát/],
  ["/w/telesales", /Telesales|Gọi/],
  ["/w/tickets", /Phiếu hỗ trợ/],
  ["/w/kb", "Kho kiến thức"],
  ["/w/reports", "Báo cáo tự tạo"],
  ["/w/perf/overview", "Tổng quan hiệu suất"],
  ["/w/kpi", "Chỉ tiêu KPI"],
  ["/w/settings", "DNA & Cấu hình"],
  ["/w/settings/roles", "Vai trò & quyền"],
  ["/w/trash", "Thùng rác"],
];

test.describe("Khói: trang chính không lỗi", () => {
  for (const [path, heading] of PAGES) {
    test(`${path}`, async ({ page }) => {
      const bad: string[] = [];
      page.on("response", (r) => {
        if (r.status() >= 500 && r.url().includes("/api/")) bad.push(`${r.status()} ${r.url()}`);
      });
      const res = await page.goto(path);
      expect(res?.status(), `HTTP ${path}`).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(heading);
      await page.waitForLoadState("networkidle").catch(() => {});
      expect(bad, "API lỗi 5xx").toEqual([]);
    });
  }
});

// APP BUG: thời gian tương đối ("vừa xong", "3 phút trước") render ở cả server và client mà KHÔNG có
// suppressHydrationWarning → lỗi hydration khi đồng hồ máy khách lệch server vài phút (hoặc ngẫu nhiên khi
// trang tải đúng lúc qua mốc phút — đã gặp 1 lần trên /w/automations khi chạy bình thường).
// - src/app/w/automations/Automations.tsx dòng ~245 (`lần gần nhất ${ago(r.lastRunAt)}`) và ~278 ({ago(x.at)})
// - src/components/feed/Feed.tsx dòng ~183 (<time>{ago(post.createdAt)}</time>) và ~238
// Các chỗ khác (ItemPanel, Automations dòng ~1187) đã có suppressHydrationWarning.
test.describe("Hydration khi đồng hồ máy khách lệch 3 phút", () => {
  for (const path of ["/w/automations", "/w/feed"]) {
    test(`${path} không lỗi hydration`, async ({ page }) => {
      await createContact(page.request, "Khách chạy tự động hoá"); // để có "lần chạy gần nhất" vừa xong
      await page.clock.install({ time: new Date(Date.now() + 3 * 60_000) });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
    });
  }
  // Đối chứng: các trang đã chặn đúng cách vẫn sạch khi đồng hồ lệch.
  for (const path of ["/w", "/w/b/contacts", "/w/inbox", "/w/chat"]) {
    test(`${path} không lỗi hydration`, async ({ page }) => {
      await page.clock.install({ time: new Date(Date.now() + 3 * 60_000) });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
    });
  }
});
