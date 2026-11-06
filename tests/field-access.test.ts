import { describe, expect, it } from "vitest";
import { accessOf, applyFieldAccess, cleanRules, dropReadonlyEdits, hiddenKeys, readonlyKeys, visibleObject, type FieldRules } from "@/lib/field-access";
import { cleanLayout, layoutSections } from "@/lib/form-layout";
import { arrangeColumns, canEditView, moveColumn, parseState, sameState } from "@/lib/views";
import { isoDate, mapToFields, maskId, type Extracted } from "@/app/api/ai/ocr/map";

const rules: FieldRules = { luong: { manager: "read", member: "hidden" }, cccd: { member: "hidden" }, nguon: { member: "read" } };
const dto = { id: "1", data: { luong: 20000000, cccd: "001234567890", nguon: "Facebook", ghi_chu: "x" } };

describe("phân quyền theo trường", () => {
  it("chủ luôn sửa được, chưa đặt = sửa", () => {
    expect(accessOf("owner", rules, "luong")).toBe("edit");
    expect(accessOf("manager", rules, "luong")).toBe("read");
    expect(accessOf("member", rules, "luong")).toBe("hidden");
    expect(accessOf("member", rules, "ghi_chu")).toBe("edit");
    expect(accessOf("member", undefined, "luong")).toBe("edit");
  });
  it("ẩn trường khỏi dữ liệu theo vai trò", () => {
    expect(applyFieldAccess(dto, "owner", rules)).toBe(dto);
    expect(applyFieldAccess(dto, "manager", rules).data).toEqual(dto.data);
    expect(applyFieldAccess(dto, "member", rules).data).toEqual({ nguon: "Facebook", ghi_chu: "x" });
    expect(dto.data.luong).toBe(20000000); // không đổi bản gốc
    expect([...hiddenKeys("member", rules)].sort()).toEqual(["cccd", "luong"]);
    expect(readonlyKeys("member", rules)).toEqual(["nguon"]);
  });
  it("bỏ ô chỉ xem / ẩn khi sửa", () => {
    const edit = { luong: 1, cccd: "9", nguon: "Zalo", ghi_chu: "y" };
    expect(dropReadonlyEdits(edit, "member", rules)).toEqual({ ghi_chu: "y" });
    expect(dropReadonlyEdits(edit, "manager", rules)).toEqual({ cccd: "9", nguon: "Zalo", ghi_chu: "y" });
    expect(dropReadonlyEdits(edit, "owner", rules)).toEqual(edit);
    expect(dropReadonlyEdits(undefined, "member", rules)).toBeUndefined();
  });
  it("bảng chỉ còn trường được thấy", () => {
    const obj = { key: "contacts", fields: [{ key: "luong" }, { key: "nguon" }, { key: "cccd" }] };
    expect(visibleObject(obj, "member", rules).fields.map((f) => f.key)).toEqual(["nguon"]);
    expect(visibleObject(obj, "owner", rules)).toBe(obj);
  });
  it("làm sạch luật: bỏ trường lạ, bỏ 'sửa', nhân viên không thoáng hơn quản lý", () => {
    expect(cleanRules({ a: { manager: "hidden", member: "read" }, b: { manager: "edit", member: "edit" }, zz: { member: "hidden" } }, ["a", "b"])).toEqual({ a: { manager: "hidden", member: "hidden" } });
  });
});

describe("bố cục hồ sơ", () => {
  const fields = [{ key: "sdt" }, { key: "email" }, { key: "nguon" }, { key: "ghi_chu" }];
  it("không có bố cục → một phần phẳng", () => {
    expect(layoutSections(fields, null)).toEqual([{ title: "", fields, collapsed: false }]);
  });
  it("chia phần, bỏ trường lạ/ẩn/trùng, phần còn lại vào Khác", () => {
    const out = layoutSections(fields, { sections: [{ title: "Liên hệ", fields: ["email", "sdt", "xoa_roi", "email"] }, { title: "Trống", fields: [] }], hidden: ["ghi_chu"] });
    expect(out.map((s) => [s.title, s.fields.map((f) => f.key)])).toEqual([
      ["Liên hệ", ["email", "sdt"]],
      ["Khác", ["nguon"]],
    ]);
  });
  it("làm sạch trước khi lưu", () => {
    expect(cleanLayout({ sections: [{ title: " ", fields: ["sdt", "sdt", "la"] }, { title: "B", fields: ["sdt", "email"], collapsed: true }], hidden: ["la", "nguon"] }, ["sdt", "email", "nguon"])).toEqual({
      sections: [
        { title: "Chưa đặt tên", fields: ["sdt"] },
        { title: "B", fields: ["email"], collapsed: true },
      ],
      hidden: ["nguon"],
    });
  });
});

