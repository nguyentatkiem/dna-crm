"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type Msg = { role: "user" | "assistant"; content: string; actions?: string[] };

const ACTION_LABEL: Record<string, string> = { create_record: "Đã tạo bản ghi", create_task: "Đã tạo việc" };
const STORE_KEY = "crm_copilot_chat";

/** Gợi ý câu hỏi theo trang đang mở. */
function suggestionsFor(path: string, term: { contact: string; deal: string }): string[] {
  const c = term.contact.toLowerCase();
  const d = term.deal.toLowerCase();
  if (path.startsWith("/w/b/contacts")) return [`${term.contact} nào đang nóng?`, `Thêm ${c} Mai Anh 0912345678, gọi lại sau 2 ngày`, "Việc nào đang quá hạn?"];
  if (path.startsWith("/w/b/deals")) return [`5 ${d} giá trị cao nhất`, "Tỉ lệ chốt hiện tại thế nào?", "Doanh thu tháng này thế nào?"];
  if (path.startsWith("/w/b/")) return ["Doanh thu tháng này thế nào?", `${term.contact} nào đang nóng?`, "Nhắc: xác nhận lịch hẹn ngày mai sau 1 ngày"];
  if (path.startsWith("/w/telesales")) return ["Cuộc gọi 7 ngày qua thế nào?", "Ai cần gọi lại hôm nay?", `${term.contact} nào đang nóng?`];
  if (path.startsWith("/w/inbox")) return ["Có tin nhắn nào chưa đọc?", `Thêm ${c} Mai Anh 0912345678`, "Việc nào đang quá hạn?"];
  if (path.startsWith("/w/marketing")) return ["ROAS quảng cáo 30 ngày qua?", "Chiến dịch nào nên tăng ngân sách?", "Chi phí quảng cáo 7 ngày qua"];
  if (path.startsWith("/w/my-work")) return ["Việc nào đang quá hạn?", "Nhắc: gửi báo giá cho anh Nam sau 3 ngày", `${term.contact} nào đang nóng?`];
  if (path.startsWith("/w/dashboards")) return ["Doanh thu tháng này thế nào?", "ROAS quảng cáo 30 ngày qua?", "Cuộc gọi 7 ngày qua thế nào?"];
  return ["Hôm nay có việc nào quá hạn?", "Doanh thu tháng này thế nào?", `${term.contact} nào đang nóng?`, "Có tin nhắn nào chưa đọc?"];
}

