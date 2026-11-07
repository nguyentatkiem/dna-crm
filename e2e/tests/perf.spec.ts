import { test, expect } from "../support/fixtures";
import { USERS } from "../env";
import type { Page } from "@playwright/test";

const bodyRows = (page: Page) => page.locator("main table").first().getByRole("rowgroup").nth(1).getByRole("row");

test.describe("Hiệu suất & KPI", () => {
  test("chủ: tổng quan xếp hạng nhiều người, mở trang từng người", async ({ page }) => {
    await page.goto("/w/perf/overview");
    await expect(page.getByRole("heading", { name: "Tổng quan hiệu suất", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: /Bảng xếp hạng/ })).toBeVisible();
    await expect(bodyRows(page).filter({ hasText: "Thu Trang" })).toBeVisible();
    await expect(bodyRows(page).filter({ hasText: "Minh Đức" })).toBeVisible();
    await page.getByRole("button", { name: "7 ngày" }).click();
    await expect(page.getByRole("button", { name: "7 ngày" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Thu Trang", exact: true }).first().click();
    await expect(page).toHaveURL(/\/w\/perf\/people\/Thu%20Trang/);
    await expect(page.getByRole("heading", { name: "Thu Trang", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Điểm mạnh" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Kết quả" })).toBeVisible();
  });

  test("KPI: trang chỉ tiêu hiện tiến độ cả công ty", async ({ page }) => {
    await page.goto("/w/kpi");
    await expect(page.getByRole("heading", { name: "Chỉ tiêu KPI", level: 1 })).toBeVisible();
    const company = page.getByRole("region", { name: "Cả công ty" });
    await expect(company.getByRole("progressbar").first()).toBeVisible();
    await expect(company).toContainText("Doanh thu");
  });

  test("nhân viên chỉ thấy dòng của mình, không mở được hồ sơ người khác", async ({ asUser }) => {
    const page = await asUser("staff");
    await page.goto("/w/perf/overview");
    await expect(page.getByText("số liệu của bạn")).toBeVisible();
    const people = bodyRows(page).filter({ has: page.getByRole("rowheader") });
    await expect(people.first()).toContainText(USERS.staff.name);
    const names = (await page.locator("main table").first().getByRole("rowheader").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
    expect(names.filter((n) => !/Trung vị|Cả công ty/.test(n))).toEqual([expect.stringContaining(USERS.staff.name)]);
    await expect(page.locator("main")).not.toContainText("Thu Trang");
    await page.getByRole("link", { name: "Xem hồ sơ của bạn" }).click();
    await expect(page.getByRole("heading", { name: USERS.staff.name, level: 1 })).toBeVisible();
    await page.goto("/w/perf/people/Thu%20Trang?range=30d");
    await expect(page.getByText("Bạn không xem được hồ sơ này")).toBeVisible();
  });
});
