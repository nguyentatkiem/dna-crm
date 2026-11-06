// Đánh giá nhân viên theo kỳ: điểm tự động từ KPI/CSAT + điểm chấm tay, tổng có trọng số, chốt khoá phiếu.
import { db, parseJson } from "../db";
import type { WorkspaceConfig } from "../config/schema";
import { isMetric, kpiBoard, memberNames, monthRange, teamOf, METRIC_LABEL } from "../kpi";
import { allMembers, listTeams, ownerNames } from "./teams";
import { perfPref } from "./server";
import { csatScore, kpiScore, rankOf, weightedTotal, type Criterion, type Rank } from "./shared";

export type Scores = Record<string, number | null>;

export type PerfRow = {
  who: string;
  teams: string[];
  /** Điểm dùng để tính tổng (đã chốt thì là bản chụp lúc chốt). */
  scores: Scores;
  /** Giải thích điểm tự động, ví dụ "Đạt 85% chỉ tiêu". */
  notes: Record<string, string>;
  total: number;
  rank: Rank;
  comment: string;
  reviewer: string;
  status: "none" | "draft" | "done";
  updatedAt: string | null;
};

/**
 * Ghép điểm của một người: tiêu chí tự động lấy điểm tính trực tiếp, tiêu chí chấm tay lấy điểm đã lưu.
 * Phiếu đã chốt dùng nguyên bản chụp đã lưu (số liệu KPI thay đổi sau đó không làm đổi kết quả).
 */
export function mergeScores(criteria: Criterion[], auto: Scores, stored: Scores, done: boolean): Scores {
  const out: Scores = {};
  for (const c of criteria) {
    if (done && c.id in stored) out[c.id] = stored[c.id];
    else if (c.source === "manual") out[c.id] = stored[c.id] ?? null;
    else out[c.id] = auto[c.id] ?? null;
  }
  return out;
}

/** Chỉ giữ điểm của tiêu chí chấm tay, làm tròn và kẹp trong 0–100. */
export function cleanManual(criteria: Criterion[], input: Record<string, number | null | undefined>): Scores {
  const out: Scores = {};
  for (const c of criteria) {
    if (c.source !== "manual" || !(c.id in input)) continue;
    const v = input[c.id];
    out[c.id] = v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(Math.max(0, Math.min(100, v)));
  }
  return out;
}

/** Điểm tự động của cả đội cho một tháng: KPI (trần 120%) và CSAT trung bình phiếu đã xử lý trong tháng. */
export async function autoScores(workspaceId: string, cfg: WorkspaceConfig, period: string, criteria: Criterion[], people: string[]) {
  const board = await kpiBoard(workspaceId, cfg, period);
  const { from, to } = monthRange(period);
  const needCsat = criteria.some((c) => c.source === "csat");
  const csat = needCsat ? await db.ticket.groupBy({ by: ["assignee"], where: { workspaceId, resolvedAt: { gte: from, lt: to }, csat: { not: null } }, _avg: { csat: true }, _count: { csat: true } }) : [];
  const out: Record<string, { scores: Scores; notes: Record<string, string> }> = {};
  for (const who of people) {
    const row = board.rows.find((r) => r.who === who);
    const scores: Scores = {};
    const notes: Record<string, string> = {};
    for (const c of criteria) {
      if (c.source === "csat") {
        const g = csat.find((x) => x.assignee === who);
        const avg = g?._avg.csat ?? null;
        scores[c.id] = avg ? csatScore(avg) : null;
        notes[c.id] = avg ? `${Math.round(avg * 10) / 10}★ từ ${g?._count.csat} phiếu` : "Chưa có đánh giá CSAT";
      } else if (c.source.startsWith("kpi:")) {
        const m = c.source.slice(4);
        const cell = isMetric(m) && row ? row.cells[m] : null;
        scores[c.id] = cell && cell.target > 0 ? kpiScore(cell.pct) : null;
        notes[c.id] = cell && cell.target > 0 ? `Đạt ${cell.pct}% chỉ tiêu ${isMetric(m) ? METRIC_LABEL[m].toLowerCase() : m}` : "Chưa đặt chỉ tiêu";
      }
    }
    out[who] = { scores, notes };
  }
  return out;
}

/** Danh sách người được đánh giá: đội KPI (trừ chủ) + thành viên các đội + người đã có phiếu trong kỳ. */
async function reviewPeople(workspaceId: string, cfg: WorkspaceConfig, period: string) {
  const [names, teams, reviews, owners] = await Promise.all([memberNames(workspaceId), listTeams(workspaceId), db.perfReview.findMany({ where: { workspaceId, period }, select: { who: true } }), ownerNames(workspaceId)]);
  // Chủ doanh nghiệp không tự đánh giá mình, trừ khi được xếp vào đội hoặc đã có phiếu.
  const people = [...new Set([...teamOf(cfg, names).filter((n) => !owners.has(n)), ...teams.flatMap(allMembers), ...reviews.map((r) => r.who)])];
  return { people, teams };
}

