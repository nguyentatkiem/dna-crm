import { describe, expect, it } from "vitest";
import { allowedFor, buildTours, introTourFor, lowerTerm, MAIN_TOUR, nextIndex, onPath, resolveSteps, stepTarget, toursFor, type TourCtx } from "@/lib/tutorial/tours";
import { audienceOf, CHECKLIST_IDS, EMPTY_FACTS, evaluateChecklist, isVeteran, VISIT_IDS } from "@/lib/tutorial/checklist";
import { applyPatch, EMPTY_PROGRESS, normalizeProgress, normalizeSettings } from "@/lib/tutorial/progress";
import { ProgressPatchSchema as ProgressPatch } from "@/lib/tutorial/schema";
import { ALL_PERMS, DEFAULT_ACTIONS } from "@/lib/roles";

const term = { contact: "Học viên", deal: "Đăng ký", appointment: "Buổi học" };
const owner: TourCtx = { isOwner: true, base: "owner", perms: new Set(ALL_PERMS) };
const manager: TourCtx = { isOwner: false, base: "manager", perms: new Set(DEFAULT_ACTIONS.manager) };
const member: TourCtx = { isOwner: false, base: "member", perms: new Set(DEFAULT_ACTIONS.member) };

const main = (ctx: TourCtx) => toursFor(term, ctx).find((t) => t.id === MAIN_TOUR)!;
const ids = (ctx: TourCtx) => main(ctx).steps.map((s) => s.id);

describe("tour: lọc theo vai trò / quyền", () => {
  it("tour làm quen của chủ có kết nối kênh, mời đội; không có bước dành cho nhân viên", () => {
    const s = ids(owner);
    expect(s).toEqual(expect.arrayContaining(["nav", "search", "board-lead", "my-work", "inbox", "channels", "team", "copilot", "bell", "help"]));
    expect(s).not.toContain("call");
    expect(s).not.toContain("inbox-staff");
    expect(s.length).toBeGreaterThanOrEqual(8);
    expect(s.length).toBeLessThanOrEqual(12);
  });

  it("nhân viên: Việc của tôi, Nhận hội thoại, gọi điện — không có cài đặt", () => {
    const s = ids(member);
    expect(s).toEqual(expect.arrayContaining(["my-work", "inbox-staff", "call", "board"]));
    expect(s).not.toContain("channels");
    expect(s).not.toContain("team");
    expect(s).not.toContain("board-lead");
  });

  it("quản lý không có bước chỉ dành cho chủ (mời thành viên, kết nối)", () => {
    const s = ids(manager);
    expect(s).toContain("board-lead");
    expect(s).not.toContain("team");
    expect(s).not.toContain("channels");
  });

  it("tour Vai trò & quyền chỉ cho người có quyền", () => {
    expect(toursFor(term, owner).map((t) => t.id)).toContain("vai-tro");
    expect(toursFor(term, member).map((t) => t.id)).not.toContain("vai-tro");
    // Quản lý có quyền phòng ban (teams_manage) nhưng không quản lý vai trò → chỉ còn bước Phòng ban.
    const v = toursFor(term, manager).find((t) => t.id === "vai-tro")!;
    expect(v.steps.map((s) => s.id)).toEqual(["teams"]);
  });

  it("vai trò tự tạo theo quyền thật: thêm quyền xuất → có bước Xuất Excel", () => {
    const custom: TourCtx = { isOwner: false, base: "member", perms: new Set([...DEFAULT_ACTIONS.member, "record_export"]) };
    const bang = (c: TourCtx) => toursFor(term, c).find((t) => t.id === "bang")!.steps.map((s) => s.id);
    expect(bang(custom)).toContain("export");
    expect(bang(member)).not.toContain("export");
  });

  it("allowedFor: chủ luôn qua quyền, nhưng vẫn theo danh sách vai trò", () => {
    expect(allowedFor(owner, { perm: "roles_manage" })).toBe(true);
    expect(allowedFor(owner, { roles: ["member"] })).toBe(false);
    expect(allowedFor(member, { perm: ["roles_manage", "record_edit_others"] })).toBe(true);
    expect(allowedFor(member, { perm: "roles_manage" })).toBe(false);
  });

  it("mỗi tour tính năng có 4–7 bước với chủ, id bước không trùng, chữ theo thuật ngữ ngành", () => {
    for (const t of buildTours(term)) {
      const steps = resolveSteps(t, owner);
      if (t.id !== MAIN_TOUR) {
        expect(steps.length).toBeGreaterThanOrEqual(4);
        expect(steps.length).toBeLessThanOrEqual(7);
      }
      expect(new Set(t.steps.map((s) => s.id)).size).toBe(t.steps.length);
    }
    expect(JSON.stringify(buildTours(term))).toContain("học viên");
  });
});

