"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UA } from "jssip/lib/UA";
import type { RTCSession } from "jssip/lib/RTCSession";
import { Icon } from "./Icon";
import { viMessage } from "@/lib/format";

/**
 * Softphone trên trình duyệt: JsSIP đăng ký máy nhánh qua WebSocket (WSS) của tổng đài có cổng WebRTC
 * (Stringee, OMICall, VoIP24h, Asterisk, FreeSWITCH...). Ghi âm trộn mic + giọng khách ngay tại trình duyệt.
 * JsSIP chỉ được nạp động ở trình duyệt, không chạy trên máy chủ.
 */

export type PhoneStatus = "off" | "connecting" | "ready" | "error" | "ringing" | "incoming" | "incall" | "ended";
export type EndedCall = {
  id: number;
  phone: string;
  direction: "out" | "in";
  answered: boolean;
  durationSec: number;
  recording: File | null;
  cause: string;
  suggestedOutcome: string | null;
  recordId?: string;
  recordTitle?: string;
};
export type AssistObjection = { key: string; label: string; replies: string[] };
export type AssistItem = { at: number; text: string; objections: AssistObjection[]; suggestion: string };
type Meta = { phone: string; direction: "out" | "in"; recordId?: string; recordTitle?: string };

type Ctx = {
  configured: boolean;
  status: PhoneStatus;
  error: string;
  active: Meta | null;
  startedAt: number | null;
  muted: boolean;
  held: boolean;
  incoming: (Meta & { name: string }) | null;
  ended: EndedCall | null;
  assist: AssistItem[];
  needsStt: boolean;
  call: (phone: string, meta?: { recordId?: string; recordTitle?: string }) => boolean;
  hangup: () => void;
  answer: () => void;
  reject: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  dtmf: (d: string) => void;
  consumeEnded: () => EndedCall | null;
  reconnect: () => void;
};

const SoftphoneCtx = createContext<Ctx | null>(null);
export const useSoftphone = () => useContext(SoftphoneCtx);

