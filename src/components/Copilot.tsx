"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type Msg = { role: "user" | "assistant"; content: string; actions?: string[] };

const ACTION_LABEL: Record<string, string> = { create_record: "Đã tạo bản ghi", create_task: "Đã tạo việc" };

export function Copilot({ term }: { term: { contact: string; deal: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: `Chào bạn! Mình là Trợ lý CRM. Nhờ mình thêm ${term.contact.toLowerCase()}, tạo việc, tìm ${term.deal.toLowerCase()} hoặc hỏi số liệu nhé.` }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("copilot:open", h);
    return () => window.removeEventListener("copilot:open", h);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, open]);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(next);
    setText("");
    setBusy(true);
    const res = await fetch("/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next.slice(1).map(({ role, content }) => ({ role, content })) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsgs([...next, { role: "assistant", content: res.ok ? d.reply : (d.error ?? "Có lỗi, thử lại sau"), actions: d.actions }]);
    if (d.actions?.length) router.refresh();
  }

  const suggestions = [`Thêm ${term.contact.toLowerCase()} Mai Anh 0912345678, gọi lại sau 2 ngày`, `${term.contact} nào đang nóng?`, "Doanh thu tháng này thế nào?", "Nhắc: gửi báo giá cho anh Nam sau 3 ngày"];

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-30 flex h-12 items-center gap-2 rounded-full bg-[#323338] px-5 font-medium text-white shadow-panel hover:brightness-110">
        <Icon name="spark" size={18} className="text-[#d6a8ff]" /> Trợ lý AI
      </button>
    );
  }

  return (
    <aside role="dialog" aria-label="Trợ lý CRM" className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[420px] flex-col bg-surface shadow-panel sm:bottom-5 sm:right-5 sm:top-auto sm:h-[600px] sm:max-h-[calc(100vh-40px)] sm:rounded-xl">
      <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#a25ddc] text-white">
          <Icon name="spark" size={17} />
        </span>
        <div className="flex-1">
          <b className="block">Trợ lý CRM</b>
          <span className="text-[12px] text-ink-2">Ra lệnh bằng tiếng Việt</span>
        </div>
        <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={() => setOpen(false)} aria-label="Đóng">
          <Icon name="x" />
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[14px] ${m.role === "user" ? "ml-auto rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-surface-2"}`}>
            {m.content}
            {m.actions?.map((a, j) => (
              <span key={j} className="mt-1.5 block text-[12px] font-medium text-[#00a35c]">
                ✓ {ACTION_LABEL[a] ?? a}
              </span>
            ))}
          </div>
        ))}
        {busy && <div className="w-16 animate-pulse rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[14px]">···</div>}
        <div ref={end} />
      </div>
      {msgs.length < 3 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-left text-[12.5px] hover:bg-hover">
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 border-t border-line-soft p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input id="copilot-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập yêu cầu..." className="input" autoComplete="off" />
        <button className="btn-primary h-9 w-10 justify-center p-0" disabled={busy || !text.trim()} aria-label="Gửi">
          <Icon name="send" size={16} />
        </button>
      </form>
    </aside>
  );
}
