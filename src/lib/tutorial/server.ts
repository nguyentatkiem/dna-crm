// Phần server của hệ thống hướng dẫn: đọc / ghi tiến độ (Pref), số liệu cho danh sách bắt đầu, dữ liệu khởi tạo cho layout.
import { db, parseJson } from "../db";
import { getPref, setPref, COMPANY_DEFAULT, type Company } from "../prefs";
import { getSettings } from "../settings";
import { getAccess, rolesPref } from "../permissions";
import { ALL_PERMS, normalizeRolesPref, type Access } from "../roles";
import { currentPeriod } from "../kpi";
import { DEMO_PAGE_TOKEN } from "../fb/graph";
import { applyPatch, normalizeProgress, normalizeSettings, SETTINGS_KEY, tutorialKey, type Progress, type ProgressPatch, type TutorialSettings } from "./progress";
import { audienceOf, EMPTY_FACTS, evaluateChecklist, isVeteran, type Audience, type Checklist, type Facts } from "./checklist";
import type { Term, TourCtx } from "./tours";

const SAMPLE_MARK = "Dữ liệu mẫu để bạn thử hệ thống";

export async function loadProgress(workspaceId: string, userId: string): Promise<Progress> {
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: tutorialKey(userId) } } });
  return normalizeProgress(parseJson(row?.valueJson, {}));
}

export async function saveProgress(workspaceId: string, userId: string, p: Progress) {
  await setPref(workspaceId, tutorialKey(userId), p);
  return p;
}

export async function patchProgress(workspaceId: string, userId: string, patch: ProgressPatch) {
  return saveProgress(workspaceId, userId, applyPatch(await loadProgress(workspaceId, userId), patch));
}

export async function loadSettings(workspaceId: string): Promise<TutorialSettings> {
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: SETTINGS_KEY } } });
  return normalizeSettings(parseJson(row?.valueJson, {}));
}

export const tourCtxOf = (a: Access): TourCtx => ({ isOwner: a.isOwner, base: a.base, perms: a.isOwner ? new Set<string>(ALL_PERMS) : (a.actions as Set<string>) });

type Who = { workspaceId: string; userId: string; userName: string; since: Date };

/** Số liệu thật cho danh sách bắt đầu. Chỉ đếm phần của nhóm người dùng (chủ/quản lý hoặc nhân viên). */
export async function loadFacts(w: Who, audience: Audience): Promise<Facts> {
  const wid = w.workspaceId;
  const sample = db.activity.count({ where: { body: SAMPLE_MARK, record: { workspaceId: wid } } });
  if (audience === "staff") {
    const since = { gte: w.since };
    const [auditUpd, acts, calls, replies, tasks, sampleRecords] = await Promise.all([
      db.auditLog.count({ where: { workspaceId: wid, userId: w.userId, action: "record.update" } }),
      db.activity.count({ where: { author: w.userName, createdAt: since, record: { workspaceId: wid } } }),
      db.call.count({ where: { workspaceId: wid, agentName: w.userName, createdAt: since } }),
      db.message.count({ where: { direction: "out", author: w.userName, createdAt: since, conversation: { workspaceId: wid } } }).catch(() => 0),
      db.task.count({ where: { workspaceId: wid, source: w.userName, createdAt: since } }),
      sample,
    ]);
    return { ...EMPTY_FACTS, myUpdates: auditUpd + acts, myCalls: calls, myReplies: replies, myTasks: tasks, sampleRecords };
  }
  const [dna, company, ws, creates, fbPages, leads, members, invites, rolesAudit, roles, autoTouched, autoOn, sales, kpi, sampleRecords] = await Promise.all([
    db.dna.count({ where: { workspaceId: wid } }),
    getPref<Company>(wid, "company", COMPANY_DEFAULT),
    db.workspace.findUnique({ where: { id: wid }, select: { settingsJson: true } }),
    // Chỉ tính bảng khách (contacts): tạo lịch hẹn, giao dịch không phải là "thêm khách".
    db.auditLog.count({ where: { workspaceId: wid, OR: [{ action: "import", entity: "record", entityId: "contacts" }, { action: "record.create", entity: "contacts", userId: { not: "" } }] } }),
    db.fbPage.count({ where: { workspaceId: wid, active: true, token: { notIn: ["", DEMO_PAGE_TOKEN] } } }).catch(() => 0),
    db.leadEvent.count({ where: { workspaceId: wid, status: { in: ["created", "merged"] } } }),
    db.membership.count({ where: { workspaceId: wid } }),
    db.invite.count({ where: { workspaceId: wid } }),
    db.auditLog.count({ where: { workspaceId: wid, action: { in: ["role.create", "role.update", "team.create", "member.role"] } } }),
    rolesPref(wid),
    db.auditLog.count({ where: { workspaceId: wid, entity: "automation", action: { in: ["create", "update"] }, userId: { not: "" } } }),
    db.automation.count({ where: { workspaceId: wid, enabled: true } }),
    db.auditLog.count({ where: { workspaceId: wid, action: { in: ["quote.create", "order.create"] } } }),
    db.auditLog.count({ where: { workspaceId: wid, entity: "kpi", entityId: currentPeriod() } }),
    sample,
  ]);
  const s = ws ? getSettings(ws) : {};
  const channel = fbPages > 0 || leads > 0 || !!s.zalo?.accessToken || !!s.facebook?.pageToken;
  return {
    ...EMPTY_FACTS,
    dnaComplete: dna > 0 && !!company.name.trim() && !!company.phone.trim(),
    importsOrCreates: creates,
    channelConnected: channel,
    members,
    invites,
    rolesOrTeams: rolesAudit + normalizeRolesPref(roles).roles.length,
    automationsTouched: autoTouched,
    automationsEnabled: autoOn,
    salesDocs: sales,
    kpiThisMonth: kpi,
    sampleRecords,
  };
}


