import { test, expect } from "../support/fixtures";
import { uid } from "../support/db";
import { createOrder, createProduct } from "../support/api";

test.describe("Bán hàng", () => {
  test("sản phẩm → báo giá → duyệt, gửi → link công khai → tạo đơn", async ({ page, browser, baseURL }) => {
    const prod = `SP ${uid()}`;
    const customer = `Khách BG ${uid()}`;
    // 1. Thêm sản phẩm
    await page.goto("/w/products");
    await page.getByRole("button", { name: "Thêm sản phẩm" }).click();
    const dlg = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Thêm sản phẩm" }) });
    await dlg.getByLabel("Tên *").fill(prod);
    await dlg.getByLabel("Giá bán (₫)").fill("1500000");
    await dlg.getByLabel("VAT %").selectOption("10%");
    await dlg.getByRole("button", { name: "Lưu" }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: prod })).toContainText("1.500.000 ₫");

    // 2. Báo giá có sản phẩm đó
    await page.goto("/w/quotes/new");
    await page.getByLabel("Tên khách *").fill(customer);
    await page.getByLabel("Thêm sản phẩm").fill(prod);
    await page.getByRole("option", { name: new RegExp(prod) }).click();
    await expect(page.getByRole("complementary")).toContainText(/Tổng cộng\s*1\.650\.000 ₫/);
    await page.getByRole("button", { name: "Lưu & duyệt" }).click();
    await expect(page).toHaveURL(/\/w\/quotes\/(?!new)[\w-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Đã duyệt");
    await expect(page.getByText("Bằng chữ: Một triệu sáu trăm năm mươi nghìn đồng")).toBeVisible();

    // 3. Gửi khách → có link công khai
    await page.getByRole("button", { name: "Gửi khách" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Đã gửi");
    const link = await page.getByRole("textbox", { name: "Link báo giá công khai" }).inputValue();
    expect(link).toMatch(/\/q\/[\w-]+$/);

    // 4. Khách (không đăng nhập) mở link
    const anon = await browser.newContext({ baseURL, serviceWorkers: "block" });
    const pub = await anon.newPage();
    await pub.goto(new URL(link).pathname);
    await expect(pub.getByText(prod)).toBeVisible();
    await expect(pub.getByText("1.650.000").first()).toBeVisible();
    await anon.close();

    // 5. Tạo đơn từ báo giá
    await page.getByRole("button", { name: "Tạo đơn hàng" }).click();
    await expect(page).toHaveURL(/\/w\/orders\/[\w-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mới");
    await expect(page.getByText(customer).first()).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: prod })).toBeVisible();
  });

  test("VietQR hiện mã QR, giả lập chuyển khoản thì đơn đã thu đủ", async ({ page }) => {
    const p = await createProduct(page.request, `SP ${uid()}`, { price: 500_000, vat: 0 });
    const o = await createOrder(page.request, `Khách QR ${uid()}`, p);
    await page.goto(`/w/orders/${o.id}`);
    const pay = page.getByRole("complementary");
    const qr = pay.getByRole("img", { name: /Mã VietQR chuyển khoản/ });
    await expect(qr).toBeVisible();
    expect(await qr.evaluate((el) => el.tagName.toLowerCase() === "svg" || !!el.querySelector("svg"))).toBeTruthy();
    await expect(pay).toContainText("500.000 ₫");
    await pay.getByRole("button", { name: /Giả lập khách chuyển khoản/ }).click();
    await expect(pay.getByText("Đã thu đủ")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Phiếu thu (1)" })).toBeVisible();
    await expect(page.getByText(/Còn nợ\s*0 ₫/)).toBeVisible();
    await expect(qr).toHaveCount(0);
  });

  test("tạo vận đơn mô phỏng", async ({ page }) => {
    const p = await createProduct(page.request, `SP ${uid()}`, { price: 300_000 });
    const o = await createOrder(page.request, `Khách giao ${uid()}`, p);
    await page.goto(`/w/orders/${o.id}`);
    await page.getByRole("button", { name: "Tạo vận đơn" }).click();
    await page.getByLabel("Điện thoại").fill("0909123456");
    await page.getByLabel("Số nhà, đường").fill("12 Lê Lợi");
    await page.getByLabel("Phường/Xã").fill("Bến Nghé");
    await page.getByLabel("Quận/Huyện").fill("Quận 1");
    await page.getByLabel("Tỉnh/Thành phố").fill("TP Hồ Chí Minh");
    await expect(page.getByLabel("Hãng vận chuyển")).toHaveValue("demo");
    await page.getByRole("button", { name: "Báo phí" }).click();
    await expect(page.getByText(/Phí dự kiến: [\d.]+ ₫/)).toBeVisible();
    await page.getByRole("button", { name: "Tạo vận đơn" }).last().click();
    const ship = page.locator("main");
    await expect(ship).toContainText(/Đã tạo\s*DEMO\w+/);
    await expect(ship.getByRole("listitem").filter({ hasText: "Tạo vận đơn mô phỏng" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Huỷ vận đơn" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Đang giao");
  });

  test("xuất hoá đơn điện tử demo", async ({ page }) => {
    const p = await createProduct(page.request, `SP ${uid()}`, { price: 2_000_000, vat: 8 });
    const o = await createOrder(page.request, `Khách HĐ ${uid()}`, p);
    await page.goto(`/w/orders/${o.id}`);
    await page.getByRole("button", { name: "Xuất hoá đơn" }).click();
    await expect(page.getByLabel("Người mua hàng")).not.toHaveValue("");
    await page.getByRole("button", { name: "Xuất hoá đơn demo" }).click();
    const inv = page.getByRole("listitem").filter({ hasText: "Đã phát hành" });
    await expect(inv).toContainText("2.160.000 ₫");
    await expect(inv).toContainText(/Mã tra cứu: \w+/);
    await expect(inv.getByRole("link", { name: "Xem / In" })).toHaveAttribute("href", /\/api\/einvoice\/.+\/view/);
  });

  test("trang in đơn hàng ghi số tiền bằng chữ", async ({ page }) => {
    const p = await createProduct(page.request, `SP ${uid()}`, { price: 1_250_000, vat: 0 });
    const o = await createOrder(page.request, `Khách in ${uid()}`, p, 2);
    await page.goto(`/w/orders/${o.id}/print`);
    await expect(page.getByRole("button", { name: "In / Lưu PDF" })).toBeVisible();
    await expect(page.getByText(o.number).first()).toBeVisible();
    await expect(page.getByText("Bằng chữ: Hai triệu năm trăm nghìn đồng")).toBeVisible();
  });
});
