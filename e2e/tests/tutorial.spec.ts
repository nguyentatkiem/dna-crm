import { test, expect } from "../support/fixtures";
import { createUser } from "../support/db";

test.describe("Hướng dẫn người mới", () => {
  test("lời chào hiện cho người mới, tour 'Đi một vòng' chạy 3 bước và Esc đóng", async ({ asUser }) => {
    const u = await createUser({ role: "member", welcomeSeen: false });
    const page = await asUser(u);
    await page.goto("/w");
    const welcome = page.getByRole("dialog", { name: /mừng bạn đến DNA CRM/ });
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText("Nhân viên");
    await welcome.getByRole("button", { name: /Đi một vòng/ }).click();
    await expect(welcome).toBeHidden();

    const card = page.locator("[data-tut-box][role=dialog]");
    await expect(card.getByRole("heading", { name: "Menu chính" })).toBeVisible();
    await expect(card).toContainText("1/");
    await card.getByRole("button", { name: "Tiếp" }).click();
    await expect(card.getByRole("heading", { name: "Tìm nhanh" })).toBeVisible();
    await expect(card).toContainText("2/");
    await card.getByRole("button", { name: "Tiếp" }).click();
    // Bước 3 tự chuyển sang bảng khách.
    await expect(page).toHaveURL(/\/w\/b\/contacts/);
    await expect(card.getByRole("heading", { name: /^Bảng / })).toBeVisible();
    await expect(card).toContainText("3/");

    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    // Đã đánh dấu xem lời chào: tải lại không hiện nữa.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Khách", level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /mừng bạn đến DNA CRM/ })).toHaveCount(0);
  });

  test("nút tiến độ 'Bắt đầu' mở danh sách việc cần làm", async ({ asUser }) => {
    const u = await createUser({ role: "member", welcomeSeen: false });
    const page = await asUser(u);
    await page.goto("/w");
    await page.getByRole("dialog", { name: /mừng bạn đến DNA CRM/ }).getByRole("button", { name: /Tôi tự khám phá/ }).click();
    const pill = page.getByRole("button", { name: /Bắt đầu với DNA CRM: xong \d+ trên \d+ việc/ });
    await expect(pill).toBeVisible();
    await pill.click();
    const panel = page.getByRole("dialog", { name: "Bắt đầu với DNA CRM" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("progressbar", { name: "Tiến độ" })).toBeVisible();
    await panel.getByRole("button", { name: "Đóng danh sách" }).click();
    await expect(panel).toBeHidden();
  });
});
