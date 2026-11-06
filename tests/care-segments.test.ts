import type { Record as DbRecord } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { WorkspaceConfig } from "@/lib/config/schema";
import { filterRecords, parseFilters } from "@/lib/care/segments";

const cfg = {
  businessName: "Thử",
  team: ["Lan", "Minh"],
  objects: [
    {
      key: "contacts",
      label: "Khách",
      itemLabel: "Khách",
      statusLabel: "Trạng thái",
      amountLabel: "",
      statuses: [
        { key: "moi", label: "Mới", color: "blue" },
        { key: "vip", label: "VIP", color: "purple" },
      ],
      fields: [
        { key: "sdt", label: "SĐT", type: "phone", options: [] },
        { key: "hang", label: "Hạng", type: "select", options: [{ key: "bac", label: "Bạc", color: "gray" }, { key: "vang", label: "Vàng", color: "yellow" }] },
        { key: "lan_cuoi", label: "Lần ghé cuối", type: "date", options: [] },
      ],
    },
  ],
} as unknown as WorkspaceConfig;

let n = 0;
const rec = (title: string, status: string, data: Record<string, string>, ownerName = ""): DbRecord =>
  ({ id: `r${++n}`, workspaceId: "w", objectKey: "contacts", title, status, ownerName, amount: 0, score: 50, winProb: null, dataJson: JSON.stringify(data), createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02"), deletedAt: null, deletedBy: "" }) as DbRecord;

const rows = [rec("Nguyễn Lan", "vip", { hang: "Vàng", lan_cuoi: "2026-09-01" }, "Lan"), rec("Trần Hà", "moi", { hang: "Bạc", lan_cuoi: "2026-11-01" }), rec("Lê Nam", "moi", { hang: "Vàng" }, "Minh")];

describe("nhóm khách dùng đúng logic Lọc nâng cao", () => {
  it("khớp tất cả điều kiện", () => {
    const f = [
      { id: "1", field: "f:hang", op: "is" as const, value: "Vàng" },
      { id: "2", field: "status", op: "is" as const, value: "moi" },
    ];
    expect(filterRecords(cfg, "contacts", rows, f, "and").map((r) => r.title)).toEqual(["Lê Nam"]);
    expect(filterRecords(cfg, "contacts", rows, f, "or").map((r) => r.title)).toEqual(["Nguyễn Lan", "Trần Hà", "Lê Nam"]);
  });
  it("ngày trước mốc bỏ qua ô trống; tìm chữ không phân biệt dấu", () => {
    expect(filterRecords(cfg, "contacts", rows, [{ id: "1", field: "f:lan_cuoi", op: "before", value: "2026-10-15" }], "and").map((r) => r.title)).toEqual(["Nguyễn Lan"]);
    expect(filterRecords(cfg, "contacts", rows, [{ id: "1", field: "title", op: "contains", value: "nguyen" }], "and").map((r) => r.title)).toEqual(["Nguyễn Lan"]);
    expect(filterRecords(cfg, "contacts", rows, [{ id: "1", field: "owner", op: "is", value: "Minh" }], "and").map((r) => r.title)).toEqual(["Lê Nam"]);
  });
  it("không có điều kiện = cả bảng; bảng không tồn tại = rỗng", () => {
    expect(filterRecords(cfg, "contacts", rows, [], "and")).toHaveLength(3);
    expect(filterRecords(cfg, "deals", rows, [], "and")).toHaveLength(0);
  });
  it("đọc bộ lọc đã lưu, bỏ phần tử hỏng", () => {
    expect(parseFilters('[{"field":"status","op":"is","value":"vip"},null,{"x":1}]')).toEqual([{ id: "0", field: "status", op: "is", value: "vip" }]);
    expect(parseFilters("không phải json")).toEqual([]);
  });
});
