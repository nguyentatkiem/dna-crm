"use client";

// Dải "Gợi ý từ kho kiến thức" phía trên ô soạn tin của Hộp thư.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";

type Sug = { text: string; sources: { id: string; title: string }[]; confidence: number; origin: "ai" | "kb" };
type Res = { suggestions: Sug[]; query: string; aiAvailable: boolean; origin: string; canManageKb: boolean };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Lỗi ${r.status}`);
  return j as T;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function SuggestStrip({ convId, trigger, hidden, sentText, onInsert }: { convId: string; trigger: string; hidden?: boolean; sentText?: string; onInsert: (text: string) => void }) {
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState("");
  const [closed, setClosed] = useState(false);
  const [save, setSave] = useState<{ q: string; a: string } | null>(null);
  const [savedFor, setSavedFor] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    setClosed(false);
    setSave(null);
    const n = ++seq.current;
    post<Res>(`/api/inbox/${convId}/suggest`, {})
      .then((r) => n === seq.current && setRes(r))
      .catch(() => n === seq.current && setRes(null));
  }, [convId, trigger]);

  async function askAi() {
    if (busy) return;
    setBusy("ai");
    try {
      const r = await post<Res>(`/api/inbox/${convId}/suggest`, { ai: true });
      setRes(r);
      if (!r.suggestions.length) toast("Kho chưa có thông tin cho câu này — hãy tự trả lời rồi thêm vào kho", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không lấy được gợi ý", "error");
    } finally {
      setBusy("");
    }
  }

  function pick(s: Sug) {
    onInsert(s.text);
    if (s.sources.length) post(`/api/inbox/${convId}/suggest`, { used: s.sources.map((x) => x.id) }).catch(() => {});
  }

  async function saveFaq() {
    if (!save || busy) return;
    setBusy("save");
    try {
      await post("/api/kb", { kind: "faq", title: save.q.trim(), content: save.a.trim(), source: `inbox:${convId}` });
      toast("Đã thêm vào kho kiến thức");
      setSavedFor(save.a);
      setSave(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không lưu được", "error");
    } finally {
      setBusy("");
    }
  }

  if (hidden) return null;
  const list = res?.suggestions ?? [];
  const canSave = !!res?.canManageKb && !!sentText?.trim() && savedFor !== sentText;

  if (save)
    return (
      <div className="mb-2 rounded-lg border border-line-soft bg-surface-2 p-2 text-[12.5px]">
        <p className="mb-1 font-medium">Thêm câu trả lời vào kho kiến thức</p>
        <label className="sr-only" htmlFor="kb-save-q">
          Câu hỏi
        </label>
        <input id="kb-save-q" className="input mb-1.5 h-8 text-[13px]" value={save.q} onChange={(e) => setSave({ ...save, q: e.target.value })} placeholder="Câu hỏi của khách (viết tổng quát)" />
        <label className="sr-only" htmlFor="kb-save-a">
          Câu trả lời
        </label>
        <textarea id="kb-save-a" className="textarea mb-1.5 text-[13px]" rows={2} value={save.a} onChange={(e) => setSave({ ...save, a: e.target.value })} />
        <p className="mb-1.5 text-[11.5px] text-ink-2">Bỏ tên, SĐT, chi tiết riêng của khách này trước khi lưu — SĐT/email sẽ tự được che.</p>
        <div className="flex justify-end gap-1.5">
          <button type="button" className="btn-ghost h-7 px-2 text-[12.5px]" onClick={() => setSave(null)}>
            Huỷ
          </button>
          <button type="button" className="btn-primary h-7 px-2 text-[12.5px]" disabled={!save.q.trim() || !save.a.trim() || busy === "save"} onClick={saveFaq}>
            {busy === "save" ? "Đang lưu…" : "Lưu vào kho"}
          </button>
        </div>
      </div>
    );

  if (closed || (!list.length && !res?.aiAvailable && !canSave)) return null;

  return (
    <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[12px]" aria-label="Gợi ý từ kho kiến thức">
      <span className="flex flex-none items-center gap-1 text-ink-2" title={res?.query ? `Theo câu hỏi: “${res.query}”` : undefined}>
        <Icon name="doc" size={12} />
        <span className="hidden sm:inline">Gợi ý từ kho kiến thức</span>
        <span className="sm:hidden">Gợi ý</span>
      </span>
      {list.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => pick(s)}
          className="flex h-7 max-w-[260px] flex-none items-center gap-1 rounded-full border border-line-soft bg-surface px-2.5 hover:border-primary hover:bg-primary-selected"
          title={`${s.text}\n\nNguồn: ${s.sources.map((x) => x.title).join("; ") || "—"} · độ tin cậy ${pct(s.confidence)}${s.origin === "ai" ? " · Claude viết" : ""}`}
        >
          {s.origin === "ai" && <Icon name="spark" size={11} className="flex-none text-primary" />}
          <span className="truncate">{s.text}</span>
          <span className={`flex-none text-[10.5px] ${s.confidence >= 0.75 ? "text-success" : "text-ink-2"}`}>{pct(s.confidence)}</span>
        </button>
      ))}
      {res?.aiAvailable && (
        <button type="button" onClick={askAi} disabled={!!busy} className="flex h-7 flex-none items-center gap-1 rounded-full px-2 text-primary hover:bg-hover">
          <Icon name="spark" size={12} /> {busy === "ai" ? "Đang viết…" : list.some((s) => s.origin === "ai") ? "Viết lại" : "Claude viết theo kho"}
        </button>
      )}
      {!list.length && !res?.aiAvailable && res?.canManageKb && (
        <Link href="/w/kb" className="flex-none text-ink-2 hover:text-primary hover:underline">
          Kho chưa có câu phù hợp
        </Link>
      )}
      {canSave && (
        <button type="button" onClick={() => setSave({ q: res?.query ?? "", a: sentText ?? "" })} className="flex h-7 flex-none items-center gap-1 rounded-full px-2 text-ink-2 hover:bg-hover hover:text-ink" title="Lưu câu vừa gửi làm câu trả lời mẫu">
          <Icon name="plus" size={12} /> Thêm vào kho
        </button>
      )}
      <span className="flex-1" />
      <button type="button" onClick={() => setClosed(true)} className="flex-none rounded p-1 text-ink-2 hover:bg-hover" aria-label="Ẩn gợi ý">
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
