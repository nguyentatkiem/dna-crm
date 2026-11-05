"use client";

import { useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { scoreColor, type Segment } from "@/lib/calls-shared";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const FACE = { 1: "🙂", 0: "😐", [-1]: "🙁" } as Record<number, string>;

type Props = {
  callId: string;
  hasAudio: boolean;
  segments: Segment[];
  stats: { ratio: number | null; questions: number; good: boolean; nvWords: number; khWords: number };
  sentiment: number | null;
};

/** Hội thoại theo người nói + ghi âm: bấm một câu để tua tới đoạn đó. */
export function Conversation({ callId, hasAudio, segments, stats, sentiment }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [now, setNow] = useState(0);
  const seek = (t: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = t;
    a.play().catch(() => undefined);
  };

  // Cảm xúc khách theo thời gian: trung bình trượt 3 câu gần nhất của KH, quy về 0–100.
  const kh = segments.filter((s) => s.speaker === "KH");
  const chart = kh.map((s, i) => {
    const win = kh.slice(Math.max(0, i - 2), i + 1);
    return { t: Math.round(s.start), v: Math.round(50 + 50 * (win.reduce((a, b) => a + b.sentiment, 0) / win.length)), text: s.text };
  });
  const active = segments.findIndex((s) => now >= s.start && now < s.end);

  return (
    <>
      {hasAudio && (
        <section className="card p-4">
          <h2 className="mb-2 text-[15px] font-semibold">Ghi âm</h2>
          <audio ref={audio} controls preload="metadata" src={`/api/calls/${callId}/audio`} className="w-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
        </section>
      )}
      {segments.length > 0 && (
        <section className="card grid gap-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Tỉ lệ nói NV / KH"
              value={stats.ratio == null ? "–" : `${stats.ratio}% / ${100 - stats.ratio}%`}
              hint={stats.ratio == null ? "" : stats.good ? "Tốt: nghe nhiều như nói" : stats.ratio > 60 ? "NV nói quá nhiều, hãy hỏi và nghe khách hơn" : "NV nói ít, cần dẫn dắt cuộc gọi hơn"}
              tone={stats.ratio == null ? null : stats.good ? "good" : "bad"}
            >
              {stats.ratio != null && (
                <span className="mt-1.5 flex h-2 overflow-hidden rounded bg-[var(--line-soft)]">
                  <span className="block h-full bg-primary" style={{ width: `${stats.ratio}%` }} />
                  <span className="block h-full bg-[#a25ddc]" style={{ width: `${100 - stats.ratio}%` }} />
                </span>
              )}
            </Metric>
            <Metric label="Câu hỏi NV đặt ra" value={String(stats.questions)} hint={stats.questions >= 3 ? "Khai thác nhu cầu tốt" : "Nên hỏi thêm câu hỏi mở về nhu cầu"} tone={stats.questions >= 3 ? "good" : "bad"} />
            <Metric label="Cảm xúc khách" value={sentiment == null ? "–" : `${sentiment}/100`} hint={sentiment == null ? "" : sentiment >= 60 ? "Tích cực" : sentiment <= 40 ? "Tiêu cực" : "Trung lập"} color={sentiment == null ? undefined : scoreColor(sentiment)} />
          </div>
          {chart.length > 1 && (
            <div>
              <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-ink-2">Cảm xúc khách theo thời gian</h3>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid stroke="var(--line-soft)" vertical={false} />
                    <XAxis dataKey="t" tickFormatter={(t: number) => mmss(t)} tick={{ fontSize: 11, fill: "var(--ink-2)" }} stroke="var(--line)" />
                    <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 11, fill: "var(--ink-2)" }} stroke="var(--line)" />
                    <ReferenceLine y={50} stroke="var(--line)" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, maxWidth: 260, whiteSpace: "normal" }}
                      labelFormatter={(t) => mmss(Number(t))}
                      formatter={(v, _n, item) => [`${v} · “${String((item.payload as { text: string }).text).slice(0, 80)}”`, "Cảm xúc"]}
                    />
                    <Line type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-2">
              Hội thoại
              {hasAudio && <span className="text-[12px] font-normal normal-case tracking-normal">Bấm một câu để nghe lại đoạn đó</span>}
            </h3>
            <ol className="grid max-h-[560px] gap-2 overflow-y-auto pr-1">
              {segments.map((s, i) => {
                const nv = s.speaker === "NV";
                return (
                  <li key={i} className={`flex ${nv ? "justify-start" : "justify-end"}`}>
                    <button
                      type="button"
                      disabled={!hasAudio}
                      onClick={() => seek(s.start)}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-left text-[14px] leading-snug disabled:cursor-default ${nv ? "rounded-bl-sm bg-primary-selected" : "rounded-br-sm bg-[var(--line-soft)]"} ${i === active ? "ring-2 ring-primary" : ""}`}
                    >
                      <span className="mb-0.5 flex items-center gap-2 text-[11.5px] text-ink-2">
                        <b className="font-semibold">{nv ? "Nhân viên" : "Khách"}</b>
                        <span className="tnum">{mmss(s.start)}</span>
                        {!nv && s.sentiment !== 0 && <span aria-label={s.sentiment > 0 ? "tích cực" : "tiêu cực"}>{FACE[s.sentiment]}</span>}
                      </span>
                      {s.text}
                    </button>
                  </li>
                );
              })}
            </ol>
            {!hasAudio && <p className="mt-2 text-[12px] text-ink-2">Mốc thời gian được ước lượng theo độ dài câu vì cuộc gọi không có ghi âm.</p>}
          </div>
        </section>
      )}
    </>
  );
}

function Metric({ label, value, hint, tone, color, children }: { label: string; value: string; hint: string; tone?: "good" | "bad" | null; color?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded border border-line p-3">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <b className="block text-[20px] tnum" style={color ? { color } : undefined}>
        {value}
      </b>
      {children}
      {hint && <span className={`mt-1 block text-[12px] ${tone === "good" ? "text-[#037f4c]" : tone === "bad" ? "text-[#b3123a]" : "text-ink-2"}`}>{hint}</span>}
    </div>
  );
}
