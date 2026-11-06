// Phòng ban / đội. Hợp đồng dùng chung: Tự động hoá (giao việc xoay vòng theo đội), Phiếu hỗ trợ, KPI.
import { db, parseJson } from "../db";

export type TeamDTO = { id: string; name: string; leader: string; members: string[]; color: string };
export type TeamInput = { name: string; leader?: string; members?: string[]; color?: string };

export const TEAM_COLORS = ["#579bfc", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#0086c0", "#ff642e", "#9cd326"];

const toDTO = (t: { id: string; name: string; leader: string; membersJson: string; color: string }): TeamDTO => ({
  id: t.id,
  name: t.name,
  leader: t.leader,
  members: parseJson<string[]>(t.membersJson, []),
  color: t.color,
});

/**
 * Chuẩn hoá dữ liệu đội: cắt khoảng trắng, bỏ tên rỗng/trùng, trưởng nhóm không lặp lại trong danh sách thành viên,
 * màu phải dạng #rrggbb.
 */
export function normTeam(input: TeamInput): { name: string; leader: string; members: string[]; color: string } {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const leader = (input.leader ?? "").trim().slice(0, 120);
  const members = [...new Set((input.members ?? []).map((s) => s.trim().slice(0, 120)).filter((s) => s && s !== leader))].slice(0, 100);
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? "") ? input.color!.toLowerCase() : TEAM_COLORS[0];
  return { name, leader, members, color };
}

/** Tất cả thành viên của đội (trưởng nhóm đứng đầu), bỏ trùng. */
export const allMembers = (t: Pick<TeamDTO, "leader" | "members">) => [...new Set([...(t.leader ? [t.leader] : []), ...t.members].filter(Boolean))];

export async function listTeams(workspaceId: string): Promise<TeamDTO[]> {
  const rows = await db.team.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  return rows.map(toDTO);
}

export async function getTeam(workspaceId: string, teamId: string): Promise<TeamDTO | null> {
  const t = await db.team.findFirst({ where: { id: teamId, workspaceId } });
  return t ? toDTO(t) : null;
}

/** Thành viên của một đội (gồm cả trưởng nhóm), theo tên người. */
export async function teamMembers(workspaceId: string, teamId: string): Promise<string[]> {
  const t = await getTeam(workspaceId, teamId);
  return t ? allMembers(t) : [];
}

/** Các đội một người thuộc về. */
export async function teamsOf(workspaceId: string, name: string): Promise<TeamDTO[]> {
  return (await listTeams(workspaceId)).filter((t) => t.leader === name || t.members.includes(name));
}

/** Trưởng nhóm của các đội mà người này là thành viên (không gồm chính họ). */
export async function leadersOf(workspaceId: string, name: string): Promise<string[]> {
  return [...new Set((await teamsOf(workspaceId, name)).map((t) => t.leader).filter((l) => l && l !== name))];
}

export async function createTeam(workspaceId: string, input: TeamInput): Promise<TeamDTO | { error: string }> {
  const d = normTeam(input);
  if (!d.name) return { error: "Nhập tên đội" };
  if (await db.team.findFirst({ where: { workspaceId, name: d.name }, select: { id: true } })) return { error: `Đã có đội “${d.name}”` };
  const t = await db.team.create({ data: { workspaceId, name: d.name, leader: d.leader, membersJson: JSON.stringify(d.members), color: d.color } });
  return toDTO(t);
}

export async function updateTeam(workspaceId: string, teamId: string, input: TeamInput): Promise<TeamDTO | { error: string }> {
  const cur = await getTeam(workspaceId, teamId);
  if (!cur) return { error: "Không tìm thấy đội" };
  const d = normTeam({ ...cur, ...input });
  if (!d.name) return { error: "Nhập tên đội" };
  if (await db.team.findFirst({ where: { workspaceId, name: d.name, id: { not: teamId } }, select: { id: true } })) return { error: `Đã có đội “${d.name}”` };
  const t = await db.team.update({ where: { id: teamId }, data: { name: d.name, leader: d.leader, membersJson: JSON.stringify(d.members), color: d.color } });
  return toDTO(t);
}

/** Xoá đội: gỡ đội khỏi các phiếu hỗ trợ và xoá chỉ tiêu KPI của đội. */
export async function deleteTeam(workspaceId: string, teamId: string): Promise<TeamDTO | null> {
  const cur = await getTeam(workspaceId, teamId);
  if (!cur) return null;
  await db.ticket.updateMany({ where: { workspaceId, teamId }, data: { teamId: null } });
  await db.kpiTarget.deleteMany({ where: { workspaceId, who: `team:${teamId}` } });
  await db.team.delete({ where: { id: teamId } });
  return cur;
}

/** Tên chủ doanh nghiệp (không tự đánh giá / tính hoa hồng cho mình trừ khi ở trong đội). */
export async function ownerNames(workspaceId: string): Promise<Set<string>> {
  const ms = await db.membership.findMany({ where: { workspaceId, role: "owner" }, select: { user: { select: { name: true } } } });
  return new Set(ms.map((m) => m.user.name));
}

/**
 * Tên người đã biết trong workspace: tài khoản thành viên, đội trong cấu hình,
 * người phụ trách các mục, người xử lý phiếu và việc. Sắp theo bảng chữ cái tiếng Việt.
 */
export async function knownPeople(workspaceId: string, cfgTeam: string[] = []): Promise<string[]> {
  const [ms, owners, assignees, taskAssignees] = await Promise.all([
    db.membership.findMany({ where: { workspaceId }, select: { user: { select: { name: true } } } }),
    db.record.groupBy({ by: ["ownerName"], where: { workspaceId } }),
    db.ticket.groupBy({ by: ["assignee"], where: { workspaceId } }),
    db.task.groupBy({ by: ["assignee"], where: { workspaceId } }),
  ]);
  const names = [...ms.map((m) => m.user.name), ...cfgTeam, ...owners.map((o) => o.ownerName), ...assignees.map((a) => a.assignee), ...taskAssignees.map((t) => t.assignee)];
  return [...new Set(names.map((s) => (s ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
}
