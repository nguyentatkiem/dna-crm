"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { BOT_MODE_LABEL, type BotMode, type BotPref } from "@/lib/kb/shared";
import { DAY_SHORT, type WorkingHours } from "@/lib/chat/hours";
import { errText, kbApi, pct } from "./client-api";

type Res = { pref: BotPref; canManage: boolean; aiAvailable: boolean; workingHours: WorkingHours };
type Test = {
  gate: { go: boolean; reason?: string; handoff?: boolean };
  answer: { answer: string; sources: { id: string; title: string }[]; confidence: number; origin: string; hits: { docId: string; title: string; kind: string; confidence: number }[] };
  wouldSend: "answer" | "handoff" | "nothing";
  text: string;
  minConfidence: number;
};
const CHANNELS: [string, string][] = [
  ["messenger", "Messenger"],
  ["zalo", "Zalo"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["tiktok", "TikTok Shop"],
  ["shopee", "Shopee"],
  ["facebook", "Bình luận Facebook"],
];

export function BotTab() {
  const [res, setRes] = useState<Res | null>(null);
  const [p, setP] = useState<BotPref | null>(null);
  const [busy, setBusy] = useState("");
  const [question, setQuestion] = useState("");
  const [inHours, setInHours] = useState(false);
  const [test, setTest] = useState<Test | null>(null);

  useEffect(() => {
    kbApi<Res>("/api/kb/bot")
      .then((r) => {
        setRes(r);
        setP(r.pref);
      })
      .catch((e) => toast(errText(e), "error"));
  }, []);

  if (!res || !p) return <div className="skeleton mt-3 h-60" />;
  const ro = !res.canManage;
  const dirty = JSON.stringify(p) !== JSON.stringify(res.pref);
  const set = <K extends keyof BotPref>(k: K, v: BotPref[K]) => setP({ ...p, [k]: v });

  async function save(next?: Partial<BotPref>) {
    setBusy("save");
    try {
      const r = await kbApi<{ pref: BotPref }>("/api/kb/bot", { method: "PUT", json: { ...p, ...next } });
      setRes({ ...res!, pref: r.pref });
      setP(r.pref);
      toast(next && "enabled" in next ? (r.pref.enabled ? "Đã bật chatbot" : "Đã tắt chatbot") : "Đã lưu cài đặt chatbot");
    } catch (e) {
      toast(errText(e, "Không lưu được"), "error");
    } finally {
      setBusy("");
    }
  }
  async function runTest() {
    if (!question.trim()) return;
    setBusy("test");
    try {
      setTest(await kbApi<Test>("/api/kb/bot/test", { json: { question, inWorkingHours: inHours, pref: p } }));
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy("");
    }
  }

  const wh = res.workingHours;
  const hoursText = wh.days.length ? wh.days.map((d) => `${DAY_SHORT[d.day]} ${d.start}–${d.end}`).join(" · ") : "Cả ngày, mọi ngày (chế độ “ngoài giờ” sẽ không bao giờ chạy)";

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="card grid content-start gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-lg ${p.enabled ? "bg-success-soft text-success" : "bg-surface-2 text-ink-2"}`}>
            <Icon name="bot" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-semibold">Trợ lý tự động {res.pref.enabled ? "đang bật" : "đang tắt"}</p>
            <p className="text-[13px] text-ink-2">Chỉ trả lời khi đủ chắc chắn từ kho kiến thức; không chắc thì nhắn lời chuyển nhân viên một lần và báo cho người phụ trách.</p>
          </div>
          {!ro && (
            <button type="button" className={res.pref.enabled ? "btn-outline" : "btn-primary"} disabled={!!busy} onClick={() => save({ enabled: !res.pref.enabled })}>
              {res.pref.enabled ? "Tắt chatbot" : "Bật chatbot"}
            </button>
          )}
        </div>
        {ro && <p className="rounded bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">Bạn chỉ xem được. Cần quyền “Kho kiến thức & chatbot” để sửa.</p>}

        <fieldset disabled={ro} className="grid gap-4">
          <div className="grid gap-1.5">
            <span className="label">Khi nào bot trả lời</span>
            {(Object.keys(BOT_MODE_LABEL) as BotMode[]).map((m) => (
              <label key={m} className="flex items-center gap-2 text-[14px]">
                <input type="radio" name="bot-mode" checked={p.mode === m} onChange={() => set("mode", m)} className="accent-[var(--primary)]" /> {BOT_MODE_LABEL[m]}
              </label>
            ))}
            <p className="text-[12px] text-ink-2">
              Giờ làm việc: {hoursText}.{" "}
              <Link href="/w/inbox/settings" className="text-primary hover:underline">
                Sửa giờ làm việc
              </Link>
              . Trong giờ làm việc, hội thoại đã có người phụ trách luôn để nhân viên trả lời.
            </p>
          </div>

          <div className="grid gap-1.5">
            <span className="label">Kênh</span>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5 text-[14px]">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={p.channels.includes(k)} onChange={() => set("channels", p.channels.includes(k) ? p.channels.filter((c) => c !== k) : [...p.channels, k])} /> {l}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={p.allowComments} onChange={(e) => set("allowComments", e.target.checked)} /> Cho phép trả lời công khai dưới bình luận (không khuyến khích)
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="label">Độ chắc chắn tối thiểu: {pct(p.minConfidence)}</span>
              <input type="range" min={0.5} max={0.95} step={0.05} value={p.minConfidence} onChange={(e) => set("minConfidence", +e.target.value)} className="accent-[var(--primary)]" />
              <span className="text-[12px] text-ink-2">Cao hơn = ít trả lời nhưng chính xác hơn. Khuyên dùng 75%.</span>
            </label>
            <label className="grid gap-1">
              <span className="label">Tối đa số lần trả lời mỗi hội thoại</span>
              <input type="number" min={1} max={20} className="input w-28" value={p.maxRepliesPerConversation} onChange={(e) => set("maxRepliesPerConversation", Math.max(1, Math.min(20, Math.round(+e.target.value || 1))))} />
              <span className="text-[12px] text-ink-2">Tính lại từ đầu sau mỗi lần nhân viên trả lời.</span>
            </label>
          </div>

          <label className="grid gap-1">
            <span className="label">Từ khoá chuyển nhân viên (cách nhau dấu phẩy)</span>
            <input className="input" value={p.handoffKeywords.join(", ")} onChange={(e) => set("handoffKeywords", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
            <span className="text-[12px] text-ink-2">Khách gõ có dấu hay không dấu đều nhận ra. Khách đang bức xúc cũng luôn được chuyển cho người thật.</span>
          </label>
          <label className="grid gap-1">
            <span className="label">Lời chào (khi khách chỉ chào, chưa hỏi gì — để trống nếu không dùng)</span>
            <textarea className="textarea" rows={2} value={p.greeting} onChange={(e) => set("greeting", e.target.value)} placeholder="Dạ em chào anh/chị, em có thể giúp gì ạ?" maxLength={500} />
          </label>
          <label className="grid gap-1">
            <span className="label">Lời chuyển nhân viên</span>
            <textarea className="textarea" rows={2} value={p.handoffMessage} onChange={(e) => set("handoffMessage", e.target.value)} maxLength={500} />
          </label>
          <div className="grid gap-1">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={p.disclose} onChange={(e) => set("disclose", e.target.checked)} /> Cho khách biết đây là trả lời tự động
            </label>
            {p.disclose && <input className="input max-w-xs" value={p.disclosePrefix} onChange={(e) => set("disclosePrefix", e.target.value)} aria-label="Tiền tố trả lời tự động" maxLength={60} />}
          </div>
        </fieldset>
        {!ro && (
          <div className="flex justify-end gap-2 border-t border-line-soft pt-3">
            <button type="button" className="btn-ghost" disabled={!dirty || !!busy} onClick={() => setP(res.pref)}>
              Hoàn tác
            </button>
            <button type="button" className="btn-primary" disabled={!dirty || !!busy} onClick={() => save()}>
              {busy === "save" ? "Đang lưu…" : "Lưu cài đặt"}
            </button>
          </div>
        )}
      </section>

      <section className="card grid content-start gap-3 p-4">
        <div>
          <p className="text-[15px] font-semibold">Thử hỏi bot</p>
          <p className="text-[12.5px] text-ink-2">Gõ như khách nhắn. Chỉ xem bot sẽ trả lời gì — không gửi cho ai. Dùng cài đặt đang sửa (chưa cần lưu).</p>
        </div>
        <textarea
          className="textarea"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void runTest();
            }
          }}
          placeholder="vd. bao nhieu tien 1 buoi cham soc da vay shop"
          aria-label="Câu hỏi thử"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={inHours} onChange={(e) => setInHours(e.target.checked)} /> Giả lập trong giờ làm việc
          </label>
          <span className="flex-1" />
          <button type="button" className="btn-primary" disabled={!question.trim() || busy === "test"} onClick={runTest}>
            <Icon name="send" size={14} /> {busy === "test" ? "Đang thử…" : "Thử"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["giá chăm sóc da bao nhiêu", "shop ở đâu vậy", "mấy giờ đóng cửa", "cho em gặp nhân viên", "có bán xe máy không"].map((s) => (
            <button key={s} type="button" className="chip h-7 text-[12px]" onClick={() => setQuestion(s)}>
              {s}
            </button>
          ))}
        </div>
        {test && (
          <div className="grid gap-2 rounded-lg border border-line-soft p-3 text-[13px]">
            <p className="flex flex-wrap items-center gap-1.5">
              {test.wouldSend === "answer" ? <span className="badge-success">Bot trả lời</span> : test.wouldSend === "handoff" ? <span className="badge-warning">Chuyển nhân viên</span> : <span className="badge">Bot im lặng</span>}
              <span className="text-ink-2">
                Độ chắc chắn {pct(test.answer.confidence)} / ngưỡng {pct(test.minConfidence)}
                {test.answer.origin === "ai" ? " · Claude viết" : test.answer.origin === "kb" ? " · nguyên văn từ kho" : test.answer.origin === "greeting" ? " · lời chào" : ""}
              </span>
            </p>
            {!test.gate.go && test.gate.reason && <p className="text-ink-2">Lý do: {test.gate.reason}</p>}
            {test.text && <p className="whitespace-pre-line rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2">{test.text}</p>}
            {test.wouldSend !== "answer" && test.answer.answer && (
              <p className="text-[12.5px] text-ink-2">
                Câu trả lời ứng viên (chưa đủ chắc): <i>{test.answer.answer}</i>
              </p>
            )}
            {test.answer.hits.length > 0 && (
              <div>
                <p className="label mb-1">Mục kho tìm được</p>
                <ul className="grid gap-0.5 text-[12.5px]">
                  {test.answer.hits.map((h) => (
                    <li key={h.docId} className="flex gap-2">
                      <span className="tnum w-10 flex-none text-ink-2">{pct(h.confidence)}</span>
                      <span className="min-w-0 flex-1 truncate">{h.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!test.answer.hits.length && <p className="text-[12.5px] text-ink-2">Kho chưa có mục nào liên quan — thêm câu hỏi này vào tab Câu hỏi thường gặp.</p>}
          </div>
        )}
        {!res.aiAvailable && <p className="text-[12px] text-ink-2">Chưa có Claude API: bot gửi nguyên văn câu trả lời của mục khớp nhất (chỉ câu hỏi thường gặp và sản phẩm, không dùng tài liệu dài).</p>}
      </section>
    </div>
  );
}