describe("tour: giải quyết bước", () => {
  const step = { id: "x", title: "", body: "", target: "nav", mobileTarget: "mobile-nav" };
  it("chọn phần tử theo cỡ màn hình", () => {
    expect(stepTarget(step, false)).toBe("nav");
    expect(stepTarget(step, true)).toBe("mobile-nav");
    expect(stepTarget({ ...step, mobileTarget: "center" }, true)).toBeNull();
    expect(stepTarget({ id: "c", title: "", body: "" }, false)).toBeNull();
  });

  it("onPath khớp nguyên đường dẫn, bỏ query", () => {
    expect(onPath("/w/b/contacts", "/w/b/contacts?v=1")).toBe(true);
    expect(onPath("/w/b/contacts/", "/w/b/contacts")).toBe(true);
    expect(onPath("/w/b/deals", "/w/b/contacts")).toBe(false);
    expect(onPath("/w/anything", undefined)).toBe(true);
  });

  it("nextIndex bỏ qua bước không tìm thấy, theo cả hai chiều", () => {
    const steps = ["a", "b", "c", "d"].map((id) => ({ id, title: "", body: "" }));
    expect(nextIndex(steps, 0, 1)).toBe(1);
    expect(nextIndex(steps, 0, 1, new Set(["b", "c"]))).toBe(3);
    expect(nextIndex(steps, 3, -1, new Set(["c"]))).toBe(1);
    expect(nextIndex(steps, 3, 1)).toBe(-1);
    expect(nextIndex(steps, 0, -1)).toBe(-1);
  });

  it("introTourFor: gợi ý đúng trang", () => {
    const tours = buildTours(term);
    expect(introTourFor("/w/b/contacts", tours)).toBe("bang");
    expect(introTourFor("/w/b/", tours)).toBeNull();
    expect(introTourFor("/w/inbox", tours)).toBe("hop-thu");
    expect(introTourFor("/w/inbox/stats", tours)).toBeNull();
    expect(introTourFor("/w/settings/roles", tours)).toBe("vai-tro");
    expect(introTourFor("/w", tours)).toBeNull();
  });
});

describe("danh sách bắt đầu", () => {
  const flat = (c: ReturnType<typeof evaluateChecklist>) => c.groups.flatMap((g) => g.items);

  it("chủ: chưa làm gì → 0%, đủ mục thiết lập", () => {
    const c = evaluateChecklist(term, owner, EMPTY_FACTS, EMPTY_PROGRESS);
    expect(c.audience).toBe("lead");
    expect(flat(c).map((i) => i.id)).toEqual(["dna", "import", "channel", "invite", "roles", "kpi", "automation", "sales", "perf"]);
    expect(c.done).toBe(0);
    expect(c.pct).toBe(0);
    expect(flat(c).find((i) => i.id === "import")!.title).toBe("Thêm hoặc nhập học viên thật");
  });

  it("tự phát hiện từ số liệu thật", () => {
    const facts = { ...EMPTY_FACTS, dnaComplete: true, importsOrCreates: 3, members: 2, rolesOrTeams: 1, automationsTouched: 1, automationsEnabled: 2, salesDocs: 1, kpiThisMonth: 1, channelConnected: true };
    const c = evaluateChecklist(term, owner, facts, { ...EMPTY_PROGRESS, visited: { "perf-overview": true } });
    expect(c.pct).toBe(100);
    expect(flat(c).every((i) => i.via === "auto")).toBe(true);
  });

  it("tự động hoá phải do người dùng chạm vào và đang bật (luật mẫu không tính)", () => {
    const get = (f: Partial<typeof EMPTY_FACTS>) => flat(evaluateChecklist(term, owner, { ...EMPTY_FACTS, ...f }, EMPTY_PROGRESS)).find((i) => i.id === "automation")!.done;
    expect(get({ automationsEnabled: 5 })).toBe(false);
    expect(get({ automationsEnabled: 5, automationsTouched: 1 })).toBe(true);
    expect(get({ automationsEnabled: 0, automationsTouched: 1 })).toBe(false);
  });

  it("mời thành viên: đã có người thứ hai hoặc đã tạo link mời", () => {
    const get = (f: Partial<typeof EMPTY_FACTS>) => flat(evaluateChecklist(term, owner, { ...EMPTY_FACTS, ...f }, EMPTY_PROGRESS)).find((i) => i.id === "invite")!.done;
    expect(get({ members: 1 })).toBe(false);
    expect(get({ members: 2 })).toBe(true);
    expect(get({ invites: 1 })).toBe(true);
  });

  it("đánh dấu tay chỉ có tác dụng với mục cho phép", () => {
    const p = { ...EMPTY_PROGRESS, manual: { channel: true as const, sales: true as const } };
    const items = flat(evaluateChecklist(term, owner, EMPTY_FACTS, p));
    expect(items.find((i) => i.id === "channel")).toMatchObject({ done: true, via: "manual" });
    expect(items.find((i) => i.id === "sales")).toMatchObject({ done: false, via: null });
  });

  it("quản lý không thấy mục chỉ chủ làm được (mời thành viên)", () => {
    const items = flat(evaluateChecklist(term, manager, EMPTY_FACTS, EMPTY_PROGRESS)).map((i) => i.id);
    expect(items).not.toContain("invite");
    expect(items).toContain("kpi");
  });

  it("nhân viên: mục cá nhân, tour làm quen", () => {
    const c0 = evaluateChecklist(term, member, EMPTY_FACTS, EMPTY_PROGRESS);
    expect(c0.audience).toBe("staff");
    expect(flat(c0).map((i) => i.id)).toEqual(["tour", "my-work", "update", "call", "reply", "task"]);
    const c1 = evaluateChecklist(term, member, { ...EMPTY_FACTS, myUpdates: 1, myCalls: 2, myReplies: 1, myTasks: 1 }, { ...EMPTY_PROGRESS, tours: { [MAIN_TOUR]: "done" }, visited: { "my-work": true } });
    expect(c1.pct).toBe(100);
    const c2 = evaluateChecklist(term, member, EMPTY_FACTS, { ...EMPTY_PROGRESS, tours: { [MAIN_TOUR]: "skipped" } });
    expect(flat(c2).find((i) => i.id === "tour")!.done).toBe(false);
  });

  it("audience theo vai trò gốc; mọi id mục đều hợp lệ cho PATCH", () => {
    expect(audienceOf(owner)).toBe("lead");
    expect(audienceOf(manager)).toBe("lead");
    expect(audienceOf(member)).toBe("staff");
    for (const id of CHECKLIST_IDS) expect(ProgressPatch.safeParse({ manual: { id, done: true } }).success).toBe(true);
  });

  it("isVeteran: hơn 7 ngày và có thao tác", () => {
    const now = new Date("2026-11-07T00:00:00Z");
    expect(isVeteran(new Date("2026-10-01"), 5, now)).toBe(true);
    expect(isVeteran(new Date("2026-10-01"), 0, now)).toBe(false);
    expect(isVeteran(new Date("2026-11-03"), 50, now)).toBe(false);
  });
});

