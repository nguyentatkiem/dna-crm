"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { color } from "@/lib/colors";
import { ago } from "@/lib/format";
import { OUTCOMES, scoreColor } from "@/lib/calls-shared";

export type QueueItem = { id: string; title: string; phone: string; score: number; reason: string; rank: number; source: string; campaign: string; attempts: number; status: string };
type CallRow = { id: string; at: string; agent: string; title: string; outcome: string; outcomeLabel: string; color: string; duration: number; ai: number | null; review: number | null; recording: boolean; direction: string };
type BoardRow = { name: string; calls: number; talked: number; positive: number; talk: number; avg: number | null; reviewed: number };
type Crit = { key: string; label: string; weight: number; guide: string; keywords: string[]; avgAll: number | null; avgWin: number | null; avgLose: number | null };
type LessonRow = { id: string; title: string; body: string; status: string; at: string; proposal: { weights: { key: string; weight: number }[]; scriptAdd: string } | null };

type Props = {
  tab: string;
  queue: QueueItem[];
  me: { name: string; today: number; talked: number; positive: number };
  calls: CallRow[];
  board: BoardRow[];
  criteria: Crit[];
  script: string;
  version: number;
  drift: number | null;
  bias: number | null;
  reviewedCount: number;
  lessons: LessonRow[];
  owner: boolean;
  stt: boolean;
  aiOn: boolean;
  contactLabel: string;
};

const TABS = [
  ["queue", "Hàng gọi"],
  ["calls", "Cuộc gọi"],
  ["team", "Đội ngũ"],
  ["loop", "Phiếu chấm & vòng phản hồi"],
] as const;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Telesales(p: Props) {
  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">Telesales</h1>
          <p className="mt-1 max-w-3xl text-ink-2">Gọi theo hàng ưu tiên, ghi nhận kết quả và ghi âm. Call Analyst chấm điểm từng cuộc, quản lý chấm lại để AI học chuẩn của bạn.</p>
        </div>
        <div className="flex gap-2 text-[13px]">
          <span className="chip">Hôm nay: <b className="tnum mx-1">{p.me.today}</b>cuộc</span>
          <span className="chip">Nghe máy <b className="tnum ml-1">{p.me.talked}</b></span>
          <span className="chip">Hẹn/chốt <b className="tnum ml-1">{p.me.positive}</b></span>
        </div>
      </div>
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Telesales">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/w/telesales?tab=${k}`} className={`-mb-px flex-none border-b-2 px-3 py-2 text-[14px] ${p.tab === k ? "border-primary font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {!p.aiOn && <p className="mt-3 inline-flex rounded bg-[#fff0d6] px-3 py-1.5 text-[13px] text-[#8a5a00]">Chưa có ANTHROPIC_API_KEY: cuộc gọi đang được chấm bằng luật từ khoá. Thêm key để Claude chấm theo ngữ cảnh.</p>}
      {p.tab === "queue" && <Queue {...p} />}
      {p.tab === "calls" && <Calls calls={p.calls} />}
      {p.tab === "team" && <Team board={p.board} criteria={p.criteria} />}
      {p.tab === "loop" && <Loop {...p} />}
    </div>
  );
}

