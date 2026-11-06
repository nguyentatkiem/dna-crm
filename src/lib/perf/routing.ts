// Phân luồng phiếu hỗ trợ theo bộ phận: phân loại → đội → người xử lý xoay vòng trong đội.
import { db, parseJson } from "../db";
import { getPref, setPref } from "../prefs";
import { teamMembers } from "./teams";
import { routingPref } from "./server";
import { pickRoundRobin, routeTeam } from "./shared";

/** Con trỏ xoay vòng theo đội, lưu riêng ở Pref "ticketRoutingCursor" để không đè cấu hình khi đang sửa. */
type Cursor = Record<string, number>;

/**
 * Người kế tiếp trong đội theo vòng (dùng chung cho phiếu hỗ trợ và nơi khác cần giao xoay vòng theo đội).
 * Đội không có thành viên thì trả "".
 */
export async function nextAssignee(workspaceId: string, teamId: string, key = "ticketRoutingCursor"): Promise<string> {
  const members = await teamMembers(workspaceId, teamId);
  if (!members.length) return "";
  const cur = await getPref<Cursor>(workspaceId, key, {});
  const { name, next } = pickRoundRobin(members, cur[teamId] ?? 0);
  // Đọc lại ngay trước khi ghi để giảm ghi đè con trỏ của đội khác.
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
  await setPref(workspaceId, key, { ...parseJson<Cursor>(row?.valueJson, {}), [teamId]: next });
  return name;
}

/**
 * Đội và người xử lý cho phiếu mới. Có teamId truyền vào thì dùng luôn (nếu tồn tại), không thì theo phân loại.
 * Chỉ chọn người khi chưa ai được giao và bật "tự giao xoay vòng".
 */
export async function routeTicket(workspaceId: string, input: { category?: string; teamId?: string | null; assignee?: string }): Promise<{ teamId: string | null; assignee: string }> {
  const routing = await routingPref(workspaceId);
  let teamId = input.teamId || routeTeam(routing, input.category ?? "");
  if (teamId && !(await db.team.findFirst({ where: { id: teamId, workspaceId }, select: { id: true } }))) teamId = "";
  let assignee = (input.assignee ?? "").trim();
  if (!assignee && teamId && routing.autoAssign) assignee = await nextAssignee(workspaceId, teamId);
  return { teamId: teamId || null, assignee };
}
