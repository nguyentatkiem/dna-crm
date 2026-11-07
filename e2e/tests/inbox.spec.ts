import { test, expect } from "../support/fixtures";
import { createConversation, uid } from "../support/db";
import { api, createProduct } from "../support/api";
import type { Page } from "@playwright/test";

const convList = (page: Page) => page.getByRole("list", { name: "Hội thoại" });
const thread = (page: Page) => page.getByRole("region", { name: "Hội thoại", exact: true });
const crm = (page: Page) => page.getByRole("complementary", { name: "Thông tin khách" });

async function openConv(page: Page, name: string) {
  await page.goto("/w/inbox");
  await page.getByRole("textbox", { name: "Tìm hội thoại" }).fill(name);
  await convList(page).getByRole("button", { name: new RegExp(name) }).first().click();
  await expect(thread(page)).toContainText(name);
}

test.describe("Hộp thư", () => {
  test("danh sách tải, tab Bình luận và bộ lọc Chưa trả lời", async ({ page }) => {
    const tag = uid("loc");
    await createConversation({ name: `Chị Chờ ${tag}`, text: "Shop ơi còn lịch không?" });
    await createConversation({ name: `Chị Đã Trả Lời ${tag}`, text: "Cảm ơn shop", replied: true });
    await page.goto("/w/inbox");
    await expect(convList(page).getByRole("listitem").first()).toBeVisible();

    await page.getByRole("tab", { name: /^Bình luận/ }).click();
    await expect(page.getByRole("tab", { name: /^Bình luận/ })).toHaveAttribute("aria-selected", "true");
    const items = convList(page).getByRole("button");
    for (let i = 0; i < 5; i++) await expect(items.nth(i)).toContainText("Bình luận");

    await page.getByRole("tab", { name: /^Tất cả/ }).click();
    await page.getByRole("textbox", { name: "Tìm hội thoại" }).fill(tag);
    await expect(convList(page).getByRole("button")).toHaveCount(2);
    await page.getByRole("button", { name: "Bộ lọc nâng cao" }).click();
    const panel = page.getByRole("dialog", { name: "Bộ lọc nâng cao" });
    await panel.getByRole("radiogroup", { name: "Trạng thái đọc" }).getByRole("radio", { name: "Chưa trả lời", exact: true }).check();
    await panel.getByRole("button", { name: "Đóng bộ lọc" }).click();
    await expect(convList(page).getByRole("button")).toHaveCount(1);
    await expect(convList(page).getByRole("button").first()).toContainText(`Chị Chờ ${tag}`);
  });

  test("mở hội thoại, gõ / chèn mẫu trả lời nhanh, gửi (chạy thử)", async ({ page }) => {
    const name = `Chị Hỏi ${uid()}`;
    const sc = `e2e${Date.now().toString(36)}`;
    const content = `Dạ bên em mở cửa 8h–21h mỗi ngày ạ (${sc})`;
    await api(page.request, "POST", "/api/inbox/quick-replies", { shortcut: sc, content, topic: "" });
    await createConversation({ name, text: "Mấy giờ spa mở cửa vậy?" });
    await openConv(page, name);
    await expect(thread(page).getByText("Mấy giờ spa mở cửa vậy?")).toBeVisible();

    const box = page.getByRole("textbox", { name: "Tin nhắn trả lời" });
    await box.click();
    await box.pressSequentially(`/${sc.slice(0, 6)}`);
    const sugg = page.getByRole("listbox", { name: "Mẫu trả lời nhanh" });
    await expect(sugg).toBeVisible();
    await sugg.getByRole("option").filter({ hasText: sc }).first().click();
    await expect(box).toHaveValue(content);

    const sent = page.waitForResponse((r) => r.url().endsWith("/messages") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    expect(await (await sent).json()).toMatchObject({ ok: true });
    await expect(box).toHaveValue("");
    await expect(thread(page).getByText(content)).toBeVisible();
    await expect(thread(page).getByRole("alert")).toHaveCount(0);
    // Đã trả lời: không còn trong "Chưa trả lời" (ô danh sách hiện "Bạn: ...").
    await expect(convList(page).getByRole("button", { name: new RegExp(name) })).toContainText("Bạn:");
  });

  test("gắn thẻ hội thoại", async ({ page }) => {
    const name = `Chị Thẻ ${uid()}`;
    await createConversation({ name, text: "Giá gói triệt lông?" });
    await openConv(page, name);
    await thread(page).getByRole("button", { name: "Thẻ", exact: true }).click();
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && (r.request().postData() ?? "").includes("tags"));
    await page.getByRole("checkbox", { name: "Hỏi giá" }).check();
    await saved;
    await expect(convList(page).getByRole("button", { name: new RegExp(name) })).toContainText("Hỏi giá");
    await page.reload();
    await expect(convList(page).getByRole("button", { name: new RegExp(name) })).toContainText("Hỏi giá");
  });

  test("bảng CRM: Tạo khách điền sẵn tên và SĐT từ hội thoại", async ({ page }) => {
    const name = `Chị Mới ${uid()}`;
    await createConversation({ name, text: "Số mình 0987 111 222 nhé", phone: "0987111222" });
    await openConv(page, name);
    await crm(page).getByRole("button", { name: "Tạo khách" }).click();
    await expect(crm(page).getByRole("textbox", { name: "Tên" })).toHaveValue(name);
    await expect(crm(page).getByRole("combobox", { name: "Số điện thoại" })).toHaveValue("0987111222");
    await crm(page).getByRole("button", { name: /^(Tạo|Tạo khách|Lưu)$/ }).last().click();
    await expect(crm(page).getByRole("link", { name: "Hồ sơ" })).toBeVisible();
    await expect(crm(page)).toContainText("0987111222");
  });

  test("tạo đơn hàng từ khung chat", async ({ page }) => {
    const name = `Chị Mua ${uid()}`;
    const prod = await createProduct(page.request, `SP chat ${uid()}`, { price: 350_000, vat: 0 });
    await createConversation({ name, text: "Lấy cho mình 1 hộp nhé, 0901 222 333", phone: "0901222333" });
    await openConv(page, name);
    await crm(page).getByRole("button", { name: "Tạo đơn hàng" }).click();
    const drawer = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Tạo đơn hàng" }) });
    await expect(drawer).toContainText(`Từ hội thoại với ${name}`);
    await drawer.getByRole("textbox", { name: "Sản phẩm" }).fill(prod.name);
    await drawer.getByRole("button", { name: new RegExp(prod.name) }).click();
    await expect(drawer.getByRole("definition").last()).toHaveText("350.000 ₫");
    await expect(drawer.getByRole("textbox", { name: "Tên khách" })).toHaveValue(name);
    await drawer.getByRole("textbox", { name: "Địa chỉ giao hàng" }).fill("1 Lê Duẩn, Quận 1, TP HCM");
    await drawer.getByRole("button", { name: "Tạo đơn" }).click();
    await expect(drawer.getByText(/Đã tạo đơn DH-\d{4}-\d+ · 350\.000 ₫/)).toBeVisible();
    await expect(drawer.getByRole("textbox", { name: "Tin nhắn thông tin chuyển khoản" })).toHaveValue(/\/p\/[\w.-]+/);
    // Tin xác nhận đơn (chạy thử) đã vào hội thoại.
    await expect(thread(page).getByText(/Dạ em xác nhận đơn DH-\d{4}-\d+/)).toBeVisible();
    const href = await drawer.getByRole("link", { name: "Mở đơn hàng" }).getAttribute("href");
    expect(href).toMatch(/^\/w\/orders\/[\w-]+$/);
    await page.goto(href!);
    await expect(page.getByRole("row").filter({ hasText: prod.name })).toBeVisible();
  });

  test("bình luận: ẩn rồi hiện lại (trang demo, chạy thử)", async ({ page }) => {
    const name = `Chị Bình Luận ${uid()}`;
    await createConversation({ name, text: "Giá bao nhiêu shop", kind: "comment" });
    await openConv(page, name);
    const item = thread(page).getByRole("listitem").filter({ hasText: "Giá bao nhiêu shop" });
    await item.getByRole("button", { name: "Ẩn", exact: true }).click();
    await expect(item.getByText("Đã ẩn")).toBeVisible();
    await item.getByRole("button", { name: "Hiện", exact: true }).click();
    await expect(item.getByText("Đã ẩn")).toHaveCount(0);
    await expect(item.getByRole("button", { name: "Ẩn", exact: true })).toBeVisible();
  });

  // APP BUG: khi MESSAGING_DRY_RUN=1, trả lời hội thoại Messenger của trang chưa có token (vd. hội thoại mẫu
  // pageId "mau-page" do seedInbox tạo, như "Lê Thu Hà") báo "Chưa có Page Access Token…" thay vì gửi chạy thử.
  // src/lib/messenger.ts: sendMessenger gọi pageToken() (ném lỗi khi thiếu token) TRƯỚC khi kiểm tra isDryRun().
  test("chạy thử (MESSAGING_DRY_RUN=1) trả lời được hội thoại mẫu chưa kết nối trang", async ({ page }) => {
    const name = `Chị Mẫu ${uid()}`;
    await createConversation({ name, text: "Còn lịch chiều nay không?", pageId: "mau-page" });
    await openConv(page, name);
    const sent = page.waitForResponse((r) => r.url().endsWith("/messages") && r.request().method() === "POST");
    await page.getByRole("textbox", { name: "Tin nhắn trả lời" }).fill("Dạ còn ạ");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    expect(await (await sent).json()).toMatchObject({ ok: true });
  });
});
