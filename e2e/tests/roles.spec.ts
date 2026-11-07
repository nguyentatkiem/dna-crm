import { test, expect } from "../support/fixtures";
import { createUser, uid } from "../support/db";

test("vai trò tự tạo (bỏ quyền xuất Excel) gán cho nhân viên: giao diện ẩn nút xuất", async ({ page, asUser }) => {
  const role = `Kế toán ${uid()}`;
  const member = await createUser({ role: "member" });

  // 1. Tạo vai trò sao chép từ Quản lý, bỏ quyền xuất Excel
  await page.goto("/w/settings/roles");
  await page.getByRole("button", { name: "Tạo vai trò" }).click();
  await page.getByRole("textbox", { name: "Tên vai trò" }).fill(role);
  await page.getByRole("combobox", { name: "Sao chép quyền từ" }).selectOption({ label: "Quản lý" });
  await page.getByRole("button", { name: "Tạo", exact: true }).click();
  const editor = page.getByRole("region", { name: `Quyền của vai trò ${role}` });
  await expect(editor).toBeVisible();
  const exp = editor.getByRole("checkbox", { name: /Xuất dữ liệu ra Excel/ });
  await expect(exp).toBeChecked();
  await exp.uncheck();
  const patched = page.waitForResponse((r) => r.url().includes("/api/roles/") && r.request().method() === "PATCH");
  await editor.getByRole("button", { name: "Lưu", exact: true }).click();
  expect((await patched).ok()).toBeTruthy();
  await expect(editor.getByRole("button", { name: "Lưu", exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole("complementary", { name: "Danh sách vai trò" }).getByRole("button", { name: new RegExp(role) }).click();
  await expect(page.getByRole("region", { name: `Quyền của vai trò ${role}` }).getByRole("checkbox", { name: /Xuất dữ liệu ra Excel/ })).not.toBeChecked();

  // 2. Gán cho nhân viên
  await page.goto("/w/settings#members");
  const pick = page.getByRole("combobox", { name: `Vai trò của ${member.name}` });
  const saved = page.waitForResponse((r) => r.url().includes("/api/members") && r.request().method() !== "GET");
  await pick.selectOption({ label: role });
  expect((await saved).ok()).toBeTruthy();

  // 3. Nhân viên: có Nhập (quyền của Quản lý) nhưng không có Xuất Excel
  const mp = await asUser(member);
  await mp.goto("/w/b/contacts");
  await expect(mp.getByRole("heading", { name: "Khách", level: 1 })).toBeVisible();
  await expect(mp.getByRole("button", { name: "Nhập", exact: true })).toBeVisible();
  await expect(mp.getByRole("button", { name: "Xuất Excel" })).toHaveCount(0);
  const r = await mp.request.get("/api/records/export?object=contacts");
  expect(r.status()).toBe(403);
});
