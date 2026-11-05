"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { color } from "@/lib/colors";
import { ago } from "@/lib/format";
import { OUTCOMES, POSITIVE, TALKED, scoreColor } from "@/lib/calls-shared";
import { CallControls, PhoneStatusPill, SoftphoneProvider, useSoftphone } from "@/components/Softphone";
import { detectObjections, objectionLibrary, type Objection, type ObjectionCtx } from "@/lib/objections";

export type QueueItem = { id: string; title: string; phone: string; score: number; reason: string; rank: number; source: string; campaign: string; attempts: number; status: string };
type CallRow = { id: string; at: string; agent: string; title: string; outcome: string; outcomeLabel: string; color: string; duration: number; ai: number | null; review: number | null; recording: boolean; direction: string };
type BoardRow = { name: string; calls: number; talked: number; positive: number; talk: number; avg: number | null; reviewed: number; talkRatio: number | null; sentiment: number | null };
export type SipView = { configured: boolean; wsUri: string; domain: string; extension: string; displayName: string; password: string };
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
  sip: SipView;
  objCtx: ObjectionCtx;
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
    <SoftphoneProvider configured={p.sip.configured} stt={p.stt}>
      <TelesalesInner {...p} />
    </SoftphoneProvider>
  );
}

function TelesalesInner(p: Props) {
  const [drawer, setDrawer] = useState(false);
  const sp = useSoftphone();
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">Telesales</h1>
          <p className="mt-1 max-w-3xl text-ink-2">Gọi theo hàng ưu tiên, ghi nhận kết quả và ghi âm. Call Analyst chấm điểm từng cuộc, quản lý chấm lại để AI học chuẩn của bạn.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <span className="chip">Hôm nay: <b className="tnum mx-1">{p.me.today}</b>cuộc</span>
          <span className="chip">Nghe máy <b className="tnum ml-1">{p.me.talked}</b></span>
          <span className="chip">Hẹn/chốt <b className="tnum ml-1">{p.me.positive}</b></span>
          <button type="button" className="btn-outline h-8 gap-2 px-3 text-[13px]" onClick={() => setDrawer(true)} aria-haspopup="dialog">
            <Icon name="headset" size={15} /> Tổng đài
            <PhoneStatusPill className="text-ink-2" />
          </button>
        </div>
      </div>
      {sp?.ended && p.tab !== "queue" && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded bg-primary-selected px-3 py-2 text-[13.5px]">
          Cuộc gọi {sp.ended.recordTitle ? `với ${sp.ended.recordTitle}` : sp.ended.phone} vừa kết thúc, chưa lưu kết quả.
          <Link href={`/w/telesales?tab=queue${sp.ended.recordId ? `&record=${sp.ended.recordId}` : ""}`} className="font-medium text-primary">
            Mở Hàng gọi để lưu
          </Link>
        </p>
      )}
      {drawer && <SipDrawer sip={p.sip} owner={p.owner} onClose={() => setDrawer(false)} />}
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

const last9 = (s: string) => s.replace(/\D/g, "").slice(-9);

type Dialer = { list: QueueItem[]; idx: number; running: boolean; done: number; connected: number; positive: number; talkSecs: number; last: string };

