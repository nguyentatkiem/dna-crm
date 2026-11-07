import fs from "node:fs";
import { test, expect } from "../support/fixtures";
import { uid } from "../support/db";

test("tạo báo cáo từ mẫu: xem trước biểu đồ + bảng, lưu, xuất Excel/CSV", async ({ page }) => {
  const name = `Đơn theo trạng thái ${uid()}`;
  await page.goto("/w/reports");
  const tpl = page.locator("main").locator("div, li, article").filter({ has: page.getByText("Đơn theo trạng thái", { exact: true }) }).filter({ has: page.getByRole("link", { name: "Xem trước" }) }).last();
  await tpl.getByRole("link", { name: "Xem trước" }).click();
  await expect(page).toHaveURL(/\/w\/reports\/new\?template=orders_status/);

  const main = page.locator("main");
  await expect(main.getByText(/\d+ dòng dữ liệu/)).toBeVisible();
  await expect(main.locator("svg.recharts-surface").first()).toBeVisible();
  const table = main.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Trạng thái" })).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: /^Tổng/ })).toBeVisible();
  // Đổi kiểu hiển thị sang Bảng / Cột vẫn render.
  await page.getByRole("button", { name: "Cột", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cột", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(main.locator("svg.recharts-surface").first()).toBeVisible();

  await page.getByRole("textbox", { name: "Tên báo cáo" }).fill(name);
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page).toHaveURL(/\/w\/reports\/(?!new)[\w-]+$/);

  for (const kind of ["Excel", "CSV"] as const) {
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: kind, exact: true }).click();
    const f = await dl;
    expect(f.suggestedFilename()).toMatch(kind === "Excel" ? /\.xlsx$/ : /\.csv$/);
    expect(fs.statSync((await f.path())!).size).toBeGreaterThan(50);
  }

  await page.goto("/w/reports");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});
