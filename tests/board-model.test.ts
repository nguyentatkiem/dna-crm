import { describe, expect, it } from "vitest";
import type { ObjectDef } from "@/lib/config/schema";
import type { RecordDTO } from "@/lib/records";
import { colKey, columnsOf, groupsOf, sortRows } from "@/components/board/model";

const obj = {
  key: "deals",
  label: "Giao dịch",
  itemLabel: "Giao dịch",
  description: "",
  statusLabel: "Giai đoạn",
  amountLabel: "Giá trị",
  statuses: [
    { key: "new", label: "Mới", color: "blue" },
    { key: "won", label: "Thắng", color: "green" },
  ],
  fields: [
    { key: "kenh", label: "Kênh", type: "select", options: [{ key: "fb", label: "Facebook", color: "blue" }, { key: "zalo", label: "Zalo", color: "green" }] },
    { key: "so", label: "Số lượng", type: "number", options: [] },
  ],
} as unknown as ObjectDef;

const rec = (id: string, p: Partial<RecordDTO>): RecordDTO =>
  ({ id, objectKey: "deals", title: id, status: "new", ownerName: "", amount: 0, score: 0, winProb: null, data: {}, updates: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...p }) as RecordDTO;

describe("sắp xếp theo cột", () => {
  const rows = [rec("b", { amount: 5, data: { so: "10" } }), rec("a", { amount: 20, data: { so: 2 } }), rec("c", { amount: 1, data: {} })];

  it("sắp số tăng/giảm, ô trống luôn ở cuối", () => {
    expect(sortRows(rows, { col: "f:so", dir: "asc" }, obj).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, { col: "f:so", dir: "desc" }, obj).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortRows(rows, { col: "amount", dir: "desc" }, obj).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("sắp chữ theo tiếng Việt", () => {
    const r = [rec("x", { title: "Đức" }), rec("y", { title: "An" }), rec("z", { title: "Dũng" })];
    expect(sortRows(r, { col: "title", dir: "asc" }, obj).map((x) => x.title)).toEqual(["An", "Dũng", "Đức"]);
  });

  it("khoá cột khớp khoá bộ lọc", () => {
    const keys = columnsOf(obj).map(colKey);
    expect(keys).toContain("f:kenh");
    expect(keys).toContain("owner");
    expect(keys).toContain("updatedAt");
  });
});

describe("nhóm theo trường lựa chọn", () => {
  it("mỗi lựa chọn một nhóm, thêm nhóm 'chưa có'", () => {
    const rows = [rec("1", { data: { kenh: "Zalo" } }), rec("2", { data: {} }), rec("3", { data: { kenh: "Facebook" } })];
    const gs = groupsOf(obj, [], rows, "f:kenh", () => "#000");
    expect(gs.map((g) => g.label)).toEqual(["Facebook", "Zalo", "Chưa có kênh"]);
    expect(gs.map((g) => rows.filter(g.match).map((r) => r.id))).toEqual([["3"], ["1"], ["2"]]);
    expect(gs[1].field).toEqual({ key: "kenh", value: "Zalo" });
  });

  it("trường không tồn tại thì quay về nhóm theo trạng thái", () => {
    expect(groupsOf(obj, [], [], "f:khong_co", () => "#000").map((g) => g.key)).toEqual(["new", "won"]);
  });
});
