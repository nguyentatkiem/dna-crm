// Thao tác giao diện dùng chung.
import { expect, type Page } from "@playwright/test";

export async function fillLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

/** Thông báo nổi (toast) chứa đoạn chữ. */
export const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text }).or(page.getByText(text)).first();

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(toast(page, text)).toBeVisible();
}