/** Markdown tối giản: **đậm**, danh sách, link nội bộ [chữ](/w/...). Link ngoài chỉ hiện chữ. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const b = p.match(/^\*\*([^*]+)\*\*$/);
        if (b) return <b key={i}>{b[1]}</b>;
        const l = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (l) {
          const href = l[2];
          return href.startsWith("/") && !href.startsWith("//") ? (
            <Link key={i} href={href} className="font-medium text-primary underline-offset-2 hover:underline">
              {l[1]}
            </Link>
          ) : (
            <span key={i} className="underline decoration-dotted" title={href}>
              {l[1]}
            </span>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={blocks.length} className="my-1 list-decimal space-y-0.5 pl-5">
          {L.items.map((x, i) => (
            <li key={i}>
              <Inline text={x} />
            </li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className="my-1 list-disc space-y-0.5 pl-5 marker:text-ink-2">
          {L.items.map((x, i) => (
            <li key={i}>
              <Inline text={x} />
            </li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-•*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (!line.trim()) {
      blocks.push(<span key={blocks.length} className="block h-1.5" />);
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      <p key={blocks.length} className={h ? "mt-1 font-semibold" : ""}>
        <Inline text={h ? h[1] : line} />
      </p>,
    );
  }
  flush();
  return <div className="space-y-0.5 break-words">{blocks}</div>;
}

export function Copilot({ term }: { term: { contact: string; deal: string } }) {
  const router = useRouter();
  const path = usePathname();
  const greeting: Msg = { role: "assistant", content: `Chào bạn! Mình là **Trợ lý CRM**. Nhờ mình thêm ${term.contact.toLowerCase()}, tạo việc, tìm ${term.deal.toLowerCase()}, xem cuộc gọi, tin chưa đọc hay ROAS quảng cáo nhé.` };
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([greeting]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(-1);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null");
      if (Array.isArray(saved) && saved.length) setMsgs(saved);
    } catch {}
    const h = () => setOpen(true);
    window.addEventListener("copilot:open", h);
    return () => window.removeEventListener("copilot:open", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (msgs.length > 1) sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30)));
    } catch {}
  }, [msgs]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, open, busy]);
  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: path, messages: next.slice(1).slice(-12).map(({ role, content }) => ({ role, content })) }),
      });
      const d = await res.json().catch(() => ({}));
      setMsgs([...next, { role: "assistant", content: res.ok ? d.reply : (d.error ?? "Có lỗi, thử lại sau"), actions: d.actions }]);
      if (d.actions?.length) router.refresh();
    } catch {
      setMsgs([...next, { role: "assistant", content: "Mất kết nối tới máy chủ. Bạn thử lại sau nhé." }]);
    } finally {
      setBusy(false);
    }
  }

  async function copy(i: number) {
    try {
      await navigator.clipboard.writeText(msgs[i].content.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
      setCopied(i);
      setTimeout(() => setCopied(-1), 1500);
    } catch {}
  }

  function reset() {
    setMsgs([greeting]);
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {}
  }

  const suggestions = suggestionsFor(path, term);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="copilot"
        className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-[#323338] pl-4 pr-5 font-medium text-white shadow-lg transition hover:brightness-110 md:bottom-5 md:right-5"
        aria-label="Mở Trợ lý AI"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#a25ddc] to-[#0073ea]">
          <Icon name="spark" size={15} />
        </span>
        <span className="hidden sm:inline">Trợ lý AI</span>
      </button>
    );
  }

  return (
    <aside role="dialog" aria-label="Trợ lý CRM" className="anim-slide-up fixed inset-0 z-50 flex flex-col bg-surface shadow-lg sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[640px] sm:max-h-[calc(100vh-40px)] sm:w-[420px] sm:rounded-2xl sm:border sm:border-line-soft">
      <header className="flex flex-none items-center gap-3 border-b border-line-soft px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#a25ddc] to-[#0073ea] text-white">
          <Icon name="spark" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block">Trợ lý CRM</b>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ra lệnh bằng tiếng Việt
          </span>
        </div>
        {msgs.length > 1 && (
          <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={reset} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới">
            <Icon name="refresh" size={16} />
          </button>
        )}
        <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={() => setOpen(false)} aria-label="Đóng">
          <Icon name="x" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="anim-fade ml-auto w-fit max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="anim-fade group flex gap-2">
              <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-accent-soft text-accent">
                <Icon name="spark" size={13} />
              </span>
              <div className="min-w-0 max-w-[85%]">
                <div className="rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5 text-[14px] leading-relaxed">
                  <Markdown text={m.content} />
                  {m.actions?.map((a, j) => (
                    <span key={j} className="badge-success mt-2 mr-1">
                      <Icon name="check" size={12} /> {ACTION_LABEL[a] ?? a}
                    </span>
                  ))}
                </div>
                {i > 0 && (
                  <button type="button" onClick={() => copy(i)} className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-ink-2 opacity-70 hover:bg-hover hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    <Icon name={copied === i ? "check" : "copy"} size={12} /> {copied === i ? "Đã chép" : "Sao chép"}
                  </button>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex gap-2">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent-soft text-accent">
              <Icon name="spark" size={13} />
            </span>
            <span className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3" aria-label="Đang trả lời">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-2" style={{ animationDelay: `${d * 120}ms` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={end} />
      </div>

      {msgs.length < 3 && !busy && (
        <div className="flex-none px-4 pb-2">
          <p className="section-title mb-1.5">Gợi ý cho trang này</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line bg-surface px-3 py-1 text-left text-[12.5px] transition-colors hover:border-primary hover:bg-primary-selected">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="pb-safe flex flex-none items-end gap-2 border-t border-line-soft p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          ref={box}
          id="copilot-input"
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Nhập yêu cầu… (Shift+Enter để xuống dòng)"
          className="textarea max-h-[120px] min-h-9 resize-none py-[7px]"
          autoComplete="off"
        />
        <button className="btn-primary h-9 w-10 flex-none justify-center p-0" disabled={busy || !text.trim()} aria-label="Gửi">
          <Icon name="send" size={16} />
        </button>
      </form>
    </aside>
  );
}
