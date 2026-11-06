// Dữ liệu mẫu Quản lý hiệu suất: đội, KPI đội, phiếu đánh giá tháng trước, quy tắc hoa hồng, phân luồng phiếu.
import { db } from "../db";
import { currentPeriod, prevPeriod, teamKey, type Metric } from "../kpi";
import { setPref } from "../prefs";
import { knownPeople, listTeams } from "./teams";
import { COMMISSION_DEFAULT, PERF_DEFAULT, ROUTING_DEFAULT, weightedTotal } from "./shared";

const hasPref = async (workspaceId: string, key: string) => !!(await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key } }, select: { key: true } }));

/** Gieo dữ liệu mẫu. Chạy lại không sinh trùng: đã có đội thì không tạo đội, ô/phiếu/cấu hình đã có thì bỏ qua. */
export async function seedPerf(workspaceId: string): Promise<void> {
  const owner = await db.membership.findFirst({ where: { workspaceId, role: "owner" }, select: { user: { select: { name: true } } } });
  const boss = owner?.user.name ?? "";

  // 1) Đội: xếp người theo số giao dịch đang phụ trách; người nhiều nhất làm trưởng nhóm Kinh doanh.
  let teams = await listTeams(workspaceId);
  if (!teams.length) {
    const people = (await knownPeople(workspaceId)).filter((p) => p !== boss);
    if (!people.length) return;
    const deals = await db.record.groupBy({ by: ["ownerName"], where: { workspaceId, objectKey: "deals" }, _count: true });
    const n = (p: string) => deals.find((d) => d.ownerName === p)?._count ?? 0;
    const s = [...people].sort((a, b) => n(b) - n(a) || a.localeCompare(b, "vi"));
    const sales = { name: "Kinh doanh", leader: s[0], members: [s[2], s[3]].filter(Boolean), color: "#00c875" };
    const care = { name: "Chăm sóc khách hàng", leader: s[1] ?? s[0], members: [s[2] ?? ""].filter((m) => m && m !== (s[1] ?? s[0])), color: "#579bfc" };
    for (const t of [sales, care]) await db.team.create({ data: { workspaceId, name: t.name, leader: t.leader, membersJson: JSON.stringify(t.members), color: t.color } });
    teams = await listTeams(workspaceId);
  }
  const salesTeam = teams.find((t) => t.name === "Kinh doanh") ?? teams[0];
  const careTeam = teams.find((t) => t.name === "Chăm sóc khách hàng") ?? teams[1] ?? teams[0];

  // 2) Chỉ tiêu KPI theo đội cho tháng này (chỉ điền ô còn trống).
  const period = currentPeriod();
  const cells: { who: string; metric: Metric; target: number }[] = [
    { who: teamKey(salesTeam.id), metric: "revenue", target: 250_000_000 },
    { who: teamKey(salesTeam.id), metric: "won_deals", target: 20 },
    { who: teamKey(careTeam.id), metric: "tickets_resolved", target: 25 },
  ];
  for (const c of cells) {
    const where = { workspaceId_period_who_metric: { workspaceId, period, who: c.who, metric: c.metric } };
    if (!(await db.kpiTarget.findUnique({ where }))) await db.kpiTarget.create({ data: { workspaceId, period, ...c } });
  }

  // 3) Cấu hình mặc định.
  if (!(await hasPref(workspaceId, "perf"))) await setPref(workspaceId, "perf", PERF_DEFAULT);
  if (!(await hasPref(workspaceId, "commission"))) await setPref(workspaceId, "commission", COMMISSION_DEFAULT);
  if (!(await hasPref(workspaceId, "ticketRouting"))) {
    const [advice, complaint, warranty, billing] = ROUTING_DEFAULT.categories;
    await setPref(workspaceId, "ticketRouting", {
      ...ROUTING_DEFAULT,
      rules: [
        { category: advice, teamId: salesTeam.id },
        { category: complaint, teamId: careTeam.id },
        { category: warranty, teamId: careTeam.id },
        { category: billing, teamId: salesTeam.id },
      ],
      defaultTeamId: careTeam.id,
    });
    // Gắn phân loại + đội cho các phiếu mẫu chưa phân loại để bộ lọc có dữ liệu.
    const plan = [complaint, advice, billing, complaint, warranty];
    const tickets = await db.ticket.findMany({ where: { workspaceId, category: "" }, orderBy: { createdAt: "asc" }, take: 20 });
    for (const [i, t] of tickets.entries()) {
      const category = plan[i % plan.length];
      await db.ticket.update({ where: { id: t.id }, data: { category, teamId: category === advice || category === billing ? salesTeam.id : careTeam.id } });
    }
  }

  // 4) Phiếu đánh giá tháng trước: 2 phiếu đã chốt, 1 phiếu nháp.
  const last = prevPeriod(period);
  const reviewer = boss || salesTeam.leader;
  const sample: { who: string; scores: Record<string, number>; comment: string; done: boolean }[] = [
    { who: salesTeam.leader, scores: { revenue: 96, win_rate: 85, csat: 90, attitude: 90, teamwork: 85 }, comment: "Dẫn dắt đội tốt, vượt chỉ tiêu doanh thu. Cần kèm thêm người mới.", done: true },
    { who: careTeam.leader, scores: { revenue: 70, win_rate: 65, csat: 100, attitude: 95, teamwork: 90 }, comment: "Khách khen nhiều, xử lý khiếu nại nhanh.", done: true },
    { who: salesTeam.members[0] ?? "", scores: { revenue: 58, win_rate: 60, csat: 80, attitude: 80 }, comment: "", done: false },
  ];
  for (const r of sample) {
    if (!r.who) continue;
    const where = { workspaceId_period_who: { workspaceId, period: last, who: r.who } };
    if (await db.perfReview.findUnique({ where })) continue;
    const total = weightedTotal(PERF_DEFAULT.criteria, r.scores);
    // Phiếu nháp chỉ lưu điểm chấm tay; phiếu đã chốt lưu bản chụp toàn bộ điểm.
    const stored = r.done ? r.scores : Object.fromEntries(Object.entries(r.scores).filter(([k]) => PERF_DEFAULT.criteria.find((c) => c.id === k)?.source === "manual"));
    await db.perfReview.create({ data: { workspaceId, period: last, who: r.who, scoresJson: JSON.stringify(stored), total, comment: r.comment, reviewer, status: r.done ? "done" : "draft" } });
  }
}
