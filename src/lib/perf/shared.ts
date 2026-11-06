// Phần thuần của Quản lý hiệu suất (dùng được cả ở trình duyệt): tiêu chí đánh giá, điểm, hoa hồng, phân luồng phiếu.

// ======================= Tiêu chí đánh giá =======================

/** Nguồn điểm: chấm tay, % hoàn thành một chỉ số KPI, hoặc điểm hài lòng (CSAT) trung bình của phiếu đã xử lý. */
export type CriterionSource = "manual" | "csat" | `kpi:${string}`;
export type Criterion = { id: string; label: string; weight: number; source: CriterionSource };
export type PerfPref = { criteria: Criterion[] };

export const PERF_DEFAULT: PerfPref = {
  criteria: [
    { id: "revenue", label: "Doanh thu theo KPI", weight: 40, source: "kpi:revenue" },
    { id: "win_rate", label: "Tỉ lệ chốt", weight: 20, source: "kpi:win_rate" },
    { id: "csat", label: "Hài lòng khách (CSAT phiếu hỗ trợ)", weight: 15, source: "csat" },
    { id: "attitude", label: "Thái độ & kỷ luật", weight: 15, source: "manual" },
    { id: "teamwork", label: "Phối hợp đội", weight: 10, source: "manual" },
  ],
};

export const SOURCE_LABEL = (s: string) => (s === "manual" ? "Chấm tay" : s === "csat" ? "Tự động: CSAT phiếu" : s.startsWith("kpi:") ? "Tự động: KPI" : s);

/** % hoàn thành KPI → điểm 0–100: trần 120% hoàn thành = 100 điểm. */
export function kpiScore(pct: number) {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round((Math.min(pct, 120) / 120) * 100);
}

/** CSAT trung bình (1–5 sao) → điểm 0–100. */
export function csatScore(avg: number) {
  if (!Number.isFinite(avg) || avg <= 0) return 0;
  return Math.round((Math.min(5, avg) / 5) * 100);
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Tổng điểm có trọng số (0–100, 1 chữ số thập phân). Tiêu chí chưa có điểm (null/undefined, ví dụ chưa đặt chỉ tiêu
 * hoặc chưa chấm tay) không tính vào mẫu số, để người chưa có chỉ tiêu không bị trừ oan.
 */
export function weightedTotal(criteria: Pick<Criterion, "id" | "weight">[], scores: Record<string, number | null | undefined>) {
  let w = 0;
  let s = 0;
  for (const c of criteria) {
    const v = scores[c.id];
    if (v === null || v === undefined || !Number.isFinite(v) || !(c.weight > 0)) continue;
    w += c.weight;
    s += c.weight * clamp100(v);
  }
  return w > 0 ? Math.round((s / w) * 10) / 10 : 0;
}

export type Rank = "excellent" | "good" | "pass" | "improve";
export const RANK_LABEL: Record<Rank, string> = { excellent: "Xuất sắc", good: "Tốt", pass: "Đạt", improve: "Cần cải thiện" };
export const RANK_TONE: Record<Rank, string> = { excellent: "badge-success", good: "badge-info", pass: "badge", improve: "badge-warning" };

/** Xếp loại: ≥ 90 Xuất sắc, ≥ 75 Tốt, ≥ 60 Đạt, còn lại Cần cải thiện. */
export function rankOf(total: number): Rank {
  return total >= 90 ? "excellent" : total >= 75 ? "good" : total >= 60 ? "pass" : "improve";
}

/** Kiểm tra bộ tiêu chí: có ít nhất 1 tiêu chí, mã không trùng, tổng trọng số > 0. Trả về thông báo lỗi hoặc "". */
export function validateCriteria(list: Criterion[]) {
  if (!list.length) return "Cần ít nhất một tiêu chí";
  const ids = new Set<string>();
  for (const c of list) {
    if (!c.label.trim()) return "Tiêu chí chưa có tên";
    if (ids.has(c.id)) return `Mã tiêu chí “${c.id}” bị trùng`;
    ids.add(c.id);
    if (!(c.weight >= 0)) return `Trọng số của “${c.label}” chưa hợp lệ`;
  }
  if (list.reduce((s, c) => s + c.weight, 0) <= 0) return "Tổng trọng số phải lớn hơn 0";
  return "";
}

// ======================= Hoa hồng =======================

export type Tier = { from: number; pct: number };
export type CommissionRules = {
  /** "paid": theo tiền đã thu trong tháng; "done": theo giá trị đơn hoàn tất trong tháng. */
  base: "paid" | "done";
  /** "progressive": lũy tiến từng phần (như thuế TNCN); "bracket": cả doanh thu nhân % của bậc đạt được. */
  mode: "progressive" | "bracket";
  tiers: Tier[];
  /** % doanh thu của thành viên đội thưởng cho trưởng nhóm. */
  teamLeaderPct: number;
};

export const COMMISSION_DEFAULT: CommissionRules = {
  base: "paid",
  mode: "progressive",
  tiers: [
    { from: 0, pct: 3 },
    { from: 50_000_000, pct: 5 },
    { from: 100_000_000, pct: 7 },
  ],
  teamLeaderPct: 1,
};

/** Bậc sắp theo mốc tăng dần, bỏ bậc lỗi, gộp mốc trùng (giữ bậc sau). */
export function normTiers(tiers: Tier[]): Tier[] {
  const m = new Map<number, number>();
  for (const t of tiers) if (Number.isFinite(t.from) && t.from >= 0 && Number.isFinite(t.pct) && t.pct >= 0) m.set(t.from, Math.min(100, t.pct));
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([from, pct]) => ({ from, pct }));
}

