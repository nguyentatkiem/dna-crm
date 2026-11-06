import { describe, expect, it } from "vitest";
import { cleanTopics, givenName, insertAt, keyFromName, normShortcut, parseQuickImport, quickToCsv, renderQuickReply, slashToken, suggestQuick, varsFor, type QuickReplyDTO } from "@/lib/quick-replies";

const NOW = new Date("2026-11-06T03:00:00Z");
const qr = (shortcut: string, content: string, extra: Partial<QuickReplyDTO> = {}): QuickReplyDTO => ({ id: shortcut, shortcut, topic: "", content, attachments: [], sort: 0, uses: 0, createdBy: "", ...extra });

describe("renderQuickReply", () => {
  it("thay đủ biến", () => {
    const out = renderQuickReply("Dạ {ten_day_du} ({ten}) ơi, em {nhan_vien} bên {trang}. SĐT {sdt}, hôm nay {ngay}.", { ten: "Lan", ten_day_du: "Nguyễn Thị Lan", nhan_vien: "Thu Trang", trang: "Hương Spa", sdt: "0912345678" }, NOW);
    expect(out).toBe("Dạ Nguyễn Thị Lan (Lan) ơi, em Thu Trang bên Hương Spa. SĐT 0912345678, hôm nay 06/11/2026.");
  });
  it("biến trống: bỏ và dọn khoảng trắng / dấu phẩy", () => {
    expect(renderQuickReply("Dạ em chào anh/chị {ten}, em giúp gì ạ?", {}, NOW)).toBe("Dạ em chào anh/chị, em giúp gì ạ?");
  });
  it("giữ biến lạ và xuống dòng", () => {
    expect(renderQuickReply("Mã {ma_don}\n  Cảm ơn {ten}  ", { ten: "Hà" }, NOW)).toBe("Mã {ma_don}\nCảm ơn Hà");
  });
  it("varsFor: tên tạm 'Khách Zalo' không dùng làm tên gọi", () => {
    expect(varsFor({ name: "Khách Zalo", phones: [] }, "Lan", "Spa")).toMatchObject({ ten: "", ten_day_du: "", nhan_vien: "Lan", trang: "Spa", sdt: "" });
    expect(varsFor({ name: "Trần Minh Khoa", phones: ["0912"], pageName: "Trang A" }, "Lan")).toMatchObject({ ten: "Khoa", trang: "Trang A", sdt: "0912" });
    expect(givenName("  Lê Thu Hà ")).toBe("Hà");
  });
});

describe("gõ / để chọn mẫu", () => {
  it("nhận / ở đầu hoặc sau khoảng trắng, không bắt link", () => {
    expect(slashToken("/ch", 3)).toEqual({ query: "ch", start: 0 });
    expect(slashToken("Dạ /gia", 7)).toEqual({ query: "gia", start: 3 });
    expect(slashToken("http://abc", 10)).toBeNull();
    expect(slashToken("Dạ /gia xong", 12)).toBeNull();
  });
  it("gợi ý: khớp đầu phím tắt > chứa > nội dung, không dấu", () => {
    const list = [qr("baogia", "Bảng giá"), qr("chao", "Chào anh chị", { uses: 1 }), qr("x", "Địa chỉ shop"), qr("chaomung", "Chào mừng", { uses: 9 })];
    expect(suggestQuick(list, "chao").map((r) => r.id)).toEqual(["chaomung", "chao"]);
    expect(suggestQuick(list, "dia").map((r) => r.id)).toEqual(["x"]);
    expect(suggestQuick(list, "gia").map((r) => r.id)).toEqual(["baogia"]);
    expect(suggestQuick(list, "").length).toBe(4);
  });
  it("chèn thay đoạn /xyz", () => {
    expect(insertAt("Dạ /ch nhé", 3, 6, "Chào Lan")).toEqual({ text: "Dạ Chào Lan nhé", caret: 11 });
  });
  it("chuẩn hoá phím tắt", () => {
    expect(normShortcut("/Chào Hỏi!")).toBe("chaohoi");
  });
});

describe("nhập / xuất", () => {
  it("CSV có tiêu đề + ảnh", () => {
    const rows = parseQuickImport("phim_tat,chu_de,noi_dung,anh\ngia,Báo giá,Giá 500k,https://x.com/a.jpg bad\n,,\n");
    expect(rows).toEqual([{ shortcut: "gia", topic: "Báo giá", content: "Giá 500k", attachments: ["https://x.com/a.jpg"] }]);
  });
  it("JSON mảng hoặc { items }", () => {
    expect(parseQuickImport('[{"shortcut":"A b","content":"Hi"}]')[0]).toMatchObject({ shortcut: "ab", content: "Hi" });
    expect(parseQuickImport('{"items":[{"phim_tat":"x","noi_dung":"Y","chu_de":"T"}]}')[0]).toMatchObject({ shortcut: "x", content: "Y", topic: "T" });
    expect(() => parseQuickImport("{bad")).toThrow();
  });
  it("xuất CSV rồi nhập lại", () => {
    const csv = quickToCsv([{ shortcut: "a", topic: "t1", content: "Dạ, \"chào\"\nanh", attachments: [] }], [{ key: "t1", name: "Chào hỏi", color: "blue" }]);
    expect(parseQuickImport(csv)).toEqual([{ shortcut: "a", topic: "Chào hỏi", content: 'Dạ, "chào"\nanh', attachments: [] }]);
  });
});

describe("thẻ / chủ đề", () => {
  it("làm sạch: bỏ trùng tên, màu lạ thành xám, tự sinh khoá", () => {
    expect(cleanTopics([{ name: "Khách VIP", color: "purple" }, { name: "khach vip", color: "red" }, { name: " ", color: "red" }, { name: "Hỏi giá", color: "neon", key: "BAD KEY" }])).toEqual([
      { key: "khach-vip", name: "Khách VIP", color: "purple" },
      { key: "hoi-gia", name: "Hỏi giá", color: "gray" },
    ]);
    expect(keyFromName("Hỏi giá", ["hoi-gia"])).toBe("hoi-gia-2");
  });
});