/** Danh sách bắt đầu của một người; tự ghi completedAt lần đầu đạt 100%. */
export async function checklistFor(o: { workspaceId: string; user: { id: string; name: string; createdAt: Date }; term: Term; access?: Access; progress?: Progress }): Promise<{ checklist: Checklist; progress: Progress }> {
  const access = o.access ?? (await getAccess(o.user.id, o.workspaceId));
  const ctx = tourCtxOf(access);
  let progress = o.progress ?? (await loadProgress(o.workspaceId, o.user.id));
  const facts = await loadFacts({ workspaceId: o.workspaceId, userId: o.user.id, userName: o.user.name, since: o.user.createdAt }, audienceOf(ctx));
  const checklist = evaluateChecklist(o.term, ctx, facts, progress);
  if (checklist.pct === 100 && !progress.completedAt) {
    progress = await saveProgress(o.workspaceId, o.user.id, { ...progress, completedAt: new Date().toISOString() });
  }
  return { checklist, progress };
}

/** Có thao tác thật nào chưa (để nhận ra người đã dùng lâu). */
async function activityCount(workspaceId: string, user: { id: string; name: string }) {
  const [a, m, c] = await Promise.all([
    db.auditLog.count({ where: { workspaceId, userId: user.id } }),
    db.message.count({ where: { direction: "out", author: user.name, conversation: { workspaceId } } }).catch(() => 0),
    db.call.count({ where: { workspaceId, agentName: user.name } }),
  ]);
  return a + m + c;
}

export type TutorialBoot = {
  userId: string;
  userName: string;
  roleName: string;
  base: Access["base"];
  isOwner: boolean;
  perms: string[];
  term: Term;
  workspace: string;
  industry: string;
  progress: Progress;
  settings: TutorialSettings;
  showWelcome: boolean;
  canTeam: boolean;
};

/** Dữ liệu khởi tạo cho layout /w (2 lần đọc Pref; chỉ đọc thêm khi chưa xem lời chào). */
export async function tutorialBoot(o: { workspaceId: string; workspace: string; industry: string; user: { id: string; name: string; createdAt: Date }; term: Term }): Promise<TutorialBoot> {
  const [access, rows] = await Promise.all([
    getAccess(o.user.id, o.workspaceId),
    db.pref.findMany({ where: { workspaceId: o.workspaceId, key: { in: [tutorialKey(o.user.id), SETTINGS_KEY] } } }),
  ]);
  let progress = normalizeProgress(parseJson(rows.find((r) => r.key !== SETTINGS_KEY)?.valueJson, {}));
  const settings = normalizeSettings(parseJson(rows.find((r) => r.key === SETTINGS_KEY)?.valueJson, {}));
  let showWelcome = false;
  if (!progress.welcomeSeen) {
    if (isVeteran(o.user.createdAt, await activityCount(o.workspaceId, o.user))) {
      // Người dùng lâu rồi: không chào, không hiện danh sách — chỉ còn menu Trợ giúp.
      progress = await saveProgress(o.workspaceId, o.user.id, { ...progress, welcomeSeen: true, checklistHidden: true });
    } else showWelcome = settings.welcomeForNewMembers;
  }
  const perms = access.isOwner ? [...ALL_PERMS] : [...access.actions];
  return {
    userId: o.user.id,
    userName: o.user.name,
    roleName: access.roleName,
    base: access.base,
    isOwner: access.isOwner,
    perms,
    term: o.term,
    workspace: o.workspace,
    industry: o.industry,
    progress,
    settings,
    showWelcome,
    canTeam: access.isOwner || access.actions.has("members_manage") || access.actions.has("perf_view_team"),
  };
}
