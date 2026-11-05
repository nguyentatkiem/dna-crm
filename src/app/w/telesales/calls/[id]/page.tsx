import Link from "next/link";
import { notFound } from "next/navigation";
import { isOwner, requireApp } from "@/lib/auth";
import { db, parseJson } from "@/lib/db";
import { getScorecard, outcomeOf, type CallScore } from "@/lib/calls";
import { customerSentiment, scoreColor, segmentsOf, talkStats } from "@/lib/calls-shared";
import { color } from "@/lib/colors";
import { Review } from "./Review";
import { Conversation } from "./Conversation";

const SENT: Record<string, string> = { tich_cuc: "Tích cực", trung_lap: "Trung lập", tieu_cuc: "Tiêu cực" };

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace, user, config } = await requireApp();
  const call = await db.call.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!call) notFound();
  const [rec, card, owner] = await Promise.all([call.recordId ? db.record.findUnique({ where: { id: call.recordId } }) : null, getScorecard(workspace.id, config), isOwner(user.id, workspace.id)]);
  const score = parseJson<CallScore | null>(call.scoreJson, null);
  const o = outcomeOf(call.outcome);
  const label = (k: string) => card.criteria.find((c) => c.key === k)?.label ?? k;
  const weight = (k: string) => card.criteria.find((c) => c.key === k)?.weight ?? 0;
  const segments = segmentsOf(call);
  const stats = talkStats(segments);
  const sentiment = call.sentiment ?? customerSentiment(segments);

  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <Link href="/w/telesales?tab=calls" className="text-[13.5px] text-primary">
        ← Danh sách cuộc gọi
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-semibold">
          {call.direction === "in" ? "Cuộc gọi đến từ" : "Cuộc gọi với"} {rec ? <Link href={`/w/b/contacts?open=${rec.id}`} className="hover:text-primary">{rec.title}</Link> : call.phone || "khách chưa rõ"}
        </h1>
        <span className="rounded px-2 py-0.5 text-[13px] font-medium" style={{ background: color(o.color).bg, color: color(o.color).fg }}>
          {o.label}
        </span>
      </header>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {call.agentName} · {call.startedAt.toLocaleString("vi-VN")} · {Math.floor(call.durationSec / 60)} phút {call.durationSec % 60} giây · {call.provider === "pbx" ? "Tổng đài" : call.provider === "sip" ? "Softphone trên trình duyệt" : "Ghi tay"}
        {call.scorecardVersion ? ` · chấm theo phiếu v${call.scorecardVersion}` : ""}
      </p>
      {call.note && <p className="mt-2 text-[14px]">Ghi chú: {call.note}</p>}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-4">
          <Conversation callId={call.id} hasAudio={!!call.recordingPath} segments={segments} stats={stats} sentiment={sentiment} />
          {score ? (
            <section className="card p-5">
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid h-20 w-20 place-items-center rounded-full text-[28px] font-bold text-white tnum" style={{ background: scoreColor(score.total) }}>
                  {score.total}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{score.summary}</p>
                  <p className="mt-1 text-[13px] text-ink-2">
                    {score.source === "ai" ? "Claude chấm" : "Chấm bằng luật từ khoá"} · Thái độ khách: {SENT[score.sentiment] ?? score.sentiment}
                  </p>
                </div>
              </div>
              <ul className="mt-5 grid gap-4">
                {score.criteria.map((c) => (
                  <li key={c.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <b className="text-[14.5px] font-medium">
                        {label(c.key)} <span className="text-[12px] font-normal text-ink-2">({weight(c.key)}%)</span>
                      </b>
                      <span className="text-[14px] font-semibold tnum" style={{ color: scoreColor(c.score * 10) }}>
                        {c.score}/10
                      </span>
                    </div>
                    <span className="mt-1 block h-2 overflow-hidden rounded bg-[var(--line-soft)]">
                      <span className="block h-full" style={{ width: `${c.score * 10}%`, background: scoreColor(c.score * 10) }} />
                    </span>
                    {c.evidence && c.evidence !== "Không có" && <q className="mt-1.5 block text-[13.5px] italic text-ink-2">{c.evidence}</q>}
                    <p className="mt-1 text-[13.5px]">💡 {c.tip}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <List title="Điểm mạnh" items={score.strengths} />
                <List title="Cần cải thiện" items={score.improvements} />
                <List title="Khách băn khoăn" items={score.objections} />
                <List title="Bước tiếp theo" items={[score.nextAction]} />
              </div>
            </section>
          ) : (
            <section className="card p-5 text-ink-2">Chưa chấm điểm: cần bản chép lời. Dán bản chép lời ở khung bên phải rồi bấm Chấm điểm.</section>
          )}
        </div>
        <Review id={call.id} transcript={call.transcript} owner={owner} ai={call.aiScore} review={call.reviewScore} note={call.reviewNote} reviewedBy={call.reviewedBy} />
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{title}</h3>
      <ul className="mt-1 list-disc pl-5 text-[14px]">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
