import { isOwner, requireApp } from "@/lib/auth";
import { db, parseJson } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { getScorecard, outcomeOf, POSITIVE, sttConfigured, TALKED, teamStats } from "@/lib/calls";
import { Telesales, type QueueItem } from "./Telesales";

const STOP = new Set(["not_interested", "wrong", "won"]);

export default async function TelesalesPage({ searchParams }: { searchParams: Promise<{ tab?: string; record?: string }> }) {
  const { tab, record } = await searchParams;
  const { workspace, user, config } = await requireApp();
  const wid = workspace.id;
  const obj = getObject(config, "contacts")!;
  const phoneKey = obj.fields.find((f) => f.type === "phone")?.key;
  const lostKeys = new Set(obj.statuses.filter((s) => s.color === "gray" || s.color === "red").map((s) => s.key));

  const [contacts, calls, stats, lessons, owner] = await Promise.all([
    db.record.findMany({ where: { workspaceId: wid, objectKey: "contacts" }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.call.findMany({ where: { workspaceId: wid }, orderBy: { startedAt: "desc" }, take: 300 }),
    teamStats(wid),
    db.lesson.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 10 }),
    isOwner(user.id, wid),
  ]);
  const card = await getScorecard(wid, config);

  // Hàng gọi: hẹn gọi lại đến hạn → lead chưa gọi (điểm cao trước) → gọi lỡ đã quá 4 giờ, tối đa 3 lần.
  const byRecord = new Map<string, typeof calls>();
  for (const c of calls) if (c.recordId) byRecord.set(c.recordId, [...(byRecord.get(c.recordId) ?? []), c]);
  const now = Date.now();
  const queue: QueueItem[] = [];
  for (const r of contacts) {
    if (lostKeys.has(r.status)) continue;
    const d = parseJson<Record<string, string>>(r.dataJson, {});
    const phone = phoneKey ? String(d[phoneKey] ?? "") : "";
    if (!phone) continue;
    const hist = byRecord.get(r.id) ?? [];
    const last = hist[0];
    let reason = "";
    let rank = 0;
    if (!last) {
      reason = "Chưa gọi lần nào";
      rank = 2000 + r.score;
    } else if (STOP.has(last.outcome)) continue;
    else if (last.callbackAt && last.callbackAt.getTime() <= now + 3600e3) {
      reason = `Hẹn gọi lại ${last.callbackAt.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}`;
      rank = 3000 + r.score;
    } else if ((last.outcome === "no_answer" || last.outcome === "busy") && hist.length < 3 && now - last.startedAt.getTime() > 4 * 3600e3) {
      reason = `Gọi lỡ lần ${hist.length}, thử lại`;
      rank = 1000 + r.score;
    } else continue;
    queue.push({ id: r.id, title: r.title, phone, score: r.score, reason, rank, source: d._nguon || d.nguon || "", campaign: d._chien_dich || "", attempts: hist.length, status: obj.statuses.find((s) => s.key === r.status)?.label ?? "" });
  }
  queue.sort((a, b) => b.rank - a.rank);
  if (record && !queue.some((q) => q.id === record)) {
    const r = contacts.find((c) => c.id === record);
    if (r) {
      const d = parseJson<Record<string, string>>(r.dataJson, {});
      queue.unshift({ id: r.id, title: r.title, phone: phoneKey ? String(d[phoneKey] ?? "") : "", score: r.score, reason: "Bạn chọn từ bảng", rank: 9999, source: d._nguon || d.nguon || "", campaign: d._chien_dich || "", attempts: byRecord.get(r.id)?.length ?? 0, status: "" });
    }
  }

  // Bảng xếp hạng theo nhân viên.
  const agents = new Map<string, { name: string; calls: number; talked: number; positive: number; talk: number; scores: number[]; reviewed: number }>();
  for (const c of stats.calls) {
    const a = agents.get(c.agentName) ?? { name: c.agentName, calls: 0, talked: 0, positive: 0, talk: 0, scores: [], reviewed: 0 };
    a.calls++;
    if (TALKED.has(c.outcome)) a.talked++;
    if (POSITIVE.has(c.outcome)) a.positive++;
    a.talk += c.durationSec;
    const sc = c.reviewScore ?? c.aiScore;
    if (sc != null) a.scores.push(sc);
    if (c.reviewScore != null) a.reviewed++;
    agents.set(c.agentName, a);
  }
  const board = [...agents.values()]
    .map((a) => ({ ...a, avg: a.scores.length ? Math.round(a.scores.reduce((x, y) => x + y, 0) / a.scores.length) : null }))
    .sort((a, b) => b.positive - a.positive || (b.avg ?? 0) - (a.avg ?? 0));

  const titles = new Map(contacts.map((c) => [c.id, c.title]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mine = calls.filter((c) => c.agentName === user.name && c.startedAt >= today);

  return (
    <Telesales
      tab={tab ?? "queue"}
      queue={queue.slice(0, 60)}
      me={{ name: user.name, today: mine.length, talked: mine.filter((c) => TALKED.has(c.outcome)).length, positive: mine.filter((c) => POSITIVE.has(c.outcome)).length }}
      calls={calls.slice(0, 100).map((c) => ({ id: c.id, at: c.startedAt.toISOString(), agent: c.agentName, title: (c.recordId && titles.get(c.recordId)) || c.phone || "Không rõ", outcome: c.outcome, outcomeLabel: outcomeOf(c.outcome).label, color: outcomeOf(c.outcome).color, duration: c.durationSec, ai: c.aiScore, review: c.reviewScore, recording: !!c.recordingPath, direction: c.direction }))}
      board={board}
      criteria={stats.criteria.map((k) => ({ key: k.key, label: k.label, weight: k.weight, guide: k.guide, keywords: k.keywords, avgAll: k.avgAll, avgWin: k.avgWin, avgLose: k.avgLose }))}
      script={card.scriptText}
      version={card.version}
      drift={stats.drift}
      bias={stats.bias}
      reviewedCount={stats.reviewed.length}
      lessons={lessons.map((l) => ({ id: l.id, title: l.title, body: l.body, status: l.status, at: l.createdAt.toISOString(), proposal: parseJson<{ weights: { key: string; weight: number }[]; scriptAdd: string } | null>(l.proposalJson, null) }))}
      owner={owner}
      stt={sttConfigured()}
      aiOn={!!process.env.ANTHROPIC_API_KEY}
      contactLabel={config.terminology.contact}
    />
  );
}
