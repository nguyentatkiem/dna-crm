import { test, expect } from "../support/fixtures";
import { uid } from "../support/db";
import { createOrder, createProduct } from "../support/api";
import type { Page } from "@playwright/test";

async function stockOf(page: Page, name: string) {
  await page.goto("/w/stock");
  await page.getByRole("textbox", { name: "Tìm sản phẩm" }).fill(name);
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name, exact: true }) });
  await expect(row).toBeVisible();
  return row.getByRole("cell").nth(2);
}

test("phiếu nhập tăng tồn; xác nhận đơn trừ kho; huỷ đơn hoàn kho", async ({ page }) => {
  const name = `Hàng kho ${uid()}`;
  const p = await createProduct(page.request, name, { price: 200_000, vat: 0, trackStock: true });

  // Nhập kho 10
  let cell = await stockOf(page, name);
  await expect(cell).toContainText("0");
  await page.getByRole("button", { name: `Nhập ${name}` }).click();
  const dlg = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Phiếu nhập kho" }) });
  await expect(dlg.getByRole("combobox", { name: "Sản phẩm dòng 1" })).toHaveValue(p.id);
  await dlg.getByRole("textbox", { name: "SL nhập" }).fill("10");
  await dlg.getByRole("button", { name: "Ghi phiếu nhập" }).click();
  await expect(dlg).toBeHidden();
  await expect(cell).toHaveText(/(^|\D)10$/);

  // Đơn 3 cái: xác nhận thì còn 7
  const o = await createOrder(page.request, `Khách kho ${uid()}`, p, 3);
  await page.goto(`/w/orders/${o.id}`);
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Đã xác nhận");
  cell = await stockOf(page, name);
  await expect(cell).toHaveText(/(^|\D)7$/);

  // Huỷ đơn: hoàn về 10
  await page.goto(`/w/orders/${o.id}`);
  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  const confirm = page.getByRole("dialog").or(page.getByRole("alertdialog")).filter({ hasText: /huỷ/i });
  if (await confirm.count()) await confirm.getByRole("button", { name: /Huỷ đơn|Đồng ý|Xác nhận/ }).last().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Đã huỷ");
  cell = await stockOf(page, name);
  await expect(cell).toHaveText(/(^|\D)10$/);
});