function Queue({ queue, script, stt, contactLabel, objCtx }: Props) {
  const router = useRouter();
  const sp = useSoftphone();
  const [sel, setSel] = useState(queue[0]?.id ?? "");
  // Giữ khách đang gọi kể cả khi danh sách được làm mới và khách đó đã rời hàng (vừa lưu cuộc gọi).
  const [pinned, setPinned] = useState<QueueItem | null>(queue[0] ?? null);
  const [dialer, setDialer] = useState<Dialer | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [dialNonce, setDialNonce] = useState(0);
  const cur = queue.find((q) => q.id === sel) ?? (pinned?.id === sel ? pinned : undefined);

  const open = (q: QueueItem) => {
    setSel(q.id);
    setPinned(q);
    setDialNonce(0);
  };

  // Cuộc gọi đến qua softphone: mở đúng khách (hoặc số lạ) để lưu kết quả.
  const inbound = sp?.active?.direction === "in" ? sp.active : sp?.ended?.direction === "in" ? sp.ended : null;
  useEffect(() => {
    if (!inbound) return;
    const hit = queue.find((q) => (inbound.recordId ? q.id === inbound.recordId : last9(q.phone) === last9(inbound.phone)));
    open(hit ?? { id: inbound.recordId ?? `in-${inbound.phone}`, title: inbound.recordTitle || inbound.phone || "Số lạ", phone: inbound.phone, score: 0, reason: "Cuộc gọi đến", rank: 0, source: "", campaign: "", attempts: 0, status: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbound?.phone, inbound?.recordId]);

  // Đếm ngược rồi tự quay số. Dừng đếm khi đang có cuộc gọi.
  useEffect(() => {
    if (count == null || paused || !dialer?.running || sp?.active) return;
    if (count <= 0) {
      setCount(null);
      setDialNonce(Date.now());
      return;
    }
    const t = setTimeout(() => setCount((c) => (c == null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count, paused, dialer?.running, sp?.active]);

  function start() {
    const list = queue.slice();
    if (!list.length) return;
    setDialer({ list, idx: 0, running: true, done: 0, connected: 0, positive: 0, talkSecs: 0, last: "" });
    setPaused(false);
    open(list[0]);
    setCount(5);
  }
  function advance(d: Dialer) {
    const idx = d.idx + 1;
    if (idx >= d.list.length) {
      setDialer({ ...d, idx, running: false });
      setCount(null);
      return;
    }
    setDialer({ ...d, idx });
    open(d.list[idx]);
    setCount(5);
  }
  function saved(outcome: string, secs: number, scoreText: string) {
    router.refresh();
    if (!dialer?.running) return;
    const talked = TALKED.has(outcome);
    advance({
      ...dialer,
      done: dialer.done + 1,
      connected: dialer.connected + (talked ? 1 : 0),
      positive: dialer.positive + (POSITIVE.has(outcome) ? 1 : 0),
      talkSecs: dialer.talkSecs + (talked ? secs : 0),
      last: `${dialer.list[dialer.idx]?.title}: ${OUTCOMES.find((o) => o.key === outcome)?.label ?? outcome}${scoreText}`,
    });
  }

  if (!queue.length && !cur)
    return (
      <div className="card mt-5 grid place-items-center gap-2 p-10 text-center">
        <Icon name="phone" size={28} className="text-ink-2" />
        <b>Hàng gọi trống</b>
        <p className="max-w-md text-ink-2">Mọi {contactLabel.toLowerCase()} có số điện thoại đều đã được gọi hoặc chưa đến hẹn gọi lại. Lead mới từ Nguồn khách sẽ tự vào đây.</p>
      </div>
    );
  const sessionIds = new Set(dialer?.list.map((q) => q.id));
  return (
    <>
      <DialerBar
        dialer={dialer}
        count={count}
        paused={paused}
        total={queue.length}
        sipReady={sp?.status === "ready"}
        onStart={start}
        onPause={() => setPaused(!paused)}
        onSkip={() => dialer && advance(dialer)}
        onStop={() => {
          if (dialer) setDialer({ ...dialer, running: false });
          setCount(null);
        }}
        onClose={() => setDialer(null)}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ol className="card max-h-[38vh] overflow-y-auto p-1.5 lg:max-h-[75vh]" aria-label="Hàng gọi">
          {(dialer?.running ? dialer.list : queue).map((q, i) => {
            const doneInSession = dialer?.running && i < dialer.idx;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => {
                    open(q);
                    if (dialer?.running) {
                      const idx = dialer.list.findIndex((x) => x.id === q.id);
                      if (idx >= 0) setDialer({ ...dialer, idx });
                      setCount(5);
                    }
                    if (window.innerWidth < 1024) document.getElementById("call-desk")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`flex w-full items-center gap-3 rounded px-2.5 py-2 text-left ${q.id === sel ? "bg-primary-selected" : "hover:bg-hover"} ${doneInSession ? "opacity-50" : ""}`}
                >
                  <span className="w-5 flex-none text-right text-[12px] text-ink-2 tnum">{doneInSession ? <Icon name="check" size={13} /> : i + 1}</span>
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
            );
          })}
        </ol>
        {cur && (
          <CallDesk
            key={cur.id}
            item={cur}
            script={script}
            stt={stt}
            objCtx={objCtx}
            auto={!!dialer?.running && sessionIds.has(cur.id)}
            dialNonce={dialNonce}
            countdown={dialer?.running ? count : null}
            onSaved={saved}
            onNext={() => {
              if (dialer?.running) return advance(dialer);
              const i = queue.findIndex((q) => q.id === cur.id);
              const next = queue[i + 1] ?? queue.find((q) => q.id !== cur.id) ?? queue[0];
              if (next) open(next);
            }}
          />
        )}
      </div>
    </>
  );
}

function DialerBar(p: {
  dialer: Dialer | null;
  count: number | null;
  paused: boolean;
  total: number;
  sipReady: boolean;
  onStart: () => void;
  onPause: () => void;
  onSkip: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const d = p.dialer;
  if (!d)
    return (
      <section className="card mt-5 flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary-selected text-primary">
          <Icon name="bolt" size={18} />
        </span>
        <div className="min-w-[200px] flex-1">
          <b className="text-[15px]">Gọi liên tục</b>
          <p className="text-[13px] text-ink-2">Tự mở khách kế tiếp, đếm ngược 5 giây rồi quay số {p.sipReady ? "qua tổng đài trên trình duyệt" : "qua ứng dụng điện thoại"}. Lưu kết quả là sang khách tiếp.</p>
        </div>
        <button type="button" className="btn-primary gap-2" disabled={!p.total} onClick={p.onStart}>
          <Icon name="play" size={15} /> Bắt đầu gọi liên tục
        </button>
      </section>
    );
  const total = d.list.length;
  const avg = d.connected ? Math.round(d.talkSecs / d.connected) : 0;
  return (
    <section className="card mt-5 grid gap-3 p-4" aria-label="Phiên gọi liên tục">
      <div className="flex flex-wrap items-center gap-3">
        <b className="text-[15px]">{d.running ? "Đang gọi liên tục" : "Kết thúc phiên gọi"}</b>
        <span className="text-[13px] text-ink-2 tnum">
          Đã gọi {d.done}/{total} phiên này
        </span>
        {d.running && p.count != null && (
          <span className="rounded bg-[#fff0d6] px-2 py-0.5 text-[13px] font-medium text-[#8a5a00] tnum" aria-live="polite">
            {p.paused ? "Đã tạm dừng" : `Tự gọi sau ${p.count}s`}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {d.running ? (
            <>
              {p.count != null && (
                <button type="button" className="btn-outline h-8 gap-1.5 px-3" onClick={p.onPause}>
                  <Icon name={p.paused ? "play" : "pause"} size={14} /> {p.paused ? "Tiếp tục" : "Tạm dừng"}
                </button>
              )}
              <button type="button" className="btn-outline h-8 px-3" onClick={p.onSkip}>
                Bỏ qua
              </button>
              <button type="button" className="btn-ghost h-8 px-3" onClick={p.onStop}>
                Dừng phiên
              </button>
            </>
          ) : (
            <button type="button" className="btn-outline h-8 px-3" onClick={p.onClose}>
              Đóng
            </button>
          )}
        </div>
      </div>
      <span className="h-2 overflow-hidden rounded bg-[var(--line-soft)]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={d.done}>
        <span className="block h-full rounded bg-primary transition-all" style={{ width: `${(d.done / Math.max(total, 1)) * 100}%` }} />
      </span>
      <div className="grid grid-cols-3 gap-2 text-center sm:max-w-md">
        <Stat label="Kết nối" value={String(d.connected)} />
        <Stat label="Hẹn/chốt" value={String(d.positive)} />
        <Stat label="TB mỗi cuộc" value={mmss(avg)} />
      </div>
      {d.last && <p className="text-[13px] text-ink-2">Vừa lưu: {d.last}</p>}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-[var(--line-soft)] px-2 py-1.5">
      <b className="block text-[18px] tnum">{value}</b>
      <span className="text-[12px] text-ink-2">{label}</span>
    </div>
  );
}

type Result = { id: string; score: { total: number; summary: string; nextAction: string; improvements: string[]; source: string } | null; sttError: string; needsTranscript: boolean };

function CallDesk({
  item,
  script,
  stt,
  objCtx,
  auto,
  dialNonce,
  countdown,
  onNext,
  onSaved,
}: {
  item: QueueItem;
  script: string;
  stt: boolean;
  objCtx: ObjectionCtx;
  auto: boolean;
  dialNonce: number;
  countdown: number | null;
  onNext: () => void;
  onSaved: (outcome: string, secs: number, scoreText: string) => void;
}) {
  const router = useRouter();
  const sp = useSoftphone();
  const [start, setStart] = useState<number | null>(null);
  const [secs, setSecs] = useState(0);
  const [outcome, setOutcome] = useState("connected");
  const [note, setNote] = useState("");
  const [callback, setCallback] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fromBrowser, setFromBrowser] = useState(false);
  const [via, setVia] = useState<{ provider: "manual" | "sip"; direction: "out" | "in" }>({ provider: "manual", direction: "out" });
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

  const mine = (x: { recordId?: string; phone: string } | null | undefined) => !!x && (x.recordId === item.id || (!!x.phone && last9(x.phone) === last9(item.phone)));
  const live = !!sp?.active && mine(sp.active) && (sp.status === "ringing" || sp.status === "incall");

  // Softphone gác máy: tự điền thời lượng, gợi ý kết quả và đính file ghi âm.
  useEffect(() => {
    if (!sp?.ended || !mine(sp.ended)) return;
    const e = sp.consumeEnded();
    if (!e) return;
    setStart(null);
    setSecs(e.durationSec);
    if (e.suggestedOutcome) setOutcome(e.suggestedOutcome);
    if (e.recording) {
      setFile(e.recording);
      setFromBrowser(true);
    }
    setVia({ provider: "sip", direction: e.direction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.ended?.id]);

  function dial() {
    setErr("");
    if (sp?.configured && sp.status === "ready" && sp.call(item.phone, { recordId: item.id, recordTitle: item.title })) return;
    window.location.href = `tel:${item.phone}`;
    setStart(Date.now());
    setSecs(0);
  }
  useEffect(() => {
    if (dialNonce) dial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialNonce]);

  const needsCallback = outcome === "callback" || outcome === "no_answer" || outcome === "busy";
  const sipOn = !!sp?.configured;

  async function submit() {
    setBusy(true);
    setErr("");
    const fd = new FormData();
    if (!item.id.startsWith("in-")) fd.set("recordId", item.id);
    fd.set("phone", item.phone);
    fd.set("outcome", outcome);
    fd.set("durationSec", String(secs));
    fd.set("note", note);
    fd.set("provider", via.provider);
    fd.set("direction", via.direction);
    if (needsCallback && callback) fd.set("callbackAt", new Date(callback).toISOString());
    if (transcript.trim()) fd.set("transcript", transcript);
    if (file) fd.set("recording", file);
    const r = await fetch("/api/calls", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được cuộc gọi");
    setStart(null);
    if (auto) return onSaved(outcome, secs, j.score ? ` · ${j.score.total} điểm` : "");
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
    <section id="call-desk" className="card grid min-w-0 content-start gap-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-3">
        <Avatar name={item.title} size={44} />
        <div className="min-w-[160px] flex-1">
          <h2 className="truncate text-[20px] font-semibold">{item.title}</h2>
          <p className="truncate text-[13px] text-ink-2">
            {item.phone} · {item.reason}
            {item.campaign && ` · ${item.campaign}`}
          </p>
        </div>
        {!live &&
          (sipOn && sp?.status === "ready" ? (
            <button type="button" onClick={dial} className="btn-primary gap-2 bg-[#00c875] hover:bg-[#00a862]">
              <Icon name="phone" size={16} /> {countdown != null ? `Gọi ngay (${countdown}s)` : "Gọi"}
            </button>
          ) : (
            <a
              href={`tel:${item.phone}`}
              onClick={() => {
                setStart(Date.now());
                setSecs(0);
              }}
              className="btn-primary gap-2 bg-[#00c875] hover:bg-[#00a862]"
            >
              <Icon name="phone" size={16} /> {countdown != null ? `Gọi ngay (${countdown}s)` : "Gọi"}
            </a>
          ))}
        {!live && (
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
        )}
      </header>
      {live && <CallControls />}
      {!sipOn && <p className="text-[12.5px] text-ink-2">Đang gọi qua ứng dụng điện thoại (tel:). Bấm &quot;Tổng đài&quot; ở trên để cấu hình gọi, ghi âm và nhận gợi ý ngay trên trình duyệt.</p>}
      {sipOn && sp?.status === "error" && <p className="rounded bg-[#ffe1e5] px-3 py-2 text-[13px] text-[#b3123a]">{sp.error || "Không kết nối được tổng đài"}. Tạm gọi qua ứng dụng điện thoại.</p>}
      {sipOn && sp?.status === "connecting" && <p className="text-[12.5px] text-ink-2">Đang kết nối tổng đài...</p>}

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="min-w-0 rounded border border-line">
          <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] font-medium" onClick={() => setShowScript(!showScript)} aria-expanded={showScript}>
            Kịch bản gọi
            <Icon name="chevron" size={15} className={showScript ? "" : "-rotate-90"} />
          </button>
          {showScript && <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-line px-3 py-2 font-sans text-[13.5px] leading-relaxed">{script}</pre>}
        </div>
        <LiveAssist objCtx={objCtx} live={live} />
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
        {fromBrowser && file ? (
          <div className="grid gap-1 text-[13.5px]">
            Ghi âm từ trình duyệt
            <span className="flex items-center gap-2 rounded border border-line px-3 py-2 text-[13px]">
              <Icon name="mic" size={15} className="text-[#df2f4a]" />
              <span className="min-w-0 flex-1 truncate">
                {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB · {mmss(secs)}
              </span>
              <button type="button" className="text-primary" onClick={() => { setFile(null); setFromBrowser(false); }}>
                Bỏ
              </button>
            </span>
            <span className="text-[12px] text-ink-2">{stt ? "Sẽ tự chép lời, tách người nói và chấm điểm." : "Chưa cấu hình chép lời: dán bản chép lời bên dưới để được chấm."}</span>
          </div>
        ) : (
          <label className="grid gap-1 text-[13.5px]">
            File ghi âm (mp3, wav, m4a)
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.amr" className="min-w-0 text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <span className="text-[12px] text-ink-2">{stt ? "Sẽ tự chép lời và chấm điểm." : "Chưa cấu hình chép lời: dán bản chép lời bên dưới để được chấm."}</span>
          </label>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-[13.5px] text-primary">Dán bản chép lời (nếu có)</summary>
        <textarea className="textarea mt-2" rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder={"NV: Dạ em chào chị...\nKH: ..."} />
      </details>
      {err && <p className="text-[13.5px] text-[#df2f4a]">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onNext} disabled={live}>
          Bỏ qua
        </button>
        <button type="button" className="btn-primary" disabled={busy || live} onClick={submit}>
          {busy ? (file ? "Đang chép lời & chấm..." : "Đang lưu...") : auto ? "Lưu & sang khách kế" : "Lưu cuộc gọi"}
        </button>
      </div>
    </section>
  );
}

/** Trợ lý xử lý từ chối: nút nhanh, gõ câu khách nói để có gợi ý tức thì, và gợi ý tự động từ giọng nói khi gọi bằng softphone. */
function LiveAssist({ objCtx, live }: { objCtx: ObjectionCtx; live: boolean }) {
  const sp = useSoftphone();
  const lib = useMemo(() => objectionLibrary(objCtx), [objCtx]);
  const [pick, setPick] = useState<string>("");
  const [said, setSaid] = useState("");
  const matched = said.trim().length >= 2 ? detectObjections(said, lib) : [];
  const shown: Objection[] = matched.length ? matched.slice(0, 2) : lib.filter((o) => o.key === pick);
  const auto = sp?.assist ?? [];
  return (
    <div className="grid min-w-0 content-start gap-2 rounded border border-line p-3">
      <div className="flex items-center gap-2">
        <Icon name="spark" size={15} className="text-primary" />
        <b className="text-[14px]">Trợ lý xử lý từ chối</b>
      </div>
      {auto.length > 0 && (
        <ul className="grid gap-1.5" aria-live="polite">
          {auto.slice(0, 2).map((a) => (
            <li key={a.at} className="rounded bg-primary-selected px-2.5 py-2 text-[13px]">
              <span className="block truncate text-[12px] text-ink-2">Nghe được: “{a.text.slice(-120)}”</span>
              {a.objections.length > 0 && <span className="mt-0.5 block text-[12px] font-medium text-[#b3123a]">Khách: {a.objections.map((o) => o.label.toLowerCase()).join(", ")}</span>}
              {a.suggestion && <span className="mt-0.5 block">💬 {a.suggestion}</span>}
            </li>
          ))}
        </ul>
      )}
      {live && sp?.needsStt && <p className="text-[12px] text-ink-2">Bật chép lời (TRANSCRIBE_BASE_URL hoặc FPT_AI_API_KEY) để có gợi ý tự động từ giọng nói.</p>}
      <input className="input" value={said} onChange={(e) => setSaid(e.target.value)} placeholder="Gõ nhanh câu khách nói, VD: đắt quá, để chị hỏi chồng" aria-label="Câu khách vừa nói" />
      <div className="flex flex-wrap gap-1">
        {lib.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={pick === o.key && !matched.length}
            onClick={() => {
              setPick(pick === o.key ? "" : o.key);
              setSaid("");
            }}
            className={`rounded px-2 py-1 text-[12px] ${pick === o.key && !matched.length ? "bg-primary text-white" : "bg-[var(--line-soft)] hover:bg-hover"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {shown.map((o) => (
        <div key={o.key} className="grid gap-1 text-[13px]">
          <b className="text-[12.5px] text-ink-2">{o.label}</b>
          {o.replies.map((r, i) => (
            <p key={i} className="rounded bg-[var(--line-soft)] px-2.5 py-1.5 leading-snug">
              {i + 1}. {r}
            </p>
          ))}
        </div>
      ))}
      {said.trim().length >= 2 && !matched.length && <p className="text-[12.5px] text-ink-2">Chưa nhận ra từ chối nào. Hãy hỏi lại khách: “Anh/chị còn băn khoăn ở điểm nào ạ?”</p>}
    </div>
  );
}

const SIP_HINTS = [
  ["Stringee", "wss://... (Stringee cấp khi bật SIP/WebRTC)"],
  ["OMICall", "wss://<tên>.omicrm.com:7443 (xem trang tổng đài)"],
  ["VoIP24h", "wss://<máy chủ>:7443"],
  ["Asterisk", "wss://<máy chủ>:8089/ws"],
  ["FreeSWITCH", "wss://<máy chủ>:7443"],
] as const;

function SipDrawer({ sip, owner, onClose }: { sip: SipView; owner: boolean; onClose: () => void }) {
  const router = useRouter();
  const sp = useSoftphone();
  const [f, setF] = useState({ wsUri: sip.wsUri, domain: sip.domain, extension: sip.extension, displayName: sip.displayName, password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  async function save() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/calls/sip", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Không lưu được");
    setMsg(j.configured ? "Đã lưu. Đang kết nối lại tổng đài..." : "Đã lưu. Cần điền đủ địa chỉ WebSocket, tên miền, máy nhánh và mật khẩu.");
    setF((x) => ({ ...x, password: "" }));
    router.refresh();
    sp?.reconnect();
  }
  const field = (k: keyof typeof f, label: string, ph: string, type = "text") => (
    <label className="grid gap-1 text-[13.5px]">
      {label}
      <input className="input" type={type} value={f[k]} disabled={!owner} placeholder={ph} autoComplete="off" onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[var(--overlay)]" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Cài đặt tổng đài" className="flex h-full w-[min(460px,100vw)] flex-col overflow-y-auto bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Icon name="headset" size={18} />
          <h2 className="flex-1 text-[17px] font-semibold">Cài đặt tổng đài</h2>
          <button type="button" className="btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="grid gap-4 p-5">
          <div className="flex items-center justify-between rounded border border-line px-3 py-2">
            <span className="text-[13.5px]">Trạng thái máy nhánh</span>
            <PhoneStatusPill />
          </div>
          {sp?.error && <p className="rounded bg-[#ffe1e5] px-3 py-2 text-[13px] text-[#b3123a]">{sp.error}</p>}
          <p className="text-[13.5px] text-ink-2">
            Gọi ngay trên trình duyệt qua tổng đài SIP có cổng WebRTC (WebSocket bảo mật WSS). Cuộc gọi được ghi âm tại trình duyệt, tự đính vào kết quả và chấm điểm.
          </p>
          {!owner && <p className="rounded bg-[#fff0d6] px-3 py-2 text-[13px] text-[#8a5a00]">Chỉ chủ workspace sửa được cấu hình tổng đài.</p>}
          {field("wsUri", "Địa chỉ WebSocket (WSS)", "wss://sip.tongdai.vn:7443")}
          {field("domain", "Tên miền SIP", "sip.tongdai.vn")}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("extension", "Máy nhánh", "101")}
            {field("password", "Mật khẩu máy nhánh", sip.password ? `Đã lưu (${sip.password}) — để trống nếu giữ` : "", "password")}
          </div>
          {field("displayName", "Tên hiển thị (không bắt buộc)", "Tên nhân viên")}
          <p className="flex gap-2 rounded bg-[var(--line-soft)] px-3 py-2 text-[12.5px] text-ink-2">
            <Icon name="lock" size={15} className="mt-0.5 flex-none" />
            Mật khẩu máy nhánh được gửi tới trình duyệt của thành viên đã đăng nhập để đăng ký với tổng đài (không lưu cache). Nên dùng máy nhánh riêng cho CRM và đổi mật khẩu khi có người nghỉ việc.
          </p>
          {owner && (
            <button type="button" className="btn-primary justify-center" disabled={busy} onClick={save}>
              {busy ? "Đang lưu..." : "Lưu & kết nối"}
            </button>
          )}
          {msg && <p className="rounded bg-primary-selected px-3 py-2 text-[13.5px]">{msg}</p>}
          <details className="text-[13px]">
            <summary className="cursor-pointer text-primary">Địa chỉ WSS thường gặp</summary>
            <ul className="mt-2 grid gap-1">
              {SIP_HINTS.map(([n, v]) => (
                <li key={n}>
                  <b>{n}:</b> <span className="text-ink-2">{v}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-ink-2">Chưa có tổng đài? Bỏ trống: nút Gọi sẽ mở ứng dụng điện thoại như cũ.</p>
          </details>
        </div>
      </aside>
    </div>
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
        <h2 className="text-[16px] font-semibold">Bảng xếp hạng 60 ngày</h2>
        <p className="mb-3 text-[13px] text-ink-2">NV nói: tỉ lệ lời nhân viên trong cuộc gọi, xanh khi 40–60% (nghe nhiều như nói). Cảm xúc KH: 0 rất tiêu cực, 50 trung lập, 100 rất tích cực.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13.5px]">
            <thead className="text-left text-[12.5px] text-ink-2">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">#</th>
                <th className="font-medium">Nhân viên</th>
                <th className="text-right font-medium">Cuộc gọi</th>
                <th className="text-right font-medium">Tỷ lệ nghe máy</th>
                <th className="text-right font-medium">Thời gian nói</th>
                <th className="text-right font-medium">Hẹn/chốt</th>
                <th className="text-right font-medium">Tỷ lệ chuyển đổi</th>
                <th className="text-right font-medium" title="Tỉ lệ thời lượng nhân viên nói. Tốt khi 40–60%">NV nói</th>
                <th className="text-right font-medium" title="Cảm xúc khách trung bình 0–100">Cảm xúc KH</th>
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
                  <td className="text-right tnum">
                    {a.talkRatio == null ? "–" : <span className={a.talkRatio >= 40 && a.talkRatio <= 60 ? "text-[#037f4c]" : "text-[#b3123a]"}>{a.talkRatio}%</span>}
                  </td>
                  <td className="text-right tnum">{a.sentiment == null ? "–" : <span style={{ color: scoreColor(a.sentiment) }}>{a.sentiment}</span>}</td>
                  <td className="text-right">
                    <ScoreDot n={a.avg} />
                  </td>
                </tr>
              ))}
              {!board.length && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-ink-2">
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
