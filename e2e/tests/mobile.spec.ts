// Chạy ở project "mobile" (viewport 375px).
import { test, expect } from "../support/fixtures";
import { createConversation, uid } from "../support/db";

test.describe("Điện thoại 375px", () => {
  test("thanh bên ẩn, thay bằng thanh điều hướng dưới; trang không cuộn ngang", async ({ page }) => {
    await page.goto("/w");
    await expect(page.getByRole("navigation", { name: "Điều hướng", exact: true })).toBeHidden();
    const bottom = page.getByRole("navigation", { name: "Điều hướng nhanh" });
    await expect(bottom).toBeVisible();
    for (const n of ["Trang chủ", "Telesales", "Việc"]) await expect(bottom.getByRole("link", { name: n })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await bottom.getByRole("link", { name: "Việc" }).click();
    await expect(page).toHaveURL(/\/w\/my-work/);
    await bottom.getByRole("button", { name: "Thêm" }).click();
    await expect(page.getByRole("link", { name: /Khách/ }).first()).toBeVisible();
  });

  test("hộp thư: danh sách → hội thoại → quay lại", async ({ page }) => {
    const name = `Chị Di Động ${uid()}`;
    await createConversation({ name, text: "Alo shop ơi" });
    await page.goto("/w");
    await page.getByRole("navigation", { name: "Điều hướng nhanh" }).getByRole("link", { name: /Hộp thư/ }).click();
    await expect(page).toHaveURL(/\/w\/inbox/);
    const list = page.getByRole("region", { name: "Danh sách hội thoại" });
    await expect(list).toBeVisible();
    await page.getByRole("textbox", { name: "Tìm hội thoại" }).fill(name);
    await page.getByRole("list", { name: "Hội thoại" }).getByRole("button", { name: new RegExp(name) }).first().click();

    const thread = page.getByRole("region", { name: "Hội thoại", exact: true });
    await expect(thread.getByText("Alo shop ơi")).toBeVisible();
    await expect(list).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Tin nhắn trả lời" })).toBeVisible();
    await thread.getByRole("button", { name: "Quay lại danh sách" }).click();
    await expect(list).toBeVisible();
    await expect(page.getByRole("list", { name: "Hội thoại" }).getByRole("button", { name: new RegExp(name) })).toBeVisible();
  });

  for (const path of ["/w/b/contacts", "/w/orders", "/w/products", "/w/reports", "/w/perf/overview", "/w/settings", "/w/chat", "/w/kb"]) {
    test(`không cuộn ngang: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Điều hướng nhanh" })).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      const over = await page.evaluate(() => {
        const w = window.innerWidth;
        const wide = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.right <= w + 1 || r.width === 0) return false;
            // Phần tử nằm trong vùng cuộn ngang riêng (bảng, thanh tab) thì không tính.
            for (let p = el.parentElement; p; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return false;
            }
            return true;
          })
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)} (${Math.round(el.getBoundingClientRect().right)}px)`);
        return { scroll: document.documentElement.scrollWidth, w, wide };
      });
      expect(over.scroll, `trang rộng hơn màn hình: ${over.wide.join("; ")}`).toBeLessThanOrEqual(over.w + 1);
    });
  }
});