/**
 * Hoa hồng cho một mức doanh thu.
 * - Lũy tiến: phần doanh thu trong mỗi bậc [from_i, from_{i+1}) nhân % của bậc đó.
 * - Theo bậc: toàn bộ doanh thu nhân % của bậc cao nhất đã đạt (from ≤ doanh thu).
 * Doanh thu dưới mốc bậc đầu tiên không có hoa hồng.
 */
export function commissionFor(revenue: number, rules: Pick<CommissionRules, "mode" | "tiers">) {
  const tiers = normTiers(rules.tiers);
  if (!(revenue > 0) || !tiers.length) return 0;
  if (rules.mode === "bracket") {
    const t = [...tiers].reverse().find((x) => revenue >= x.from);
    return t ? Math.round((revenue * t.pct) / 100) : 0;
  }
  let sum = 0;
  tiers.forEach((t, i) => {
    const hi = i + 1 < tiers.length ? tiers[i + 1].from : Infinity;
    const part = Math.max(0, Math.min(revenue, hi) - t.from);
    sum += (part * t.pct) / 100;
  });
  return Math.round(sum);
}

/** Thưởng trưởng nhóm = % × tổng doanh thu của các thành viên khác trong đội. */
export function leaderBonus(memberRevenues: number[], pct: number) {
  if (!(pct > 0)) return 0;
  return Math.round((memberRevenues.reduce((s, v) => s + (v > 0 ? v : 0), 0) * pct) / 100);
}

// ======================= Phân luồng phiếu hỗ trợ =======================

export type RoutingRule = { category: string; teamId: string };
export type TicketRouting = { categories: string[]; rules: RoutingRule[]; defaultTeamId: string; autoAssign: boolean };

export const ROUTING_DEFAULT: TicketRouting = {
  categories: ["Tư vấn sản phẩm", "Khiếu nại dịch vụ", "Bảo hành – kỹ thuật", "Thanh toán – hoá đơn", "Khác"],
  rules: [],
  defaultTeamId: "",
  autoAssign: true,
};

/** Đội nhận phiếu theo phân loại: luật khớp tên phân loại (không phân biệt hoa thường), không có thì đội mặc định. */
export function routeTeam(routing: Pick<TicketRouting, "rules" | "defaultTeamId">, category: string) {
  const c = category.trim().toLowerCase();
  const hit = c ? routing.rules.find((r) => r.category.trim().toLowerCase() === c && r.teamId) : undefined;
  return hit?.teamId || routing.defaultTeamId || "";
}

/** Xoay vòng: người kế tiếp sau vị trí con trỏ. Trả về người được chọn và con trỏ mới. */
export function pickRoundRobin(members: string[], cursor: number): { name: string; next: number } {
  if (!members.length) return { name: "", next: 0 };
  const i = (((Number.isFinite(cursor) ? Math.floor(cursor) : 0) % members.length) + members.length) % members.length;
  return { name: members[i], next: (i + 1) % members.length };
}
