"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/Icon";
import { Badge, EmptyState, Stat } from "@/components/ui";
import { SendSurveyButton } from "@/components/survey/SendSurveyButton";
import { ago } from "@/lib/format";
import { NPS_COLOR, NPS_LABEL, SURVEY_CHANNEL_LABEL, SURVEY_KIND_LABEL, npsBucket, type NpsBucket, type SurveyChannel, type SurveyKind } from "@/lib/survey/shared";
import type { SurveyDTO } from "@/lib/survey/api";
import type { SurveyReport } from "@/lib/survey/service";

const NpsTrendChart = dynamic(() => import("./NpsTrendChart").then((m) => m.NpsTrendChart), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-surface-2" /> });

const BUCKETS: NpsBucket[] = ["promoter", "passive", "detractor"];

export function SurveyReportView({ id, focus }: { id: string; focus: string }) {
  const [data, setData] = useState<{ survey: SurveyDTO; report: SurveyReport; canManage: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"" | NpsBucket>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/surveys/${id}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setErr((await r.json().catch(() => ({}))).error ?? "Không tải được")))
      .catch(() => setErr("Không tải được"));
  }, [id]);
  useEffect(() => {
    if (focus && data) document.getElementById(`r-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, data]);

  if (err) return <p className="mt-4 text-danger">{err}</p>;
  if (!data) return <div className="skeleton mt-4 h-64" />;
  const { survey: s, report: r } = data;
  const b = r.breakdown;
  const pct = (n: number) => (b.total ? Math.round((n / b.total) * 100) : 0);
  const hasNps = b.total > 0;
  const openUrl = typeof window !== "undefined" ? `${location.origin}/s/f/${s.publicKey}` : "";
  const shown = r.responses.filter((x) => !filter || x.bucket === filter);

  return (
    <>
      <div className="mt-1 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold">{s.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-2">
            <Badge tone="accent">{SURVEY_KIND_LABEL[s.kind as SurveyKind] ?? s.kind}</Badge>
            {s.active ? <Badge tone="success">Đang nhận trả lời</Badge> : <Badge>Đang tắt</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              await navigator.clipboard?.writeText(openUrl).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Icon name={copied ? "check" : "link"} size={15} /> {copied ? "Đã chép link mở" : "Chép link mở"}
          </button>
          <a href={`/s/f/${s.publicKey}`} target="_blank" rel="noreferrer" className="btn-ghost">
            <Icon name="open" size={15} /> Xem trang
          </a>
          {data.canManage && (
            <Link href={`/w/surveys/${s.id}/edit`} className="btn-outline">
              <Icon name="edit" size={15} /> Sửa
            </Link>
          )}
          {s.active && <SendSurveyButton surveyId={s.id} className="btn-primary" label="Gửi cho khách" />}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {hasNps ? (
          <Stat label="Điểm NPS" value={<span style={{ color: r.nps == null ? undefined : r.nps >= 50 ? NPS_COLOR.promoter : r.nps >= 0 ? NPS_COLOR.passive : NPS_COLOR.detractor }}>{r.nps ?? "–"}</span>} hint="% ủng hộ − % phản đối" icon="trend" tone="#00c875" />
        ) : (
          <Stat label="Điểm hài lòng TB" value={r.avgRating != null ? `${r.avgRating} ★` : "–"} hint="Thang 1–5 sao" icon="award" tone="#ffb800" />
        )}
        <Stat label="Câu trả lời" value={r.submitted} hint={`${r.submitted - r.invitedSubmitted} từ link mở`} icon="chat" />
        <Stat label="Tỷ lệ phản hồi" value={r.responseRate != null ? `${r.responseRate}%` : "–"} hint={`${r.invitedSubmitted}/${r.sent} lời mời đã trả lời`} icon="send" tone="#a25ddc" />
        <Stat label="Khách phản đối" value={hasNps ? b.detractor : r.responses.filter((x) => x.bucket === "detractor").length} hint="Cần gọi lại sớm" icon="bell" tone="#e2445c" />
      </div>

      {!r.submitted ? (
        <div className="card mt-4">
          <EmptyState icon="chart" title="Chưa có câu trả lời" desc="Gửi khảo sát cho khách từ hồ sơ khách, cho cả nhóm khách, hoặc dán link mở lên fanpage. Kết quả hiện ở đây ngay khi khách gửi." />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {hasNps && (
              <section className="card grid content-start gap-3 p-4">
                <h2 className="section-title">Phân bố điểm</h2>
                <div className="flex h-4 overflow-hidden rounded-full bg-line-soft" role="img" aria-label={`Ủng hộ ${pct(b.promoter)}%, trung lập ${pct(b.passive)}%, phản đối ${pct(b.detractor)}%`}>
                  {BUCKETS.map((k) => (b[k] ? <div key={k} style={{ width: `${pct(b[k])}%`, background: NPS_COLOR[k] }} /> : null))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  {BUCKETS.map((k) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: NPS_COLOR[k] }} /> {NPS_LABEL[k]} <b className="tnum">{pct(b[k])}%</b> <span className="text-ink-2">({b[k]})</span>
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex h-28 items-end gap-1">
                  {b.dist.map((n, i) => {
                    const max = Math.max(...b.dist, 1);
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${n} khách chấm ${i}`}>
                        <span className="text-[11px] text-ink-2 tnum">{n || ""}</span>
                        <div className="w-full rounded-t" style={{ height: `${(n / max) * 72}px`, minHeight: n ? 3 : 0, background: NPS_COLOR[npsBucket(i)] }} />
                        <span className="text-[11.5px] text-ink-2 tnum">{i}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {hasNps && (
              <section className="card grid content-start gap-3 p-4">
                <h2 className="section-title">NPS theo tuần</h2>
                <div className="h-[200px] min-w-0">
                  <NpsTrendChart trend={r.trend} />
                </div>
              </section>
            )}
            {r.questions
              .filter((q) => "options" in q && q.options && q.type !== "nps")
              .map((q) => {
                const opts = ("options" in q && q.options) || [];
                const max = Math.max(...opts.map((o) => o.count), 1);
                return (
                  <section key={q.id} className="card grid content-start gap-2.5 p-4">
                    <h2 className="section-title">{q.label}</h2>
                    <p className="-mt-1 text-[12.5px] text-ink-2">
                      {q.answered} trả lời{"avg" in q && q.avg != null ? ` · trung bình ${q.avg}${q.type === "rating" ? " ★" : ""}` : ""}
                    </p>
                    {opts.map((o) => (
                      <div key={o.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[13.5px]">
                        <span className="truncate">{q.type === "rating" ? `${"★".repeat(Number(o.label))}` : o.label}</span>
                        <span className="text-ink-2 tnum">
                          {o.count} · {q.answered ? Math.round((o.count / q.answered) * 100) : 0}%
                        </span>
                        <div className="col-span-2 h-2 overflow-hidden rounded-full bg-line-soft">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(o.count / max) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
          </div>

          <section className="card mt-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
              <h2 className="section-title flex-1">Góp ý của khách</h2>
              {(["", ...BUCKETS] as const).map((k) => (
                <button key={k || "all"} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${filter === k ? "border-primary bg-primary-selected" : "border-line"}`}>
                  {k ? NPS_LABEL[k] : "Tất cả"}
                </button>
              ))}
            </div>
            {!shown.length ? (
              <p className="px-4 py-6 text-center text-[13.5px] text-ink-2">Không có câu trả lời nào ở nhóm này.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {shown.map((x) => (
                  <li key={x.id} id={`r-${x.id}`} className={`flex items-start gap-3 px-4 py-3 ${focus === x.id ? "bg-primary-selected" : ""}`}>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full text-[14px] font-semibold text-white tnum" style={{ background: x.bucket ? NPS_COLOR[x.bucket] : "var(--ink-2)" }}>
                      {x.nps ?? (x.rating != null ? `${x.rating}★` : "–")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                        {x.recordId ? (
                          <Link href={`/w/b/${x.objectKey}?open=${x.recordId}`} className="font-medium text-ink hover:underline">
                            {x.customer || "Khách"}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">Khách ẩn danh</span>
                        )}
                        {x.bucket && <span style={{ color: NPS_COLOR[x.bucket] }}>{NPS_LABEL[x.bucket]}</span>}
                        <span>· {ago(x.at)}</span>
                        {x.recordId && <span>· {SURVEY_CHANNEL_LABEL[x.channel as SurveyChannel] ?? x.channel}</span>}
                      </p>
                      {x.comment ? <p className="mt-0.5 whitespace-pre-line break-words text-[14px]">{x.comment}</p> : <p className="mt-0.5 text-[13px] italic text-ink-2">Không để lại góp ý</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