export const STATUS_LABEL: Record<PhoneStatus, string> = {
  off: "Chưa cấu hình",
  connecting: "Đang kết nối",
  ready: "Sẵn sàng",
  error: "Lỗi kết nối",
  ringing: "Đang đổ chuông",
  incoming: "Cuộc gọi đến",
  incall: "Đang gọi",
  ended: "Đã kết thúc",
};
const STATUS_DOT: Record<PhoneStatus, string> = {
  off: "#c4c4c4",
  connecting: "#fdab3d",
  ready: "#00c875",
  error: "#df2f4a",
  ringing: "#579bfc",
  incoming: "#579bfc",
  incall: "#df2f4a",
  ended: "#c4c4c4",
};

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
const ASSIST_EVERY = 15000;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const digits = (s: string) => s.replace(/[^\d*#+]/g, "");

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

export function SoftphoneProvider({ configured, stt, children }: { configured: boolean; stt: boolean; children: ReactNode }) {
  const [status, setStatus] = useState<PhoneStatus>(configured ? "connecting" : "off");
  const [error, setError] = useState("");
  const [active, setActive] = useState<Meta | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [incoming, setIncoming] = useState<(Meta & { name: string }) | null>(null);
  const [ended, setEnded] = useState<EndedCall | null>(null);
  const [assist, setAssist] = useState<AssistItem[]>([]);
  const [needsStt, setNeedsStt] = useState(!stt);
  const [nonce, setNonce] = useState(0);

  const ua = useRef<UA | null>(null);
  const domain = useRef("");
  const session = useRef<RTCSession | null>(null);
  const meta = useRef<Meta | null>(null);
  const confirmedAt = useRef<number | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<{ ctx: AudioContext; recorder: MediaRecorder | null; chunks: Blob[]; mime: string; assistTimer: ReturnType<typeof setTimeout> | null; assistRec: MediaRecorder | null } | null>(null);
  const history = useRef("");
  const sttOk = useRef(stt);
  const endedSeq = useRef(0);

  // ---------- Đăng ký máy nhánh ----------
  useEffect(() => {
    if (!configured) {
      setStatus("off");
      return;
    }
    let stopped = false;
    setStatus("connecting");
    setError("");
    (async () => {
      try {
        const r = await fetch("/api/calls/sip/credentials", { cache: "no-store" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Không lấy được thông tin máy nhánh");
        const c = (await r.json()) as { wsUri: string; domain: string; extension: string; password: string; displayName: string };
        const JsSIP = await import("jssip");
        if (stopped) return;
        domain.current = c.domain;
        const agent = new JsSIP.UA({
          sockets: [new JsSIP.WebSocketInterface(c.wsUri)],
          uri: `sip:${c.extension}@${c.domain}`,
          password: c.password,
          display_name: c.displayName,
          register: true,
          session_timers: false,
        });
        agent.on("connecting", () => !session.current && setStatus("connecting"));
        agent.on("registered", () => {
          setError("");
          if (!session.current) setStatus("ready");
        });
        agent.on("registrationFailed", (e) => {
          setError(`Đăng ký máy nhánh thất bại: ${e.cause ?? "không rõ"}. Kiểm tra số máy nhánh, mật khẩu, tên miền.`);
          setStatus("error");
        });
        agent.on("disconnected", () => {
          if (stopped) return;
          setError("Mất kết nối WebSocket tới tổng đài. Đang thử lại...");
          if (!session.current) setStatus("error");
        });
        agent.on("newRTCSession", (e: { originator: string; session: RTCSession }) => {
          if (e.originator !== "remote") return;
          if (session.current) {
            e.session.terminate({ status_code: 486, reason_phrase: "Busy Here" });
            return;
          }
          const phone = e.session.remote_identity?.uri?.user ?? "";
          const m: Meta = { phone, direction: "in" };
          wire(e.session, m);
          setIncoming({ ...m, name: e.session.remote_identity?.display_name || "" });
          setStatus("incoming");
          fetch(`/api/calls/lookup?phone=${encodeURIComponent(phone)}`)
            .then((x) => x.json())
            .then((j: { record?: { id: string; title: string } | null }) => {
              if (!j.record || meta.current !== m) return;
              m.recordId = j.record.id;
              m.recordTitle = j.record.title;
              setIncoming((cur) => (cur ? { ...cur, recordId: j.record!.id, recordTitle: j.record!.title, name: j.record!.title } : cur));
            })
            .catch(() => undefined);
        });
        agent.start();
        ua.current = agent;
      } catch (e) {
        if (stopped) return;
        setError(viMessage(e, "Không kết nối được tổng đài. Kiểm tra cấu hình SIP trong Cài đặt."));
        setStatus("error");
      }
    })();
    return () => {
      stopped = true;
      try {
        ua.current?.stop();
      } catch {
        // bỏ qua
      }
      ua.current = null;
    };
    // wire dùng ref, không cần theo dõi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, nonce]);

  // ---------- Ghi âm trộn mic + giọng khách ----------
  function startRecording(pc: RTCPeerConnection) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const dest = ctx.createMediaStreamDestination();
      const tracks = [...pc.getSenders().map((s) => s.track), ...pc.getReceivers().map((r) => r.track)].filter((t): t is MediaStreamTrack => !!t && t.kind === "audio");
      for (const t of tracks) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest);
      const mime = pickMime();
      if (!mime) {
        rec.current = { ctx, recorder: null, chunks: [], mime: "", assistTimer: null, assistRec: null };
        return;
      }
      const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
      const state = { ctx, recorder, chunks: [] as Blob[], mime, assistTimer: null as ReturnType<typeof setTimeout> | null, assistRec: null as MediaRecorder | null };
      recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
      recorder.start(1000);
      rec.current = state;
      if (sttOk.current) assistCycle(dest.stream, mime);
    } catch (e) {
      console.warn("[Softphone] không ghi âm được:", e);
    }
  }

  // Mỗi ~15 giây ghi một đoạn hoàn chỉnh (recorder riêng để file có đủ header) và gửi cho trợ lý.
  function assistCycle(stream: MediaStream, mime: string) {
    const st = rec.current;
    if (!st || !sttOk.current) return;
    const r = new MediaRecorder(stream, { mimeType: mime });
    const parts: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && parts.push(e.data);
    r.onstop = () => {
      const blob = new Blob(parts, { type: mime.split(";")[0] });
      if (blob.size < 2000) return;
      const fd = new FormData();
      fd.set("audio", new File([blob], "doan.webm", { type: blob.type }));
      fd.set("history", history.current.slice(-3000));
      fetch("/api/calls/assist", { method: "POST", body: fd })
        .then((x) => x.json())
        .then((j: { needsStt?: boolean; text?: string; objections?: AssistObjection[]; suggestion?: string }) => {
          if (j.needsStt) {
            sttOk.current = false;
            setNeedsStt(true);
            return;
          }
          if (!j.text) return;
          history.current += "\n" + j.text;
          setAssist((cur) => [{ at: Date.now(), text: j.text!, objections: j.objections ?? [], suggestion: j.suggestion ?? "" }, ...cur].slice(0, 10));
        })
        .catch(() => undefined);
    };
    r.start();
    st.assistRec = r;
    st.assistTimer = setTimeout(() => {
      if (r.state !== "inactive") r.stop();
      if (rec.current === st && session.current) assistCycle(stream, mime);
    }, ASSIST_EVERY);
  }

  function stopRecording(): Promise<File | null> {
    const st = rec.current;
    rec.current = null;
    if (!st) return Promise.resolve(null);
    if (st.assistTimer) clearTimeout(st.assistTimer);
    if (st.assistRec && st.assistRec.state !== "inactive") {
      st.assistRec.onstop = null;
      st.assistRec.stop();
    }
    return new Promise((resolve) => {
      const done = () => {
        st.ctx.close().catch(() => undefined);
        const blob = new Blob(st.chunks, { type: st.mime.split(";")[0] || "audio/webm" });
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        resolve(blob.size ? new File([blob], `goi-${stamp}.webm`, { type: blob.type }) : null);
      };
      if (st.recorder && st.recorder.state !== "inactive") {
        st.recorder.onstop = done;
        st.recorder.stop();
      } else done();
    });
  }

  // ---------- Gắn sự kiện cho một cuộc gọi ----------
  function wire(s: RTCSession, m: Meta) {
    session.current = s;
    meta.current = m;
    confirmedAt.current = null;
    history.current = "";
    setActive(m);
    setMuted(false);
    setHeld(false);
    setAssist([]);
    const attach = (pc: RTCPeerConnection) =>
      pc.addEventListener("track", (ev) => {
        if (remoteAudio.current) {
          remoteAudio.current.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
          remoteAudio.current.play().catch(() => undefined);
        }
      });
    if (s.connection) attach(s.connection as unknown as RTCPeerConnection);
    s.on("peerconnection", (e) => attach(e.peerconnection as unknown as RTCPeerConnection));
    s.on("progress", () => m.direction === "out" && setStatus("ringing"));
    s.on("confirmed", () => {
      confirmedAt.current = Date.now();
      setStartedAt(Date.now());
      setIncoming(null);
      setStatus("incall");
      if (s.connection) startRecording(s.connection as unknown as RTCPeerConnection);
    });
    s.on("hold", () => setHeld(true));
    s.on("unhold", () => setHeld(false));
    s.on("muted", () => setMuted(true));
    s.on("unmuted", () => setMuted(false));
    const finish = async (cause: string) => {
      if (session.current !== s) return;
      const answered = confirmedAt.current != null;
      const durationSec = answered ? Math.round((Date.now() - (confirmedAt.current ?? Date.now())) / 1000) : 0;
      session.current = null;
      setIncoming(null);
      setStartedAt(null);
      setStatus("ended");
      const recording = await stopRecording();
      if (remoteAudio.current) remoteAudio.current.srcObject = null;
      const suggestedOutcome = answered ? (durationSec > 10 ? "connected" : null) : /busy/i.test(cause) ? "busy" : "no_answer";
      if (/media access|user denied/i.test(cause)) setError("Trình duyệt chưa cho dùng micro. Bấm biểu tượng ổ khoá trên thanh địa chỉ để cho phép.");
      setEnded({ id: ++endedSeq.current, phone: m.phone, direction: m.direction, answered, durationSec, recording, cause, suggestedOutcome, recordId: m.recordId, recordTitle: m.recordTitle });
      setActive(null);
      setTimeout(() => setStatus((cur) => (cur === "ended" ? (ua.current?.isRegistered() ? "ready" : "error") : cur)), 2500);
    };
    s.on("ended", (e) => void finish(String(e.cause ?? "")));
    s.on("failed", (e) => void finish(String(e.cause ?? "")));
  }

  const call = useCallback((phone: string, extra?: { recordId?: string; recordTitle?: string }) => {
    const agent = ua.current;
    if (!agent || !agent.isRegistered() || session.current) return false;
    const num = digits(phone);
    if (!num) return false;
    setError("");
    setEnded(null);
    const m: Meta = { phone: num, direction: "out", ...extra };
    try {
      const s = agent.call(`sip:${num}@${domain.current}`, {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: ICE },
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      });
      setStatus("ringing");
      wire(s, m);
      return true;
    } catch (e) {
      setError(viMessage(e, "Không gọi được. Kiểm tra micro và kết nối tổng đài."));
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: Ctx = {
    configured,
    status,
    error,
    active,
    startedAt,
    muted,
    held,
    incoming,
    ended,
    assist,
    needsStt,
    call,
    hangup: () => {
      try {
        session.current?.terminate();
      } catch {
        // cuộc gọi đã kết thúc
      }
    },
    answer: () => {
      setEnded(null);
      session.current?.answer({ mediaConstraints: { audio: true, video: false }, pcConfig: { iceServers: ICE } });
    },
    reject: () => session.current?.terminate({ status_code: 486, reason_phrase: "Busy Here" }),
    toggleMute: () => {
      const s = session.current;
      if (!s) return;
      if (s.isMuted().audio) s.unmute({ audio: true });
      else s.mute({ audio: true });
    },
    toggleHold: () => {
      const s = session.current;
      if (!s) return;
      if (s.isOnHold().local) s.unhold();
      else s.hold();
    },
    dtmf: (d) => {
      try {
        session.current?.sendDTMF(d);
      } catch {
        // chưa kết nối
      }
    },
    consumeEnded: () => {
      const e = ended;
      setEnded(null);
      return e;
    },
    reconnect: () => setNonce((n) => n + 1),
  };

  return (
    <SoftphoneCtx.Provider value={value}>
      {children}
      <audio ref={remoteAudio} autoPlay playsInline className="hidden" />
      <IncomingPopup />
    </SoftphoneCtx.Provider>
  );
}

function IncomingPopup() {
  const sp = useSoftphone();
  if (!sp?.incoming || sp.status !== "incoming") return null;
  const i = sp.incoming;
  return (
    <div role="alertdialog" aria-label="Cuộc gọi đến" className="fixed bottom-4 right-4 z-50 w-[min(340px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-4 shadow-xl">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none animate-pulse place-items-center rounded-full bg-[#579bfc] text-white">
          <Icon name="phone" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-2">Cuộc gọi đến</p>
          <b className="block truncate text-[16px]">{i.recordTitle || i.name || "Số chưa có trong CRM"}</b>
          <p className="text-[13px] text-ink-2 tnum">{i.phone}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary justify-center gap-2 bg-[#00c875] hover:bg-[#00a862]" onClick={sp.answer}>
          <Icon name="phone" size={16} /> Nghe
        </button>
        <button type="button" className="btn-primary justify-center gap-2 bg-[#df2f4a] hover:bg-[#c4223b]" onClick={sp.reject}>
          <Icon name="hangup" size={16} /> Từ chối
        </button>
      </div>
    </div>
  );
}

export function PhoneStatusPill({ className = "" }: { className?: string }) {
  const sp = useSoftphone();
  if (!sp) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12.5px] ${className}`}>
      <span className={`h-2 w-2 rounded-full ${sp.status === "connecting" || sp.status === "ringing" || sp.status === "incoming" ? "animate-pulse" : ""}`} style={{ background: STATUS_DOT[sp.status] }} />
      {STATUS_LABEL[sp.status]}
    </span>
  );
}

/** Đồng hồ + nút điều khiển khi đang gọi bằng softphone. */
export function CallControls() {
  const sp = useSoftphone();
  const [pad, setPad] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sp?.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [sp?.startedAt]);
  if (!sp || !sp.active || !(sp.status === "ringing" || sp.status === "incall")) return null;
  const secs = sp.startedAt ? Math.max(0, Math.round((now - sp.startedAt) / 1000)) : 0;
  const btn = "flex flex-col items-center gap-1 rounded px-3 py-2 text-[12px] hover:bg-hover disabled:opacity-40";
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${sp.status === "incall" ? "animate-pulse bg-[#df2f4a]" : "animate-pulse bg-[#579bfc]"}`} />
        <b className="text-[14px]">{sp.status === "incall" ? "Đang gọi" : "Đang đổ chuông..."}</b>
        <span className="text-[13px] text-ink-2 tnum">{sp.active.phone}</span>
        <span className="ml-auto text-[20px] font-semibold tnum" aria-live="polite">
          {mmss(secs)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1 sm:justify-start">
        <button type="button" className={btn} disabled={sp.status !== "incall"} onClick={sp.toggleMute} aria-pressed={sp.muted}>
          <Icon name="mic" size={18} className={sp.muted ? "text-[#df2f4a]" : ""} />
          {sp.muted ? "Bật mic" : "Tắt mic"}
        </button>
        <button type="button" className={btn} disabled={sp.status !== "incall"} onClick={sp.toggleHold} aria-pressed={sp.held}>
          <Icon name={sp.held ? "play" : "pause"} size={18} />
          {sp.held ? "Tiếp tục" : "Giữ máy"}
        </button>
        <button type="button" className={btn} disabled={sp.status !== "incall"} onClick={() => setPad(!pad)} aria-expanded={pad}>
          <Icon name="grip" size={18} />
          Bàn phím
        </button>
        <button type="button" className="ml-auto flex items-center gap-2 rounded bg-[#df2f4a] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#c4223b]" onClick={sp.hangup}>
          <Icon name="hangup" size={17} /> Gác máy
        </button>
      </div>
      {pad && sp.status === "incall" && (
        <div className="mx-auto mt-2 grid max-w-[220px] grid-cols-3 gap-1.5">
          {"123456789*0#".split("").map((d) => (
            <button key={d} type="button" className="h-10 rounded border border-line bg-surface text-[16px] font-medium tnum hover:bg-hover" onClick={() => sp.dtmf(d)}>
              {d}
            </button>
          ))}
        </div>
      )}
      {sp.status === "incall" && !sp.needsStt && <p className="mt-2 text-[12px] text-ink-2">● Đang ghi âm tại trình duyệt · trợ lý nghe mỗi 15 giây</p>}
      {sp.status === "incall" && sp.needsStt && <p className="mt-2 text-[12px] text-ink-2">● Đang ghi âm tại trình duyệt</p>}
    </div>
  );
}