function Queue({ queue, script, stt, contactLabel }: Props) {
  const [sel, setSel] = useState(queue[0]?.id ?? "");
  // Giữ khách đang gọi kể cả khi danh sách được làm mới và khách đó đã rời hàng (vừa lưu cuộc gọi).
  const [pinned, setPinned] = useState<QueueItem | null>(queue[0] ?? null);
  const cur = queue.find((q) => q.id === sel) ?? (pinned?.id === sel ? pinned : undefined);
  if (!queue.length)
    return (
      <div className="card mt-5 grid place-items-center gap-2 p-10 text-center">
        <Icon name="phone" size={28} className="text-ink-2" />
        <b>Hàng gọi trống</b>
        <p className="max-w-md text-ink-2">Mọi {contactLabel.toLowerCase()} có số điện thoại đều đã được gọi hoặc chưa đến hẹn gọi lại. Lead mới từ Nguồn khách sẽ tự vào đây.</p>
      </div>
    );
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <ol className="card max-h-[38vh] overflow-y-auto p-1.5 lg:max-h-[70vh]" aria-label="Hàng gọi">
        {queue.map((q, i) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => {
                setSel(q.id);
                setPinned(q);
                if (window.innerWidth < 1024) document.getElementById("call-desk")?.scrollIntoView({ behavior: "smooth" });
              }} className={`flex w-full items-center gap-3 rounded px-2.5 py-2 text-left ${q.id === sel ? "bg-primary-selected" : "hover:bg-hover"}`}>
              <span className="w-5 flex-none text-right text-[12px] text-ink-2 tnum">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] font-medium">{q.title}</b>
                <span className="block truncate text-[12px] text-ink-2">
                  {q.reason}
                  {q.source && ` · ${q.source}`}
                </span>
              </span>
              <span className="flex-none rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-white tnum" style={{ background: q.score >= 70 ? "#df2f4a" : q.score >= 40 ? "#fdab3d" : "#579bfc" }}>
                {q.score}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {cur && (
        <CallDesk
          key={cur.id}
          item={cur}
          script={script}
          stt={stt}
          onNext={() => {
            const i = queue.findIndex((q) => q.id === cur.id);
            const next = queue[i + 1] ?? queue.find((q) => q.id !== cur.id) ?? queue[0];
            setSel(next.id);
            setPinned(next);
          }}
        />
      )}
    </div>
  );
}

type Result = { id: string; score: { total: number; summary: string; nextAction: string; improvements: string[]; source: string } | null; sttError: string; needsTranscript: boolean };

