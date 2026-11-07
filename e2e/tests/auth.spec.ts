import { test, expect } from "../support/fixtures";
import { createUser } from "../support/db";
import { fillLogin } from "../support/ui";

test.describe("Đăng nhập", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("đăng nhập đúng vào trang chủ, đăng xuất về trang đăng nhập", async ({ page }) => {
    const u = await createUser({ role: "owner" });
    await fillLogin(page, u.email, u.password);
    await expect(page).toHaveURL(/\/w$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(u.name.split(" ").pop()!);
    await page.getByRole("button", { name: "Tài khoản" }).click();
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/login/);
    // Phiên đã bị huỷ: vào /w lại bị đưa về đăng nhập.
    await page.goto("/w");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sai mật khẩu hiện thông báo chung", async ({ page }) => {
    const u = await createUser();
    await fillLogin(page, u.email, "sai-mat-khau");
    await expect(page.locator("form").getByRole("alert")).toHaveText(/Email hoặc mật khẩu chưa đúng/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("sai 5 lần thì tài khoản bị khoá tạm", async ({ page }) => {
    const u = await createUser();
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    const pw = page.getByLabel("Mật khẩu", { exact: true });
    for (let i = 0; i < 5; i++) {
      await pw.fill(`sai-${i}`);
      await page.getByRole("button", { name: "Đăng nhập" }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText(/chưa đúng/);
      await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeEnabled();
    }
    // Lần 6, kể cả đúng mật khẩu, vẫn bị khoá.
    await pw.fill(u.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Tài khoản tạm khoá do đăng nhập sai nhiều lần");
    await expect(page).toHaveURL(/\/login/);
  });

  test("chưa đăng nhập vào /w bị chuyển về /login", async ({ page }) => {
    await page.goto("/w/b/contacts");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
  });
});

test("trang bảo mật liệt kê thiết bị đang dùng", async ({ page }) => {
  await page.goto("/w/settings/security");
  await expect(page.getByRole("heading", { name: "Thiết bị đang đăng nhập" })).toBeVisible();
  const current = page.getByRole("listitem").filter({ hasText: "Thiết bị này" });
  await expect(current).toHaveCount(1);
  await expect(current).toContainText("Đang hoạt động");
});

test("nhân viên không mở được trang chỉ dành cho chủ", async ({ asUser }) => {
  const page = await asUser("staff");
  await page.goto("/w/settings/backup");
  await expect(page.getByRole("heading", { name: "Chỉ chủ workspace xem được trang này" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Tạo bản sao lưu|Sao lưu ngay/ })).toHaveCount(0);
  await page.goto("/w/settings/company");
  await expect(page.getByText("Chỉ chủ và quản lý sửa được thông tin doanh nghiệp")).toBeVisible();
  // API cũng chặn, không chỉ giao diện.
  const r = await page.request.get("/api/backup");
  expect(r.status()).toBe(403);
});
