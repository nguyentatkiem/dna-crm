import { describe, expect, it } from "vitest";
import { ASSIGN_DEFAULT, canKeepPrevious, eligibleGroups, EMPTY_CURSOR, InboxAssignSchema, normAssignPref, pickAssignee, type AssignCursor, type InboxAssignPref } from "./assign-shared";
import { businessMs, DEFAULT_HOURS, fmtDuration, hm, isWorkingTime, localParts, median, type WorkingHours } from "./hours";

const pref = (p: Partial<InboxAssignPref>): InboxAssignPref => normAssignPref({ ...ASSIGN_DEFAULT, mode: "auto", ...p });
const STAFF = ["An", "Bình", "Chi", "Dũng", "Em"];

function run(p: InboxAssignPref, n: number, opts: { online?: string[]; kind?: "inbox" | "comment"; openCounts?: Record<string, number>; staff?: string[] } = {}) {
  let cursor: AssignCursor = EMPTY_CURSOR;
  const out: string[] = [];
  const counts = { ...(opts.openCounts ?? {}) };
  for (let i = 0; i < n; i++) {
    const r = pickAssignee({ pref: p, kind: opts.kind ?? "inbox", online: opts.online ?? [], staff: opts.staff ?? STAFF, cursor, openCounts: counts });
    cursor = r.cursor;
    out.push(r.name);
    if (r.name) counts[r.name] = (counts[r.name] ?? 0) + 1;
  }
  return out;
}
const tally = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});

describe("pickAssignee — xoay vòng", () => {
  it("không có nhóm: chia lần lượt cho mọi nhân viên", () => {
    expect(run(pref({}), 7)).toEqual(["An", "Bình", "Chi", "Dũng", "Em", "An", "Bình"]);
  });

  it("chia theo tỉ lệ giữa các nhóm 2:1, rải đều (A A B)", () => {
    const p = pref({ groups: [{ id: "a", name: "A", members: ["An", "Bình"], ratio: 2 }, { id: "b", name: "B", members: ["Chi"], ratio: 1 }] });
    const r = run(p, 9);
    expect(tally(r)).toEqual({ An: 3, Bình: 3, Chi: 3 });
    // Nhóm B không bao giờ nhận hai lượt liền nhau.
    for (let i = 1; i < r.length; i++) expect(r[i] === "Chi" && r[i - 1] === "Chi").toBe(false);
  });

  it("tỉ lệ 3:1 → 75% / 25% sau 40 lượt", () => {
    const p = pref({ groups: [{ id: "a", name: "A", members: ["An"], ratio: 3 }, { id: "b", name: "B", members: ["Bình"], ratio: 1 }] });
    expect(tally(run(p, 40))).toEqual({ An: 30, Bình: 10 });
  });

  it("nhóm tỉ lệ 0 hoặc không ai hợp lệ thì bỏ qua", () => {
    const p = pref({ groups: [{ id: "a", name: "A", members: ["An"], ratio: 0 }, { id: "b", name: "B", members: ["Người lạ"], ratio: 5 }, { id: "c", name: "C", members: ["Chi"], ratio: 1 }] });
    expect(run(p, 3)).toEqual(["Chi", "Chi", "Chi"]);
  });

  it("con trỏ bền: chạy tiếp từ con trỏ đã lưu cho ra lượt kế tiếp", () => {
    const p = pref({ groups: [{ id: "a", name: "A", members: ["An", "Bình", "Chi"], ratio: 1 }] });
    const r1 = pickAssignee({ pref: p, kind: "inbox", online: [], staff: STAFF, cursor: EMPTY_CURSOR });
    const saved = JSON.parse(JSON.stringify(r1.cursor)) as AssignCursor;
    const r2 = pickAssignee({ pref: p, kind: "inbox", online: [], staff: STAFF, cursor: saved });
    expect([r1.name, r2.name]).toEqual(["An", "Bình"]);
  });

  it("perChannel: bình luận chỉ chia cho người được chọn nhận bình luận", () => {
    const p = pref({ perChannel: { inbox: [], comment: ["Dũng", "Em"] } });
    expect(run(p, 4, { kind: "comment" })).toEqual(["Dũng", "Em", "Dũng", "Em"]);
    expect(run(p, 2, { kind: "inbox" })).toEqual(["An", "Bình"]);
  });

  it("online_only: chỉ người đang trực; không ai trực → không chia", () => {
    const p = pref({ method: "online_only" });
    expect(run(p, 4, { online: ["Bình", "Em"] })).toEqual(["Bình", "Em", "Bình", "Em"]);
    expect(run(p, 2, { online: [] })).toEqual(["", ""]);
  });

  it("online_first: ưu tiên người trực, không ai trực thì vẫn chia lần lượt", () => {
    const p = pref({ method: "online_first" });
    expect(run(p, 2, { online: ["Chi"] })).toEqual(["Chi", "Chi"]);
    expect(run(p, 2, { online: [] })).toEqual(["An", "Bình"]);
  });

  it("online_first với nhóm: nhóm không ai trực thì nhường cho nhóm có người trực", () => {
    const p = pref({ method: "online_first", groups: [{ id: "a", name: "A", members: ["An"], ratio: 5 }, { id: "b", name: "B", members: ["Bình"], ratio: 1 }] });
    expect(run(p, 3, { online: ["Bình"] })).toEqual(["Bình", "Bình", "Bình"]);
  });

  it("least_open: người ít hội thoại mở nhất, hoà thì theo lượt", () => {
    const p = pref({ method: "least_open", groups: [{ id: "a", name: "A", members: ["An", "Bình", "Chi"], ratio: 1 }] });
    expect(run(p, 4, { openCounts: { An: 5, Bình: 1, Chi: 1 } })).toEqual(["Bình", "Chi", "Bình", "Chi"]);
  });

  it("exclude + requireOnline (chia lại) không chọn người cũ", () => {
    const p = pref({});
    const r = pickAssignee({ pref: p, kind: "inbox", online: ["An", "Chi"], staff: STAFF, cursor: EMPTY_CURSOR, exclude: ["An"], requireOnline: true });
    expect(r.name).toBe("Chi");
  });

  it("chỉ chia cho thành viên workspace", () => {
    expect(eligibleGroups(pref({ groups: [{ id: "a", name: "A", members: ["An", "Bot"], ratio: 1 }] }), "inbox", STAFF)[0].members).toEqual(["An"]);
  });
});

