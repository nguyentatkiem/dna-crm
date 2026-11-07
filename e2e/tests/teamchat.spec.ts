import { test, expect } from "../support/fixtures";
import { createUser, uid } from "../support/db";
import { USERS } from "../env";

test("chủ nhắn riêng cho nhân viên; nhân viên thấy huy hiệu chưa đọc và tin nhắn", async ({ page, asUser }) => {
  const member = await createUser({ role: "member" });
  const text = `Chào bạn, nhớ gọi khách chiều nay nhé ${uid()}`;

  // Nhân viên mở app trước (để thấy huy hiệu cập nhật).
  const mp = await asUser(member);
  await mp.goto("/w");
  await expect(mp.getByRole("link", { name: "Chat nội bộ (0 tin chưa đọc)" })).toBeVisible();

  await page.goto("/w/chat");
  await page.getByRole("button", { name: new RegExp(member.name) }).click();
  const box = page.getByRole("textbox", { name: "Nội dung tin nhắn" });
  await box.fill(text);
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByText(text)).toBeVisible();
  await expect(box).toHaveValue("");

  // Huy hiệu trên thanh trên cùng (tải lại để không phụ thuộc chu kỳ hỏi lại).
  await expect(async () => {
    await mp.reload();
    await expect(mp.getByRole("link", { name: "Chat nội bộ (1 tin chưa đọc)" })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await mp.getByRole("link", { name: /Chat nội bộ \(1 tin chưa đọc\)/ }).click();
  await expect(mp).toHaveURL(/\/w\/chat/);
  await mp.getByRole("button", { name: new RegExp(USERS.owner.name) }).click();
  await expect(mp.getByText(text)).toBeVisible();
  await expect(mp.getByRole("link", { name: "Chat nội bộ (0 tin chưa đọc)" })).toBeVisible();
});
