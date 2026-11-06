import { describe, expect, it } from "vitest";
import {
  ALL_PERMS,
  DEFAULT_ACTIONS,
  GRANTABLE,
  OWNER_ONLY,
  actionDiff,
  allow,
  cleanActions,
  normalizeRolesPref,
  ownerVisible,
  ownerWhere,
  permissionMatrix,
  resolveAccess,
  roleDefs,
  roleKeyFrom,
  visibleOwners,
  type RolesPref,
} from "@/lib/roles";
import { can, LEGACY_MAP, type Action } from "@/lib/permissions";

const user = { id: "u1", name: "Thu Trang" };
const ketoan: RolesPref = {
  roles: [{ key: "r_ke_toan", name: "Kế toán", color: "#00c875", base: "member", actions: ["payment_record", "debt_view", "sales_view_all", "record_export", "roles_manage", "khong_ton_tai"], scope: "own", unassigned: false }],
};
const teams = [
  { leader: "Lan", members: ["Thu Trang", "Minh"] },
  { leader: "Hùng", members: ["Quân"] },
];

describe("vai trò có sẵn", () => {
  it("chủ có mọi quyền, kể cả quyền chỉ-chủ, phạm vi toàn bộ", () => {
    const a = resolveAccess({ roleKey: "owner", user });
    expect(a.isOwner).toBe(true);
    expect(a.scope).toBe("all");
    for (const p of ALL_PERMS) expect(allow(a, p)).toBe(true);
  });
  it("mặc định quản lý / nhân viên giữ đúng hành vi cũ", () => {
    const m = resolveAccess({ roleKey: "manager", user });
    const e = resolveAccess({ roleKey: "member", user });
    // Hành vi cũ của 9 quyền: so với can(role, action).
    for (const [old, perm] of Object.entries(LEGACY_MAP) as [Action, (typeof LEGACY_MAP)[Action]][]) {
      if (old === "see_all") continue;
      expect(allow(m, perm), `manager ${old}`).toBe(old === "review_calls" ? true : can("manager", old));
      expect(allow(e, perm), `member ${old}`).toBe(can("member", old));
    }
    expect(m.scope).toBe("all");
    expect(e.scope).toBe("all");
    // Nhân viên vẫn tạo báo giá, thu tiền, sửa khách như trước.
    for (const p of ["sales_create", "payment_record", "record_edit_others", "record_assign", "ticket_close", "order_edit"] as const) expect(allow(e, p)).toBe(true);
    for (const p of ["record_delete", "record_export", "quote_approve", "sales_edit_others", "product_manage"] as const) expect(allow(e, p)).toBe(false);
  });
  it("quyền chỉ-chủ không bao giờ cấp cho vai trò khác", () => {
    expect(OWNER_ONLY.has("roles_manage")).toBe(true);
    expect(GRANTABLE).not.toContain("members_manage");
    const m = resolveAccess({ roleKey: "manager", pref: { overrides: { manager: { actions: ["roles_manage", "members_manage", "backup_manage", "record_delete"] } } }, user });
    expect(allow(m, "roles_manage")).toBe(false);
    expect(allow(m, "members_manage")).toBe(false);
    expect(allow(m, "backup_manage")).toBe(false);
    expect(allow(m, "record_delete")).toBe(true);
    for (const k of ["manager", "member"] as const) for (const p of DEFAULT_ACTIONS[k]) expect(OWNER_ONLY.has(p)).toBe(false);
  });
  it("chỉnh sửa quản lý: bỏ quyền xoá", () => {
    const pref: RolesPref = { overrides: { manager: { actions: DEFAULT_ACTIONS.manager.filter((p) => p !== "record_delete") } } };
    expect(allow(resolveAccess({ roleKey: "manager", pref, user }), "record_delete")).toBe(false);
    expect(allow(resolveAccess({ roleKey: "manager", pref, user }), "record_export")).toBe(true);
  });
});

describe("tương thích cài đặt cũ memberSeesOwnOnly", () => {
  it("bật → nhân viên chỉ thấy của mình; tắt → toàn bộ; quản lý luôn toàn bộ", () => {
    expect(resolveAccess({ roleKey: "member", legacyOwnOnly: true, user }).scope).toBe("own");
    expect(resolveAccess({ roleKey: "member", legacyOwnOnly: false, user }).scope).toBe("all");
    expect(resolveAccess({ roleKey: "manager", legacyOwnOnly: true, user }).scope).toBe("all");
  });
  it("chỉnh sửa trong Pref roles thắng cài đặt cũ", () => {
    expect(resolveAccess({ roleKey: "member", legacyOwnOnly: true, pref: { overrides: { member: { scope: "team" } } }, user }).scope).toBe("team");
    expect(resolveAccess({ roleKey: "member", legacyOwnOnly: false, pref: { overrides: { member: { scope: "own" } } }, user }).scope).toBe("own");
  });
  it("mặc định phạm vi riêng vẫn thấy mục chưa giao (như trước)", () => {
    const a = resolveAccess({ roleKey: "member", legacyOwnOnly: true, user });
    expect(a.unassigned).toBe(true);
    expect(ownerWhere(a, "ownerName")).toEqual({ OR: [{ ownerName: "Thu Trang" }, { ownerName: "" }] });
  });
});