describe("giao lại người cũ", () => {
  it("cần bật keepPrevious, là nhân viên, nhận được loại hội thoại", () => {
    expect(canKeepPrevious(pref({}), "inbox", STAFF, "An", [])).toBe(true);
    expect(canKeepPrevious(pref({ keepPrevious: false }), "inbox", STAFF, "An", [])).toBe(false);
    expect(canKeepPrevious(pref({}), "inbox", STAFF, "Bot", [])).toBe(false);
    expect(canKeepPrevious(pref({ perChannel: { inbox: ["Bình"], comment: [] } }), "inbox", STAFF, "An", [])).toBe(false);
    expect(canKeepPrevious(pref({ method: "online_only" }), "inbox", STAFF, "An", [])).toBe(false);
    expect(canKeepPrevious(pref({ method: "online_only" }), "inbox", STAFF, "An", ["An"])).toBe(true);
  });
});

describe("cấu hình", () => {
  it("chuẩn hoá giá trị hỏng về mặc định an toàn", () => {
    const p = normAssignPref({ mode: "xx" as never, groups: [{ id: "", name: "", members: [" An ", "An", ""], ratio: -3 }], reassignAfterMin: 99999 });
    expect(p.mode).toBe("off");
    expect(p.groups[0]).toMatchObject({ id: "g1", members: ["An"], ratio: 0 });
    expect(p.reassignAfterMin).toBe(1440);
  });
  it("schema chấp nhận mặc định, từ chối giờ sai", () => {
    expect(InboxAssignSchema.safeParse(ASSIGN_DEFAULT).success).toBe(true);
    expect(InboxAssignSchema.safeParse({ ...ASSIGN_DEFAULT, workingHours: { tz: "Asia/Ho_Chi_Minh", days: [{ day: 1, start: "8h", end: "21:00" }] } }).success).toBe(false);
  });
});

describe("giờ làm việc", () => {
  const VN = (s: string) => Date.parse(`${s}+07:00`);
  const wh: WorkingHours = { tz: "Asia/Ho_Chi_Minh", days: [1, 2, 3, 4, 5].map((day) => ({ day, start: "08:00", end: "17:00" })) };

  it("hm đọc HH:MM", () => {
    expect(hm("08:30")).toBe(510);
    expect(hm("24:00")).toBe(1440);
    expect(hm("25:00")).toBeNull();
  });

  it("localParts theo giờ Việt Nam", () => {
    const p = localParts(VN("2026-11-06T23:30:00"), "Asia/Ho_Chi_Minh");
    expect(p).toMatchObject({ day: 5, hour: 23, dayKey: "2026-11-06" });
  });

  it("isWorkingTime: trong ca, ngoài ca, ngày nghỉ", () => {
    expect(isWorkingTime(VN("2026-11-06T09:00:00"), wh)).toBe(true); // thứ sáu
    expect(isWorkingTime(VN("2026-11-06T17:00:00"), wh)).toBe(false);
    expect(isWorkingTime(VN("2026-11-07T10:00:00"), wh)).toBe(false); // thứ bảy
    expect(isWorkingTime(VN("2026-11-07T03:00:00"), { tz: "Asia/Ho_Chi_Minh", days: [] })).toBe(true);
  });

  it("businessMs: cùng ca", () => {
    expect(businessMs(VN("2026-11-06T09:00:00"), VN("2026-11-06T09:05:00"), wh)).toBe(5 * 60e3);
  });
  it("businessMs: khách nhắn cuối ca thứ sáu, trả lời sáng thứ hai → chỉ tính trong giờ", () => {
    expect(businessMs(VN("2026-11-06T16:50:00"), VN("2026-11-09T08:05:00"), wh)).toBe(15 * 60e3);
  });
  it("businessMs: nhắn đêm, trả lời trước giờ mở cửa → 0", () => {
    expect(businessMs(VN("2026-11-05T22:00:00"), VN("2026-11-06T07:30:00"), wh)).toBe(0);
  });
  it("businessMs: nhiều ngày", () => {
    expect(businessMs(VN("2026-11-02T08:00:00"), VN("2026-11-04T08:00:00"), wh)).toBe(2 * 9 * 3600e3);
  });
  it("businessMs: không cấu hình giờ → thời gian thật", () => {
    expect(businessMs(0, 3600e3, { tz: "Asia/Ho_Chi_Minh", days: [] })).toBe(3600e3);
  });
  it("mặc định 8h–21h mọi ngày", () => {
    expect(isWorkingTime(VN("2026-11-08T20:59:00"), DEFAULT_HOURS)).toBe(true);
    expect(isWorkingTime(VN("2026-11-08T21:00:00"), DEFAULT_HOURS)).toBe(false);
  });
  it("median, fmtDuration", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(fmtDuration(75e3)).toBe("1 phút 15 giây");
    expect(fmtDuration(2 * 3600e3 + 5 * 60e3)).toBe("2 giờ 5 phút");
    expect(fmtDuration(null)).toBe("—");
  });
});