function CallDesk({ item, script, stt, onNext }: { item: QueueItem; script: string; stt: boolean; onNext: () => void }) {
  const router = useRouter();
  const [start, setStart] = useState<number | null>(null);
  const [secs, setSecs] = useState(0);
  const [outcome, setOutcome] = useState("connected");
  const [note, setNote] = useState("");
  const [callback, setCallback] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [showScript, setShowScript] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    if (start == null) return;
    const t = setInterval(() => setSecs(Math.round((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [start]);

  const needsCallback = outcome === "callback" || outcome === "no_answer" || outcome === "busy";

  async function submit() {
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("recordId", item.id);
    fd.set("phone", item.phone);
    fd.set("outcome", outcome);
    fd.set("durationSec", String(secs));
    fd.set("note", note);
    if (needsCallback && callback) fd.set("callbackAt", new Date(callback).toISOString());
    if (transcript.trim()) fd.set("transcript", transcript);
    if (file) fd.set("recording", file);
    const r = await fetch("/api/calls", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được cuộc gọi");
    setStart(null);
    setRes(j);
  }

  if (res)
    return (
      <section className="card grid content-start gap-4 p-5">
        <h2 className="text-[18px] font-semibold">Đã lưu cuộc gọi với {item.title}</h2>
        {res.score ? (
          <div className="flex items-start gap-4">
            <span className="grid h-16 w-16 flex-none place-items-center rounded-full text-[22px] font-bold text-white tnum" style={{ background: scoreColor(res.score.total) }}>
              {res.score.total}
            </span>
            <div className="grid gap-1 text-[14px]">
              <p>{res.score.summary}</p>
              <p>
                <b>Bước tiếp theo:</b> {res.score.nextAction}
              </p>
              {res.score.improvements[0] && (
                <p className="text-ink-2">
                  <b className="text-ink">Cần cải thiện:</b> {res.score.improvements[0]}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-ink-2">{res.needsTranscript ? "Đã lưu ghi âm. Chưa có bản chép lời nên chưa chấm điểm: mở chi tiết cuộc gọi để dán bản chép lời." : "Cuộc gọi không có nội dung trò chuyện nên không chấm điểm."}</p>
        )}
        {res.sttError && <p className="rounded bg-[#ffe1e5] px-3 py-2 text-[13px] text-[#b3123a]">Chép lời lỗi: {res.sttError}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              router.refresh();
              onNext();
            }}
          >
            Khách tiếp theo
          </button>
          <Link href={`/w/telesales/calls/${res.id}`} className="btn-outline">
            Xem chi tiết & chấm lại
          </Link>
        </div>
      </section>
    );

  return (
    <section id="call-desk" className="card grid min-w-0 content-start gap-4 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <Avatar name={item.title} size={44} />
        <div className="min-w-[180px] flex-1">
          <h2 className="truncate text-[20px] font-semibold">{item.title}</h2>
          <p className="text-[13px] text-ink-2">
            {item.phone} · {item.reason}
            {item.campaign && ` · ${item.campaign}`}
          </p>
        </div>
        <a
          href={`tel:${item.phone}`}
          onClick={() => {
            setStart(Date.now());
            setSecs(0);
          }}
          className="btn-primary gap-2 bg-[#00c875] hover:bg-[#00a862]"
        >
          <Icon name="phone" size={16} /> Gọi
        </a>
        <div className="flex items-center gap-2 rounded border border-line px-3 py-1.5 tnum" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${start != null ? "animate-pulse bg-[#df2f4a]" : "bg-[#c4c4c4]"}`} />
          {mmss(secs)}
          {start != null ? (
            <button type="button" className="text-[12.5px] text-primary" onClick={() => setStart(null)}>
              Kết thúc
            </button>
          ) : (
            <button type="button" className="text-[12.5px] text-primary" onClick={() => setStart(Date.now() - secs * 1000)}>
              Bấm giờ
            </button>
          )}
        </div>
      </header>

      <div className="rounded border border-line">
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] font-medium" onClick={() => setShowScript(!showScript)} aria-expanded={showScript}>
          Kịch bản gọi
          <Icon name="chevron" size={15} className={showScript ? "" : "-rotate-90"} />
        </button>
        {showScript && <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-line px-3 py-2 font-sans text-[13.5px] leading-relaxed">{script}</pre>}
      </div>

      <fieldset>
        <legend className="label">Kết quả cuộc gọi</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={outcome === o.key}
              onClick={() => setOutcome(o.key)}
              className="rounded px-2.5 py-1.5 text-[13px] font-medium"
              style={outcome === o.key ? { background: color(o.color).bg, color: color(o.color).fg } : { background: "var(--line-soft)" }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[13.5px] sm:col-span-2">
          Ghi chú
          <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Khách quan tâm gì, băn khoăn gì..." />
        </label>
        {needsCallback && (
          <label className="grid gap-1 text-[13.5px]">
            Hẹn gọi lại lúc
            <input type="datetime-local" className="input" value={callback} onChange={(e) => setCallback(e.target.value)} />
          </label>
        )}
        <label className="grid gap-1 text-[13.5px]">
          File ghi âm (mp3, wav, m4a)
          <input type="file" accept="audio/*,.mp3,.wav,.m4a,.amr" className="text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="text-[12px] text-ink-2">{stt ? "Sẽ tự chép lời và chấm điểm." : "Chưa cấu hình chép lời: dán bản chép lời bên dưới để được chấm."}</span>
        </label>
      </div>
      <details>
        <summary className="cursor-pointer text-[13.5px] text-primary">Dán bản chép lời (nếu có)</summary>
        <textarea className="textarea mt-2" rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder={"NV: Dạ em chào chị...\nKH: ..."} />
      </details>
      {err && <p className="text-[13.5px] text-[#df2f4a]">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onNext}>
          Bỏ qua
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? (file ? "Đang chép lời & chấm..." : "Đang lưu...") : "Lưu cuộc gọi"}
        </button>
      </div>
    </section>
  );
}

function Calls({ calls }: { calls: CallRow[] }) {
  const [agent, setAgent] = useState("");
  const agents = useMemo(() => [...new Set(calls.map((c) => c.agent))], [calls]);
  const rows = calls.filter((c) => !agent || c.agent === agent);
  return (
    <section className="card mt-5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <label className="text-[13.5px] text-ink-2" htmlFor="agent-filter">
          Nhân viên
        </label>
        <select id="agent-filter" className="h-8 rounded border border-line bg-surface px-2 text-[13.5px]" value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">Tất cả</option>
          {agents.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <span className="ml-auto text-[13px] text-ink-2">{rows.length} cuộc gọi</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead className="text-left text-[12.5px] text-ink-2">
            <tr className="border-b border-line">
              <th className="py-2 font-medium">Thời gian</th>
              <th className="font-medium">Khách</th>
              <th className="font-medium">Nhân viên</th>
              <th className="font-medium">Kết quả</th>
              <th className="text-right font-medium">Thời lượng</th>
              <th className="text-right font-medium">AI chấm</th>
              <th className="text-right font-medium">Quản lý</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-[var(--line-soft)] hover:bg-hover">
                <td className="py-2 text-ink-2" suppressHydrationWarning>
                  {ago(c.at)}
                </td>
                <td>
                  <Link href={`/w/telesales/calls/${c.id}`} className="font-medium hover:text-primary">
                    {c.direction === "in" ? "↙ " : ""}
                    {c.title}
                  </Link>
                  {c.recording && <span className="ml-1.5 text-[11px] text-ink-2">● ghi âm</span>}
                </td>
                <td>{c.agent}</td>
                <td>
                  <span className="rounded px-2 py-0.5 text-[12px] font-medium" style={{ background: color(c.color).bg, color: color(c.color).fg }}>
                    {c.outcomeLabel}
                  </span>
                </td>
                <td className="text-right tnum">{mmss(c.duration)}</td>
                <td className="text-right">
                  <ScoreDot n={c.ai} />
                </td>
                <td className="text-right">
                  <ScoreDot n={c.review} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-ink-2">
                  Chưa có cuộc gọi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ScoreDot({ n }: { n: number | null }) {
  if (n == null) return <span className="text-ink-2">–</span>;
  return (
    <span className="inline-grid h-7 w-9 place-items-center rounded text-[12.5px] font-semibold text-white tnum" style={{ background: scoreColor(n) }}>
      {n}
    </span>
  );
}

function Team({ board, criteria }: { board: BoardRow[]; criteria: Crit[] }) {
  const f = (n: number | null) => (n == null ? "–" : n.toFixed(1));
  return (
    <div className="mt-5 grid gap-4">
      <section className="card p-4">
        <h2 className="mb-3 text-[16px] font-semibold">Bảng xếp hạng 60 ngày</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead className="text-left text-[12.5px] text-ink-2">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">#</th>
                <th className="font-medium">Nhân viên</th>
                <th className="text-right font-medium">Cuộc gọi</th>
                <th className="text-right font-medium">Tỷ lệ nghe máy</th>
                <th className="text-right font-medium">Thời gian nói</th>
                <th className="text-right font-medium">Hẹn/chốt</th>
                <th className="text-right font-medium">Tỷ lệ chuyển đổi</th>
                <th className="text-right font-medium">Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {board.map((a, i) => (
                <tr key={a.name} className="border-b border-[var(--line-soft)]">
                  <td className="py-2 text-ink-2">{i + 1}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={a.name} size={24} />
                      {a.name}
                      {i === 0 && <span aria-label="Dẫn đầu">🏆</span>}
                    </span>
                  </td>
                  <td className="text-right tnum">{a.calls}</td>
                  <td className="text-right tnum">{Math.round((a.talked / Math.max(a.calls, 1)) * 100)}%</td>
                  <td className="text-right tnum">{Math.round(a.talk / 60)} phút</td>
                  <td className="text-right tnum">{a.positive}</td>
                  <td className="text-right tnum">{a.talked ? `${Math.round((a.positive / a.talked) * 100)}%` : "–"}</td>
                  <td className="text-right">
                    <ScoreDot n={a.avg} />
                  </td>
                </tr>
              ))}
              {!board.length && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-2">
                    Chưa có cuộc gọi trong 60 ngày.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="text-[16px] font-semibold">Kỹ năng của đội theo tiêu chí</h2>
        <p className="mb-3 text-[13px] text-ink-2">Điểm trung bình 0–10. So sánh cuộc ra lịch hẹn/chốt với cuộc không thắng để biết kỹ năng nào quyết định kết quả.</p>
        <ul className="grid gap-3">
          {criteria.map((k) => (
            <li key={k.key} className="grid gap-1 sm:grid-cols-[220px_minmax(0,1fr)_220px] sm:items-center sm:gap-3">
              <span className="text-[14px]">
                {k.label} <span className="text-[12px] text-ink-2">({k.weight}%)</span>
              </span>
              <span className="h-3 overflow-hidden rounded bg-[var(--line-soft)]">
                <span className="block h-full rounded" style={{ width: `${((k.avgAll ?? 0) / 10) * 100}%`, background: scoreColor(k.avgAll == null ? null : k.avgAll * 10) }} />
              </span>
              <span className="text-[12.5px] text-ink-2 tnum">
                TB {f(k.avgAll)} · thắng {f(k.avgWin)} · thua {f(k.avgLose)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Loop({ criteria, script, version, drift, bias, reviewedCount, lessons, owner }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState(criteria.map(({ key, label, weight, guide, keywords }) => ({ key, label, weight, guide, keywords })));
  const [text, setText] = useState(script);
  const sum = rows.reduce((s, r) => s + r.weight, 0);
  const labelOf = (k: string) => criteria.find((c) => c.key === k)?.label ?? k;

  async function learn() {
    setBusy(true);
    const r = await fetch("/api/calls/lessons", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? "Đã rút bài học mới." : j.error);
    router.refresh();
  }
  async function act(id: string, action: "apply" | "dismiss") {
    setBusy(true);
    await fetch(`/api/calls/lessons/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(false);
    setMsg(action === "apply" ? "Đã áp dụng: phiếu chấm lên phiên bản mới, các cuộc gọi tiếp theo chấm theo chuẩn mới." : "Đã bỏ qua bài học.");
    router.refresh();
  }
  async function save() {
    setBusy(true);
    const r = await fetch("/api/calls/scorecard", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criteria: rows, scriptText: text }) });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `Đã lưu phiếu chấm phiên bản ${j.version}.` : j.error);
    if (r.ok) router.refresh();
  }

  return (
    <div className="mt-5 grid gap-4">
      <section className="card grid gap-4 p-5 md:grid-cols-3">
        <Step n={1} title="Gọi & chấm" text="Mỗi cuộc gọi có ghi âm hoặc bản chép lời được Call Analyst chấm theo phiếu, kèm trích dẫn bằng chứng." />
        <Step n={2} title="Quản lý chấm lại" text={`Chủ nghe lại và sửa điểm khi AI chấm lệch. AI dùng các lần chấm lại này làm chuẩn cho lần sau. Đã chấm lại: ${reviewedCount} cuộc.`} />
        <Step n={3} title="Rút bài học" text="So sánh cuộc thắng/thua, đề xuất trọng số và kịch bản mới. Chủ duyệt thì phiếu chấm lên phiên bản mới." />
      </section>
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <div className="grid">
          <span className="text-[12.5px] text-ink-2">Độ lệch AI so với quản lý</span>
          <b className="text-[26px] tnum">{drift == null ? "–" : `${drift.toFixed(1)} điểm`}</b>
          <span className="text-[12.5px] text-ink-2">{bias == null ? "Chưa có cuộc nào được chấm lại" : bias > 0 ? "AI đang chấm thấp hơn quản lý" : bias < 0 ? "AI đang chấm cao hơn quản lý" : "Khớp"}</span>
        </div>
        <div className="grid">
          <span className="text-[12.5px] text-ink-2">Phiếu chấm đang dùng</span>
          <b className="text-[26px] tnum">v{version}</b>
        </div>
        <button type="button" className="btn-primary ml-auto" disabled={busy} onClick={learn}>
          <Icon name="spark" size={16} /> {busy ? "Đang phân tích..." : "Rút bài học ngay"}
        </button>
        {msg && <p className="w-full rounded bg-primary-selected px-3 py-2 text-[13.5px]">{msg}</p>}
      </section>

      {lessons.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-[16px] font-semibold">Bài học</h2>
          <ul className="grid gap-3">
            {lessons.map((l) => (
              <li key={l.id} className="rounded border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[15px]">{l.title}</b>
                  <span className="text-[12px] text-ink-2" suppressHydrationWarning>
                    {ago(l.at)}
                  </span>
                  <span className="ml-auto rounded px-2 py-0.5 text-[12px] font-medium text-white" style={{ background: l.status === "applied" ? "#00c875" : l.status === "dismissed" ? "#c4c4c4" : "#fdab3d" }}>
                    {l.status === "applied" ? "Đã áp dụng" : l.status === "dismissed" ? "Đã bỏ qua" : "Chờ duyệt"}
                  </span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-[14px]">
                  {l.body.split("\n").map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                {l.proposal && (
                  <div className="mt-3 grid gap-2 text-[13.5px]">
                    <span className="text-ink-2">Trọng số đề xuất:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {l.proposal.weights.map((w) => {
                        const old = criteria.find((c) => c.key === w.key)?.weight ?? 0;
                        return (
                          <span key={w.key} className="chip">
                            {labelOf(w.key)}: {old}% → <b className={w.weight > old ? "text-[#037f4c]" : w.weight < old ? "text-[#b3123a]" : ""}>{w.weight}%</b>
                          </span>
                        );
                      })}
                    </div>
                    {l.proposal.scriptAdd && <pre className="whitespace-pre-wrap rounded bg-[var(--line-soft)] p-3 font-sans">{l.proposal.scriptAdd}</pre>}
                  </div>
                )}
                {owner && l.status === "new" && (
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="btn-primary" disabled={busy} onClick={() => act(l.id, "apply")}>
                      Áp dụng
                    </button>
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => act(l.id, "dismiss")}>
                      Bỏ qua
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Phiếu chấm điểm v{version}</h2>
          <span className={`text-[13px] tnum ${sum === 100 ? "text-ink-2" : "text-[#df2f4a]"}`}>Tổng trọng số: {sum}/100</span>
        </div>
        <ul className="grid gap-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid gap-2 rounded border border-line p-3 sm:grid-cols-[minmax(0,1fr)_110px]">
              <input className="input font-medium" value={r.label} disabled={!owner} aria-label="Tên tiêu chí" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="number" min={0} max={100} className="input w-20 tnum" value={r.weight} disabled={!owner} aria-label={`Trọng số ${r.label}`} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) || 0 } : x)))} />%
              </label>
              <textarea className="textarea sm:col-span-2" rows={2} value={r.guide} disabled={!owner} aria-label={`Hướng dẫn chấm ${r.label}`} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, guide: e.target.value } : x)))} />
            </li>
          ))}
        </ul>
        <h3 className="mb-1 mt-5 text-[15px] font-semibold">Kịch bản gọi</h3>
        <textarea className="textarea font-mono text-[13px]" rows={14} value={text} disabled={!owner} onChange={(e) => setText(e.target.value)} aria-label="Kịch bản gọi" />
        {owner && (
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn-primary" disabled={busy || sum !== 100} onClick={save}>
              Lưu phiên bản mới
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary text-[14px] font-semibold text-white">{n}</span>
      <div>
        <b className="text-[14.5px]">{title}</b>
        <p className="text-[13.5px] text-ink-2">{text}</p>
      </div>
    </div>
  );
}
