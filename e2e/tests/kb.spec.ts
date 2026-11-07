import { test, expect } from "../support/fixtures";
import { uid } from "../support/db";

test("thêm câu hỏi thường gặp, chatbot thử trả lời đúng câu đó", async ({ page }) => {
  const code = uid("ma").replace(/[^a-z0-9]/g, "");
  const question = `Spa có nhận thẻ thanh toán ${code} không?`;
  const answer = `Dạ bên em nhận mọi loại thẻ ${code} ạ.`;
  await page.goto("/w/kb");
  await page.getByRole("button", { name: "Thêm câu hỏi" }).click();
  const dlg = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Thêm câu hỏi thường gặp" }) });
  await dlg.getByRole("textbox", { name: "Câu hỏi của khách" }).fill(question);
  await dlg.getByRole("textbox", { name: "Câu trả lời mẫu" }).fill(answer);
  await dlg.getByRole("textbox", { name: "Thẻ (cách nhau dấu phẩy)" }).fill(`thanh toán, ${code}`);
  await dlg.getByRole("button", { name: "Lưu" }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: question })).toContainText(answer);

  await page.getByRole("tab", { name: "Chatbot" }).click();
  await page.getByRole("textbox", { name: "Câu hỏi thử" }).fill(`spa co nhan the thanh toan ${code} khong`);
  await page.getByRole("button", { name: "Thử", exact: true }).click();
  await expect(page.getByText(answer).last()).toBeVisible();
});