/** Bảng đánh giá của kỳ. onlyWho: nhân viên chỉ xem phiếu của mình. */
export async function perfBoard(workspaceId: string, cfg: WorkspaceConfig, period: string, onlyWho?: string) {
  const { criteria } = await perfPref(workspaceId);
  const { people: all, teams } = await reviewPeople(workspaceId, cfg, period);
  const people = onlyWho !== undefined ? all.filter((p) => p === onlyWho).concat(all.includes(onlyWho) ? [] : [onlyWho]) : all;
  const [auto, reviews] = await Promise.all([autoScores(workspaceId, cfg, period, criteria, people), db.perfReview.findMany({ where: { workspaceId, period, who: { in: people } } })]);
  const rows: PerfRow[] = people.map((who) => {
    const r = reviews.find((x) => x.who === who);
    const done = r?.status === "done";
    const scores = mergeScores(criteria, auto[who]?.scores ?? {}, parseJson<Scores>(r?.scoresJson, {}), done);
    const total = done ? r!.total : weightedTotal(criteria, scores);
    return {
      who,
      teams: teams.filter((t) => allMembers(t).includes(who)).map((t) => t.name),
      scores,
      // Phiếu đã chốt: điểm tự động là bản chụp, ghi chú số liệu hiện tại sẽ mâu thuẫn với điểm nên thay bằng ghi chú chốt.
      notes: done ? Object.fromEntries(criteria.filter((c) => c.source !== "manual" && scores[c.id] != null).map((c) => [c.id, "Điểm chụp lúc chốt"])) : (auto[who]?.notes ?? {}),
      total,
      rank: rankOf(total),
      comment: r?.comment ?? "",
      reviewer: r?.reviewer ?? "",
      status: r ? (done ? "done" : "draft") : "none",
      updatedAt: r?.updatedAt.toISOString() ?? null,
    };
  });
  rows.sort((a, b) => b.total - a.total || a.who.localeCompare(b.who, "vi"));
  return { period, criteria, rows };
}

/**
 * Lưu điểm chấm tay + nhận xét (bản nháp). Phiếu đã chốt chỉ chủ sửa được (isOwner).
 * finalize = true: chụp toàn bộ điểm (cả tự động) và tổng, đặt trạng thái "done".
 */
export async function saveReview(
  workspaceId: string,
  cfg: WorkspaceConfig,
  input: { period: string; who: string; scores?: Record<string, number | null>; comment?: string; finalize?: boolean; reopen?: boolean },
  by: { name: string; isOwner: boolean },
): Promise<{ error: string } | { ok: true; status: "draft" | "done"; total: number }> {
  const { criteria } = await perfPref(workspaceId);
  const where = { workspaceId_period_who: { workspaceId, period: input.period, who: input.who } };
  const cur = await db.perfReview.findUnique({ where });
  const done = cur?.status === "done";
  // Chỉ chấm người thuộc danh sách đánh giá của kỳ (tránh tạo phiếu “ma” cho tên gõ tuỳ ý).
  if (!cur && !(await reviewPeople(workspaceId, cfg, input.period)).people.includes(input.who)) return { error: `“${input.who}” không có trong danh sách đánh giá` };
  if (done && !by.isOwner) return { error: "Phiếu đánh giá đã chốt. Chỉ chủ doanh nghiệp mở lại hoặc sửa được." };
  if (input.reopen) {
    if (!by.isOwner) return { error: "Chỉ chủ doanh nghiệp mở lại phiếu đã chốt" };
    if (!cur) return { error: "Chưa có phiếu đánh giá" };
    const u = await db.perfReview.update({ where, data: { status: "draft" } });
    return { ok: true, status: "draft", total: u.total };
  }
  const stored = { ...parseJson<Scores>(cur?.scoresJson, {}), ...cleanManual(criteria, input.scores ?? {}) };
  const auto = (await autoScores(workspaceId, cfg, input.period, criteria, [input.who]))[input.who]?.scores ?? {};
  // Phiếu đã chốt mà chủ sửa: giữ bản chụp điểm tự động cũ, chỉ thay điểm chấm tay.
  const merged = mergeScores(criteria, auto, stored, done);
  for (const c of criteria) if (c.source === "manual" && c.id in stored) merged[c.id] = stored[c.id];
  const finalizing = !!input.finalize || done;
  const scoresJson = JSON.stringify(finalizing ? merged : Object.fromEntries(Object.entries(stored).filter(([k]) => criteria.find((c) => c.id === k)?.source === "manual")));
  const total = weightedTotal(criteria, merged);
  const data = { scoresJson, total, comment: (input.comment ?? cur?.comment ?? "").slice(0, 2000), reviewer: by.name, status: finalizing ? "done" : "draft" };
  await db.perfReview.upsert({ where, create: { workspaceId, period: input.period, who: input.who, ...data }, update: data });
  return { ok: true, status: finalizing ? "done" : "draft", total };
}