describe("dạng xem đã lưu", () => {
  const cols = [
    { id: "owner", w: 96 },
    { id: "status", w: 150 },
    { id: "f:a", w: 140 },
    { id: "f:b", w: 140 },
  ];
  it("sắp cột theo thứ tự đã lưu, cột mới nằm cuối, áp độ rộng", () => {
    expect(arrangeColumns(cols, ["f:b", "owner", "khong_con"], { "f:b": 220 }).map((c) => `${c.id}:${c.w}`)).toEqual(["f:b:220", "owner:96", "status:150", "f:a:140"]);
    expect(arrangeColumns(cols)).toBe(cols);
  });
  it("kéo cột tới vị trí cột khác", () => {
    expect(moveColumn(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveColumn(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveColumn(["a", "b"], "x", "a")).toEqual(["a", "b"]);
  });
  it("đọc trạng thái hỏng không làm hỏng cả dạng xem", () => {
    expect(parseState("{oops")).toEqual({});
    expect(parseState(JSON.stringify({ view: "kanban", density: "siêu to", hidden: ["f:a"] }))).toEqual({ view: "kanban", hidden: ["f:a"] });
  });
  it("so sánh trạng thái bỏ qua khoá rỗng", () => {
    expect(sameState({ view: "table", hidden: [], q: "" }, { view: "table" })).toBe(true);
    expect(sameState({ view: "table", filters: [{ id: "1", field: "title", op: "contains", value: "a" }] }, { view: "table" })).toBe(false);
  });
  it("quyền sửa: chủ dạng xem; dạng xem chia sẻ thì thêm chủ/quản lý", () => {
    expect(canEditView({ ownerId: "u1", shared: false }, "u1", "member")).toBe(true);
    expect(canEditView({ ownerId: "u1", shared: false }, "u2", "owner")).toBe(false);
    expect(canEditView({ ownerId: "u1", shared: true }, "u2", "manager")).toBe(true);
    expect(canEditView({ ownerId: "u1", shared: true }, "u2", "member")).toBe(false);
  });
});

describe("AI OCR: ghép vào trường của bảng khách", () => {
  const x: Extracted = { kind: "id_card", name: "Nguyễn Văn An", phone: "0912 345 678", email: "", company: "Công ty ABC", title: "", address: "12 Lê Lợi, Quận 1, TP. Hồ Chí Minh", birthday: "05/03/1990", idNumber: "001 090 123456", gender: "Nam", note: "" };
  const fields = [
    { key: "sdt", label: "Số điện thoại", type: "phone", options: [] },
    { key: "ngay_sinh", label: "Ngày sinh", type: "date", options: [] },
    { key: "gioi_tinh", label: "Giới tính", type: "select", options: [{ label: "Nam" }, { label: "Nữ" }] },
    { key: "tinh", label: "Tỉnh/thành", type: "select", options: [{ label: "Hà Nội" }, { label: "Hồ Chí Minh" }] },
    { key: "dia_chi", label: "Địa chỉ", type: "text", options: [] },
  ];
  it("ghép theo kiểu và nhãn, bỏ phần không có trường (kể cả số CCCD)", () => {
    const r = mapToFields(x, fields);
    expect(r.title).toBe("Nguyễn Văn An");
    expect(Object.fromEntries(r.fields.map((f) => [f.key, f.value]))).toEqual({ sdt: "0912 345 678", ngay_sinh: "1990-03-05", gioi_tinh: "Nam", dia_chi: x.address, tinh: "Hồ Chí Minh" });
    expect(r.dropped.map((d) => d.source).sort()).toEqual(["company", "idNumber"]);
    expect(r.dropped.find((d) => d.source === "idNumber")?.value).toBe("001090123456");
  });
  it("có trường CCCD thì lưu vào đó", () => {
    const r = mapToFields(x, [...fields, { key: "so_cccd", label: "Số CCCD", type: "text", options: [] }]);
    expect(r.fields.find((f) => f.source === "idNumber")?.key).toBe("so_cccd");
  });
  it("ngày và che số giấy tờ", () => {
    expect(isoDate("1990-3-5")).toBe("1990-03-05");
    expect(isoDate("31/12/1989")).toBe("1989-12-31");
    expect(isoDate("không rõ")).toBe("");
    expect(maskId("001090123456")).toBe("••••••••3456");
  });
});
