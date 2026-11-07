import { test, expect } from "../support/fixtures";
import { uid } from "../support/db";
import { createContact } from "../support/api";

const saved = (page: import("@playwright/test").Page, method = "PATCH") => page.waitForResponse((r) => r.url().includes("/api/records/") && r.request().method() === method && r.ok());
const row = (page: import("@playwright/test").Page, name: string) => page.getByRole("row").filter({ has: page.getByRole("button", { name, exact: true }) });

test.describe("Bảng khách", () => {
  test("thêm khách mới bằng nút, đặt tên trong bảng chi tiết", async ({ page }) => {
    const name = `Khách ${uid()}`;
    await page.goto("/w/b/contacts");
    await page.getByRole("button", { name: "Thêm khách mới" }).click();
    const panel = page.getByRole("dialog", { name: "Khách mới" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Khách mới" }).first().click();
    await panel.getByRole("textbox", { name: "Khách" }).fill(name);
    const done = saved(page);
    await panel.getByRole("textbox", { name: "Khách" }).press("Enter");
    await done;
    await expect(page.getByRole("dialog", { name })).toBeVisible();
    await page.getByRole("dialog", { name }).getByRole("button", { name: "Đóng" }).click();
    await expect(row(page, name)).toBeVisible();
    await page.reload();
    await expect(row(page, name)).toBeVisible();
  });

  test("sửa ô SĐT ngay trên bảng và giữ sau khi tải lại", async ({ page }) => {
    const name = `Khách ${uid()}`;
    await createContact(page.request, name);
    await page.goto("/w/b/contacts");
    const r = row(page, name);
    // Cột thứ 4 là SĐT (Khách, Phụ trách, Tình trạng, SĐT...).
    await expect(page.getByRole("columnheader", { name: /^SĐT/ }).first()).toBeVisible();
    await r.getByRole("cell").nth(3).getByRole("button").click();
    const input = r.getByRole("textbox", { name: "SĐT" });
    await input.fill("0912345678");
    const done = saved(page);
    await input.press("Enter");
    await done;
    await expect(r.getByRole("cell").nth(3)).toHaveText("0912345678");
    await page.reload();
    await expect(row(page, name).getByRole("cell").nth(3)).toHaveText("0912345678");
  });

  test("mở chi tiết: tab 360° hiện, ghi cập nhật", async ({ page }) => {
    const name = `Khách ${uid()}`;
    await createContact(page.request, name);
    await page.goto("/w/b/contacts");
    await page.getByRole("button", { name: `Mở chi tiết ${name}` }).click();
    const panel = page.getByRole("dialog", { name });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "360°" }).click();
    await expect(panel.getByRole("region", { name: "Tổng quan khách" })).toBeVisible();
    await expect(panel.getByRole("region", { name: "Dòng thời gian" })).toBeVisible();
    await panel.getByRole("button", { name: "Cập nhật", exact: true }).first().click();
    const note = `Ghi chú E2E ${uid()}`;
    await panel.getByRole("textbox", { name: /Viết cập nhật/ }).fill(note);
    await panel.getByRole("button", { name: "Cập nhật", exact: true }).last().click();
    await expect(panel.getByRole("article").filter({ hasText: note })).toBeVisible();
  });

  test("lọc theo tình trạng", async ({ page }) => {
    const tag = uid("loc");
    await createContact(page.request, `VIP ${tag}`, { status: "vip" });
    await createContact(page.request, `Mới ${tag}`);
    await page.goto("/w/b/contacts");
    await page.getByPlaceholder("Tìm kiếm").fill(tag);
    await expect(row(page, `VIP ${tag}`)).toBeVisible();
    await expect(row(page, `Mới ${tag}`)).toBeVisible();
    await page.getByRole("button", { name: "Lọc", exact: true }).click();
    await page.getByRole("combobox", { name: "Trường điều kiện 1" }).selectOption({ label: "Tình trạng" });
    await page.getByRole("combobox", { name: "Điều kiện 1", exact: true }).selectOption({ label: "là" });
    const value = page.getByRole("combobox", { name: "Giá trị 1" }).or(page.getByRole("textbox", { name: "Giá trị 1" }));
    if ((await value.evaluate((el) => el.tagName)) === "SELECT") await value.selectOption({ label: "VIP" });
    else await value.fill("VIP");
    await expect(row(page, `VIP ${tag}`)).toBeVisible();
    await expect(row(page, `Mới ${tag}`)).toHaveCount(0);
    await page.getByRole("button", { name: "Xoá hết" }).click();
    await expect(row(page, `Mới ${tag}`)).toBeVisible();
  });

  test("lưu dạng xem rồi quay lại Mặc định", async ({ page }) => {
    const view = `Dạng xem ${uid()}`;
    await page.goto("/w/b/contacts");
    await page.getByRole("tab", { name: "Kanban" }).click();
    await page.getByRole("button", { name: "Lưu dạng xem" }).click();
    const dlg = page.getByRole("dialog", { name: "Lưu dạng xem" });
    await dlg.getByRole("textbox", { name: "Tên dạng xem" }).fill(view);
    await dlg.getByRole("button", { name: "Lưu dạng xem" }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole("button", { name: `Dạng xem: ${view}` })).toBeVisible();
    const pick = async (from: string, to: RegExp) => {
      await page.getByRole("button", { name: `Dạng xem: ${from}` }).click();
      await page.getByRole("menu", { name: "Dạng xem" }).getByRole("menuitemradio", { name: to }).click();
    };
    // Về Mặc định rồi đổi sang Bảng chính (Mặc định nhớ trạng thái trên máy này).
    await pick(view, /Mặc định/);
    await expect(page.getByRole("button", { name: "Dạng xem: Mặc định" })).toBeVisible();
    await page.getByRole("tab", { name: "Bảng chính" }).click();
    // Chọn lại dạng xem đã lưu: trở về Kanban.
    await pick("Mặc định", new RegExp(view));
    await expect(page.getByRole("tab", { name: "Kanban" })).toHaveAttribute("aria-selected", "true");
    await pick(view, /Mặc định/);
    await expect(page.getByRole("tab", { name: "Bảng chính" })).toHaveAttribute("aria-selected", "true");
  });

  test("Xuất Excel tải về một file", async ({ page }) => {
    await page.goto("/w/b/contacts");
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Xuất Excel" }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
    expect((await file.path()) && (await import("node:fs")).statSync((await file.path())!).size).toBeGreaterThan(100);
  });

  test("xoá vào thùng rác rồi khôi phục", async ({ page }) => {
    const name = `Khách ${uid()}`;
    await createContact(page.request, name);
    await page.goto("/w/b/contacts");
    await page.getByRole("button", { name: `Thao tác với ${name}` }).click();
    const menu = page.getByRole("menu", { name: `Thao tác với ${name}` });
    await menu.getByRole("menuitem", { name: "Xoá" }).click();
    // Bấm lần hai để xác nhận (nút Xoá đỏ thay chỗ trong menu).
    await expect(menu.getByRole("button", { name: "Huỷ" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Xoá" }).click();
    await expect(row(page, name)).toHaveCount(0);
    await page.goto("/w/trash");
    const item = page.getByRole("listitem").or(page.getByRole("row")).filter({ hasText: name });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Khôi phục" }).click();
    await expect(item).toHaveCount(0);
    await page.goto("/w/b/contacts");
    await expect(row(page, name)).toBeVisible();
  });

  // APP BUG (nhỏ, bàn phím/a11y): hộp "Lưu dạng xem" không đóng bằng phím Esc (mọi hộp thoại khác — Thêm sản phẩm,
  // Thêm câu hỏi KB, Phiếu nhập kho, bảng chi tiết — đều đóng). Overlay chặn mọi thao tác tới khi bấm Huỷ.
  // src/components/board/ViewsBar.tsx: <form role="dialog" aria-label="Lưu dạng xem"> không có xử lý keydown Escape.
  test("hộp Lưu dạng xem đóng bằng Esc", async ({ page }) => {
    await page.goto("/w/b/contacts");
    await page.getByRole("button", { name: "Lưu dạng xem" }).click();
    const dlg = page.getByRole("dialog", { name: "Lưu dạng xem" });
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  });
});