describe("vai trò tự tạo", () => {
  it("Kế toán: thu tiền, xem công nợ, không xoá khách; bỏ quyền lạ và quyền chỉ-chủ", () => {
    const a = resolveAccess({ roleKey: "r_ke_toan", pref: ketoan, user });
    expect(a.known).toBe(true);
    expect(a.roleName).toBe("Kế toán");
    expect(a.base).toBe("member");
    expect(allow(a, "payment_record")).toBe(true);
    expect(allow(a, "debt_view")).toBe(true);
    expect(allow(a, "sales_view_all")).toBe(true);
    expect(allow(a, "record_delete")).toBe(false);
    expect(allow(a, "roles_manage")).toBe(false);
    expect([...a.actions]).not.toContain("khong_ton_tai");
    expect(a.scope).toBe("own");
    expect(ownerWhere(a, "ownerName")).toEqual({ OR: [{ ownerName: "Thu Trang" }] });
  });
  it("vai trò lạ / đã xoá → quyền tối thiểu, không thấy mục chưa giao", () => {
    const a = resolveAccess({ roleKey: "r_da_xoa", pref: ketoan, user });
    expect(a.known).toBe(false);
    expect(a.actions.size).toBe(0);
    expect(a.scope).toBe("own");
    expect(a.unassigned).toBe(false);
    expect(a.base).toBe("member");
    expect(allow(a, "sales_create")).toBe(false);
    expect(resolveAccess({ roleKey: null, user }).actions.size).toBe(0);
  });
  it("Pref hỏng không làm sập: bỏ vai trò sai khoá / trùng khoá", () => {
    const p = normalizeRolesPref({ roles: [{ key: "owner", name: "x" }, { key: "r_a", name: "A" }, { key: "r_a", name: "A2" }, "rác", null], overrides: { member: { scope: "lung tung" } } });
    expect(p.roles.map((r) => r.key)).toEqual(["r_a"]);
    expect(p.roles[0].scope).toBe("own");
    expect(p.overrides.member).toBeUndefined();
    expect(normalizeRolesPref(null).roles).toEqual([]);
  });
  it("danh sách vai trò: Chủ, Quản lý, Nhân viên rồi vai trò tự tạo", () => {
    expect(roleDefs(ketoan).map((d) => d.key)).toEqual(["owner", "manager", "member", "r_ke_toan"]);
  });
});

describe("phạm vi dữ liệu", () => {
  it("team: mình + mọi người cùng đội (cả trưởng nhóm), không gồm đội khác", () => {
    const a = resolveAccess({ roleKey: "member", pref: { overrides: { member: { scope: "team" } } }, user, teams });
    expect(new Set(visibleOwners(a))).toEqual(new Set(["Thu Trang", "Lan", "Minh"]));
    expect(ownerVisible(a, "Minh")).toBe(true);
    expect(ownerVisible(a, "Quân")).toBe(false);
    expect(ownerVisible(a, "")).toBe(true);
    const w = ownerWhere(a, "ownerName")!;
    expect(w.OR[0]).toEqual({ ownerName: { in: expect.arrayContaining(["Thu Trang", "Lan", "Minh"]) } });
    expect(w.OR[1]).toEqual({ ownerName: "" });
  });
  it("trưởng nhóm thấy thành viên đội mình", () => {
    const a = resolveAccess({ roleKey: "member", pref: { overrides: { member: { scope: "team" } } }, user: { id: "u2", name: "Hùng" }, teams });
    expect(new Set(visibleOwners(a))).toEqual(new Set(["Hùng", "Quân"]));
  });
  it("người không thuộc đội nào với phạm vi team = chỉ của mình", () => {
    const a = resolveAccess({ roleKey: "member", pref: { overrides: { member: { scope: "team" } } }, user: { id: "u3", name: "Lẻ" }, teams });
    expect(visibleOwners(a)).toEqual(["Lẻ"]);
  });
  it("all: không lọc", () => {
    const a = resolveAccess({ roleKey: "manager", user, teams });
    expect(visibleOwners(a)).toBeNull();
    expect(ownerWhere(a, "ownerName")).toBeNull();
    expect(ownerVisible(a, "Quân")).toBe(true);
  });
  it("own không gồm mục chưa giao khi tắt", () => {
    const a = resolveAccess({ roleKey: "member", pref: { overrides: { member: { scope: "own", unassigned: false } } }, user });
    expect(ownerVisible(a, "")).toBe(false);
    expect(ownerWhere(a, "assignee")).toEqual({ OR: [{ assignee: "Thu Trang" }] });
  });
});

describe("tiện ích", () => {
  it("khoá vai trò từ tên tiếng Việt, không trùng", () => {
    expect(roleKeyFrom("Kế toán", [])).toBe("r_ke_toan");
    expect(roleKeyFrom("Trưởng nhóm sale", [])).toBe("r_truong_nhom_sale");
    expect(roleKeyFrom("Kế toán", ["r_ke_toan"])).toBe("r_ke_toan_2");
    expect(roleKeyFrom("Đội CSKH", [])).toBe("r_doi_cskh");
    expect(roleKeyFrom("!!!", [])).toBe("r_vai_tro");
  });
  it("cleanActions giữ thứ tự danh mục, bỏ trùng và quyền chỉ-chủ", () => {
    expect(cleanActions(["debt_view", "record_delete", "debt_view", "roles_manage", "x"])).toEqual(["record_delete", "debt_view"]);
  });
  it("actionDiff cho nhật ký", () => {
    expect(actionDiff(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
  });
  it("ma trận quyền: chủ luôn ✓, quyền chỉ-chủ chỉ chủ ✓", () => {
    const m = permissionMatrix(roleDefs(ketoan));
    const flat = m.flatMap((g) => g.actions);
    expect(flat.every((x) => x.roles.owner)).toBe(true);
    const roles = flat.find((x) => x.key === "roles_manage")!;
    expect(roles.roles.manager).toBe(false);
    expect(flat.find((x) => x.key === "payment_record")!.roles.r_ke_toan).toBe(true);
    expect(flat.find((x) => x.key === "record_delete")!.roles.r_ke_toan).toBe(false);
  });
});
