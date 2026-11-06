// Quyền xem số liệu hiệu suất — MỘT chỗ duy nhất cho toàn mô-đun /w/perf (trang + API).
// Dựa trên phân quyền theo vai trò: perf_view_team (xem người khác, trong phạm vi dữ liệu của vai trò), perf_review,
// perf_manage_rules, perf_view_commission.
import { accessOf, allow, can, visibleOwners, type Role } from "../permissions";
import { allMembers, listTeams, type TeamDTO } from "./teams";

export type PerfScope = "all" | "team" | "self";

export type PerfAccess = {
  me: string;
  role: Role;
  /** all: chủ/quản lý thấy mọi người · team: trưởng nhóm thấy đội mình · self: nhân viên chỉ thấy mình. */
  scope: PerfScope;
  canSeeAll: boolean;
  /** Chấm/chốt đánh giá (giữ như trang Đánh giá hiện có: chủ + quản lý). */
  canReview: boolean;
  /** Sửa cấu hình (trọng số điểm hiệu suất, tiêu chí): chủ. */
  canConfigure: boolean;
  teams: TeamDTO[];
  /** Đội người dùng làm trưởng nhóm. */
  ledTeams: TeamDTO[];
  canSeePerson: (name: string) => boolean;
  /** Đội (theo id hoặc tên) có được xem tổng hợp không. */
  canSeeTeam: (idOrName: string) => boolean;
  canSeeCommissionOf: (name: string) => boolean;
  /** Lọc danh sách tên theo quyền xem. */
  visible: (names: string[]) => string[];
};

/** Thuần: dựng quyền từ vai trò + danh sách đội (để kiểm thử không cần DB). */
export type PerfFlags = { viewOthers: boolean; scopeNames: string[] | null; review: boolean; configure: boolean; commissionOthers: boolean };

export function buildAccess(me: string, role: Role, teams: TeamDTO[], flags?: PerfFlags): PerfAccess {
  const f: PerfFlags = flags ?? { viewOthers: can(role, "see_all"), scopeNames: null, review: can(role, "see_all"), configure: can(role, "manage_settings"), commissionOthers: can(role, "see_all") };
  // Xem tất cả khi có quyền xem người khác và phạm vi dữ liệu là toàn bộ; phạm vi "đội" thì chỉ người trong đội.
  const canSeeAll = f.viewOthers && !f.scopeNames;
  const inScope = new Set(f.viewOthers ? (f.scopeNames ?? []) : []);
  const ledTeams = teams.filter((t) => t.leader && t.leader === me);
  const led = new Set(ledTeams.flatMap(allMembers));
  const canSeePerson = (name: string) => canSeeAll || name === me || led.has(name) || inScope.has(name);
  return {
    me,
    role,
    scope: canSeeAll ? "all" : ledTeams.length || inScope.size ? "team" : "self",
    canSeeAll,
    canReview: f.review,
    canConfigure: f.configure,
    teams,
    ledTeams,
    canSeePerson,
    canSeeTeam: (k) => canSeeAll || ledTeams.some((t) => t.id === k || t.name === k),
    // Hoa hồng là thu nhập cá nhân: trưởng nhóm cũng không xem của thành viên.
    canSeeCommissionOf: (name) => name === me || (f.commissionOthers && canSeePerson(name)),
    visible: (names) => names.filter(canSeePerson),
  };
}

export async function perfAccess(ctx: { user: { id: string; name: string }; workspace: { id: string } }, teams?: TeamDTO[]): Promise<PerfAccess> {
  const [acc, ts] = await Promise.all([accessOf(ctx), teams ? Promise.resolve(teams) : listTeams(ctx.workspace.id)]);
  return buildAccess(ctx.user.name, acc.base, ts, {
    viewOthers: allow(acc, "perf_view_team"),
    scopeNames: visibleOwners(acc),
    review: allow(acc, "perf_review"),
    configure: allow(acc, "perf_manage_rules"),
    commissionOthers: allow(acc, "perf_view_commission"),
  });
}