describe("tiến độ", () => {
  it("normalize bỏ giá trị lạ", () => {
    const p = normalizeProgress({ welcomeSeen: true, tours: { "lam-quen": "done", bad: "x", "Sai Id": "done" }, manual: { dna: true, x: 1 }, completedAt: "not a date" });
    expect(p.tours).toEqual({ "lam-quen": "done" });
    expect(p.manual).toEqual({ dna: true });
    expect(p.completedAt).toBeNull();
    expect(normalizeProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(normalizeSettings({ showChecklist: false })).toEqual({ welcomeForNewMembers: true, showChecklist: false });
  });

  it("applyPatch: bỏ qua không đè lên đã xong; reset xoá hết", () => {
    let p = applyPatch(EMPTY_PROGRESS, { tour: { id: "bang", status: "done" } });
    p = applyPatch(p, { tour: { id: "bang", status: "skipped" } });
    expect(p.tours.bang).toBe("done");
    p = applyPatch(p, { manual: { id: "dna", done: true }, hint: "bang", visit: "my-work", welcomeSeen: true });
    expect(p).toMatchObject({ manual: { dna: true }, hints: { bang: true }, visited: { "my-work": true }, welcomeSeen: true });
    p = applyPatch(p, { manual: { id: "dna", done: false } });
    expect(p.manual).toEqual({});
    const r = applyPatch(p, { reset: true });
    expect(r).toEqual(EMPTY_PROGRESS);
    expect(EMPTY_PROGRESS.tours).toEqual({});
  });

  it("schema PATCH từ chối khoá lạ", () => {
    expect(ProgressPatch.safeParse({ userId: "x" }).success).toBe(false);
    expect(ProgressPatch.safeParse({ tour: { id: "bang", status: "done" } }).success).toBe(true);
    expect(ProgressPatch.safeParse({ tour: { id: "../x", status: "done" } }).success).toBe(false);
  });
});

describe("tour: lời theo quyền và thuật ngữ", () => {
  const steps = (ctx: TourCtx, id: string) => toursFor(term, ctx).find((t) => t.id === id)!.steps.map((s) => s.id);
  it("nhân viên chỉ xem: bước hiệu suất / tự động hoá nói về chính mình, không có lời dành cho quản lý", () => {
    expect(steps(member, "hieu-suat")).toEqual(expect.arrayContaining(["board-me", "person-me"]));
    expect(steps(member, "hieu-suat")).not.toContain("person");
    expect(steps(member, "tu-dong")).toContain("library-view");
    expect(steps(member, "tu-dong")).not.toContain("library");
    expect(steps(owner, "hieu-suat")).not.toContain("board-me");
    expect(steps(owner, "tu-dong")).not.toContain("library-view");
    expect(allowedFor(owner, { unlessPerm: "kpi_set" })).toBe(false);
  });
  it("viết thường thuật ngữ nhưng giữ chữ viết tắt", () => {
    expect(lowerTerm("Khách hàng DN")).toBe("khách hàng DN");
    expect(lowerTerm("Học viên")).toBe("học viên");
    const t = toursFor({ contact: "Khách hàng DN", deal: "Cơ hội", appointment: "Lịch gặp" }, owner);
    expect(JSON.stringify(t)).not.toContain("khách hàng dn");
  });
  it("trang được ghi nhận đã ghé chỉ gồm các trang có trong danh sách", () => {
    expect([...VISIT_IDS].sort()).toEqual(["my-work", "perf-overview"]);
  });
});
