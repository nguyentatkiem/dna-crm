import { describe, expect, it } from "vitest";
import { findMentions } from "@/lib/mentions";

describe("@nhắc tên", () => {
  const team = ["Minh", "Minh Đức", "Lan", "Thu Trang"];

  it("bắt tên có dấu cách, ưu tiên tên dài", () => {
    expect(findMentions("Nhờ @Minh Đức gọi lại khách nhé", team)).toEqual(["Minh Đức"]);
    expect(findMentions("@Minh và @Minh Đức cùng xem", team).sort()).toEqual(["Minh", "Minh Đức"]);
  });

  it("không bắt email hay chữ dính liền", () => {
    expect(findMentions("gửi lan@email.vn", team)).toEqual([]);
    expect(findMentions("@Lanh không phải Lan", team)).toEqual([]);
  });

  it("không phân biệt hoa thường, đầu dòng và cuối câu", () => {
    expect(findMentions("@thu trang, chốt chưa?", team)).toEqual(["Thu Trang"]);
    expect(findMentions("Xong rồi @Lan.", team)).toEqual(["Lan"]);
  });
});
