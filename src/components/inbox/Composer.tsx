"use client";

import Link from "next/link";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { color } from "@/lib/colors";
import { viMessage } from "@/lib/format";
import type { InboxItem, InboxMessage } from "@/lib/inbox-types";
import { fold, insertAt, renderQuickReply, slashToken, suggestQuick, varsFor, type QuickReplyDTO, type Topic } from "@/lib/quick-replies";
import { api, chOf } from "./shared";
import { SuggestStrip } from "@/components/kb/SuggestStrip";
import { WaTemplatePicker } from "./WaTemplatePicker";

export type ComposerMode = "reply" | "private" | "note";
export type ComposerHandle = { focus: () => void; setTarget: (m: InboxMessage | null, mode?: ComposerMode) => void; insert: (text: string) => void };

type Props = {
  conv: InboxItem;
  me: string;
  businessName: string;
  quick: QuickReplyDTO[];
  topics: Topic[];
  canManageQuick: boolean;
  /** Bình luận: gửi trả lời công khai / nhắn riêng qua API bình luận. */
  onComment?: (action: "reply" | "private_reply", text: string, messageId?: string) => Promise<boolean>;
  /** Tin nhắn thường / ghi chú đã gửi xong (để tải lại). */
  onSent: () => Promise<void>;
  /** Thêm tin tạm thời lên luồng để hiện ngay (gửi lạc quan). */
  onOptimistic?: (m: InboxMessage | null) => void;
  defaultTarget?: InboxMessage | null;
};

const SEND_NOW_KEY = "dna-inbox-quick-send-now";

/** Mẫu → văn bản cuối: thay biến, thêm link ảnh (kênh hiện chỉ gửi chữ nên ảnh gửi dạng link). */
function materialize(r: QuickReplyDTO, conv: InboxItem, me: string, biz: string) {
  const body = renderQuickReply(r.content, varsFor(conv, me, biz));
  return r.attachments.length ? `${body}\n${r.attachments.join("\n")}` : body;
}

function QuickList({ items, topics, active, onPick, onHover }: { items: QuickReplyDTO[]; topics: Topic[]; active: number; onPick: (r: QuickReplyDTO) => void; onHover?: (i: number) => void }) {
  const tmap = new Map(topics.map((t) => [t.key, t]));
  return (
    <ul className="max-h-64 overflow-y-auto" role="listbox" aria-label="Mẫu trả lời nhanh">
      {items.map((r, i) => {
        const t = tmap.get(r.topic);
        return (
          <li key={r.id} role="option" aria-selected={i === active}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHover?.(i)}
              onClick={() => onPick(r)}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left ${i === active ? "bg-primary-selected" : "hover:bg-hover"}`}
            >
              {t && <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: color(t.color).bg }} title={t.name} />}
              <span className="min-w-0 flex-1">
                {r.shortcut && <b className="mr-1.5 text-[12px] text-primary">/{r.shortcut}</b>}
                <span className="line-clamp-2 text-[13px]">{r.content}</span>
                {r.attachments.length > 0 && <span className="text-[11px] text-ink-2"> · {r.attachments.length} ảnh</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ conv, me, businessName, quick, topics, canManageQuick, onComment, onSent, onOptimistic, defaultTarget }, ref) {
  const isComment = conv.kind === "comment";
  const [mode, setMode] = useState<ComposerMode>("reply");
  const [target, setTarget] = useState<InboxMessage | null>(defaultTarget ?? null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState("");
  const [usedQuick, setUsedQuick] = useState<string | undefined>();
  const [slash, setSlash] = useState<{ query: string; start: number } | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [pq, setPq] = useState("");
  const [sendNow, setSendNow] = useState(false);
  // Kho kiến thức: câu vừa gửi (để "Thêm vào kho").
  const [lastSent, setLastSent] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);

  useEffect(() => {
    try {
      setSendNow(localStorage.getItem(SEND_NOW_KEY) === "1");
    } catch {
      // trình duyệt chặn lưu
    }
  }, []);
  useEffect(() => {
    if (!target && defaultTarget) setTarget(defaultTarget);
  }, [defaultTarget, target]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [text]);

  useImperativeHandle(ref, () => ({
    focus: () => box.current?.focus(),
    setTarget: (m, md) => {
      setTarget(m);
      if (md) setMode(md);
      setTimeout(() => box.current?.focus(), 0);
    },
    insert: (t) => {
      setText((cur) => (cur.trim() ? cur.trimEnd() + " " : "") + t);
      setTimeout(() => box.current?.focus(), 0);
    },
  }));

  const suggestions = useMemo(() => (slash ? suggestQuick(quick, slash.query, 8) : []), [slash, quick]);
  const pickerItems = useMemo(() => {
    const q = fold(pq.trim());
    return quick.filter((r) => (!topic || r.topic === topic) && (!q || fold(`${r.shortcut} ${r.content}`).includes(q)));
  }, [quick, topic, pq]);

  async function doSend(raw: string, quickId?: string) {
    const t = raw.trim();
    if (!t || sending.current) return;
    sending.current = true;
    setBusy("send");
    setErr("");
    const prevText = text;
    setText("");
    setHint("");
    try {
      if (isComment && mode !== "note") {
        if (!onComment) throw new Error("Chưa hỗ trợ trả lời bình luận");
        const okk = await onComment(mode === "private" ? "private_reply" : "reply", t, target?.id);
        if (!okk) {
          setText(prevText || t);
          return;
        }
        if (quickId) api(`/api/inbox/quick-replies/${quickId}`, { method: "POST" }).catch(() => {});
        setTarget(null);
      } else {
        // Hiện ngay trên luồng, máy chủ trả về thì tải lại thay bằng tin thật.
        onOptimistic?.({ id: `tmp-${Date.now()}`, direction: mode === "note" ? "note" : "out", kind: "message", text: t, attachments: [], author: me, status: "sending", error: "", at: new Date().toISOString(), commentId: "", parentId: "", hidden: false, liked: false });
        const r = await api<{ ok: boolean; error?: string }>(`/api/inbox/${conv.id}/messages`, { method: "POST", json: { text: t, note: mode === "note", quickReplyId: quickId } });
        if (!r.ok && r.error) setErr(r.error);
      }
      setUsedQuick(undefined);
      if (mode !== "note") setLastSent(t);
      await onSent();
      // Đã tải lại tin thật: bỏ tin tạm (phòng khi nội dung máy chủ khác, vd. có thêm chữ ký).
      onOptimistic?.(null);
    } catch (e) {
      onOptimistic?.(null);
      setText(prevText || t);
      setErr(viMessage(e, "Không gửi được, thử lại nhé"));
    } finally {
      sending.current = false;
      setBusy("");
      box.current?.focus();
    }
  }

  function pick(r: QuickReplyDTO, from: "slash" | "picker") {
    const snippet = materialize(r, conv, me, businessName);
    setPickerOpen(false);
    setSlash(null);
    if (sendNow) {
      void doSend(snippet, r.id);
      return;
    }
    if (from === "slash" && slash) {
      const caret = box.current?.selectionStart ?? text.length;
      const next = insertAt(text, slash.start, caret, snippet);
      setText(next.text);
      setTimeout(() => {
        box.current?.focus();
        box.current?.setSelectionRange(next.caret, next.caret);
      }, 0);
    } else {
      setText((cur) => (cur.trim() ? cur.trimEnd() + "\n" : "") + snippet);
      setTimeout(() => box.current?.focus(), 0);
    }
    setUsedQuick(r.id);
  }

  function onType(v: string, caret: number) {
    setText(v);
    const s = slashToken(v, caret);
    setSlash(s);
    setSlashIdx(0);
  }

  async function draft() {
    if (busy) return;
    setBusy("draft");
    setErr("");
    try {
      const r = await api<{ text: string; intentLabel: string; source: "ai" | "rule" }>(`/api/inbox/${conv.id}/draft`, { method: "POST" });
      if (mode === "note") setMode("reply");
      setText(r.text);
      setHint(r.source === "ai" ? `Claude soạn · ý định: ${r.intentLabel}. Kiểm tra lại trước khi gửi.` : `Mẫu câu theo ý định “${r.intentLabel}” (chưa có AI). Sửa phần [ ] trước khi gửi.`);
      box.current?.focus();
    } catch (e) {
      setErr(viMessage(e, "Không soạn được"));
    } finally {
      setBusy("");
    }
  }

  const ch = chOf(conv.channel);
  const MODES: [ComposerMode, string][] = isComment
    ? [
        ["reply", "Trả lời công khai"],
        ["private", "Nhắn riêng"],
        ["note", "Ghi chú nội bộ"],
      ]
    : [
        ["reply", `Trả lời qua ${ch.label}`],
        ["note", "Ghi chú nội bộ"],
      ];

  return (
    <div data-tour="inbox-composer" className={`relative border-t border-line-soft p-2.5 sm:p-3 ${mode === "note" ? "bg-warning-soft/40" : "bg-surface"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {MODES.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            aria-pressed={mode === k}
            className={`flex h-7 items-center gap-1 rounded px-2.5 text-[12.5px] ${mode === k ? (k === "note" ? "bg-warning-soft font-medium text-warning" : "bg-primary-selected font-medium text-ink") : "text-ink-2 hover:bg-hover"}`}
          >
            {k === "note" && <Icon name="lock" size={12} />}
            {k === "private" && <Icon name="chat" size={12} />}
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <div className="relative">
          <button type="button" onClick={() => setPickerOpen((v) => !v)} className="btn-ghost h-7 px-2 text-[12.5px]" aria-expanded={pickerOpen} title="Mẫu trả lời nhanh (gõ / để tìm nhanh)">
            <Icon name="bolt" size={13} /> <span className="hidden sm:inline">Mẫu nhanh</span>
          </button>
          {pickerOpen && (
            <div className="absolute bottom-9 right-0 z-30 w-[min(380px,calc(100vw-24px))] rounded-lg border border-line bg-surface p-1.5 shadow-lg">
              <input className="input mb-1.5 h-8 text-[13px]" placeholder="Tìm mẫu…" value={pq} onChange={(e) => setPq(e.target.value)} autoFocus aria-label="Tìm mẫu" />
              {topics.length > 0 && (
                <div className="mb-1.5 flex gap-1 overflow-x-auto pb-0.5">
                  {[{ key: "", name: "Tất cả", color: "gray" }, ...topics].map((t) => (
                    <button key={t.key || "all"} type="button" onClick={() => setTopic(t.key)} className={`flex h-6 flex-none items-center gap-1 rounded-full border px-2 text-[11.5px] ${topic === t.key ? "border-primary bg-primary-selected" : "border-line-soft text-ink-2 hover:bg-hover"}`}>
                      {t.key && <span className="h-2 w-2 rounded-full" style={{ background: color(t.color).bg }} />}
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              {pickerItems.length ? <QuickList items={pickerItems} topics={topics} active={-1} onPick={(r) => pick(r, "picker")} /> : <p className="px-2 py-3 text-center text-[12.5px] text-ink-2">{quick.length ? "Không có mẫu khớp." : "Chưa có mẫu trả lời nhanh."}</p>}
              <div className="mt-1 flex items-center gap-2 border-t border-line-soft px-1 pt-1.5 text-[12px]">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={sendNow}
                    onChange={(e) => {
                      setSendNow(e.target.checked);
                      try {
                        localStorage.setItem(SEND_NOW_KEY, e.target.checked ? "1" : "0");
                      } catch {
                        // bỏ qua
                      }
                    }}
                  />
                  Gửi ngay khi chọn
                </label>
                <span className="flex-1" />
                <Link href="/w/inbox/quick-replies" className="text-primary hover:underline">
                  {canManageQuick ? "Quản lý mẫu" : "Xem tất cả"}
                </Link>
              </div>
            </div>
          )}
        </div>
        {mode !== "note" && (
          <button type="button" onClick={draft} disabled={!!busy} className="btn-ghost h-7 px-2 text-[12.5px] text-primary">
            <Icon name="spark" size={13} /> <span className="hidden sm:inline">{busy === "draft" ? "Đang soạn…" : "AI soạn"}</span>
            <span className="sm:hidden">{busy === "draft" ? "…" : "AI"}</span>
          </button>
        )}
      </div>

      {isComment && mode === "reply" && target && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-[12px] text-ink-2">
          <Icon name="chat" size={12} /> Trả lời <b className="text-ink">{target.author || "bình luận"}</b>: <span className="min-w-0 flex-1 truncate">“{target.text}”</span>
          <button type="button" onClick={() => setTarget(null)} aria-label="Bỏ chọn bình luận" className="flex-none hover:text-ink">
            <Icon name="x" size={12} />
          </button>
        </div>
      )}
      {hint && text && <p className="mb-1.5 text-[11.5px] text-ink-2">{hint}</p>}
      {err && (
        <p className="mb-1.5 rounded bg-danger-soft px-2 py-1 text-[12px] text-danger" role="alert">
          {err}
        </p>
      )}

      {slash && suggestions.length > 0 && (
        <div className="absolute inset-x-2.5 bottom-[calc(100%-4px)] z-30 rounded-lg border border-line bg-surface p-1 shadow-lg sm:inset-x-3">
          <p className="px-2 pb-1 pt-0.5 text-[11px] text-ink-2">
            Mẫu nhanh · <kbd>↑</kbd>
            <kbd>↓</kbd> chọn · <kbd>Enter</kbd> {sendNow ? "gửi ngay" : "chèn"} · <kbd>Esc</kbd> đóng
          </p>
          <QuickList items={suggestions} topics={topics} active={slashIdx} onHover={setSlashIdx} onPick={(r) => pick(r, "slash")} />
        </div>
      )}

      {conv.channel === "whatsapp" && <WaTemplatePicker conversationId={conv.id} onSent={() => void onSent()} />}

      <SuggestStrip
        convId={conv.id}
        trigger={conv.lastInAt ?? conv.lastAt}
        hidden={mode === "note"}
        sentText={lastSent}
        onInsert={(t) => {
          setText(t);
          setHint("Gợi ý từ kho kiến thức — kiểm tra, sửa cho đúng khách rồi gửi.");
          setTimeout(() => box.current?.focus(), 0);
        }}
      />

      {/* Chừa chỗ cho nút Trợ lý AI nổi ở góc phải trên điện thoại. */}
      <div className="flex items-end gap-2 max-md:pr-[76px]">
        <textarea
          ref={box}
          rows={1}
          value={text}
          onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={(e) => {
            if (slash && suggestions.length) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashIdx((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
                e.preventDefault();
                pick(suggestions[slashIdx] ?? suggestions[0], "slash");
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlash(null);
                return;
              }
            }
            if (e.key === "Escape") {
              (e.target as HTMLTextAreaElement).blur();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void doSend(text, usedQuick);
            }
          }}
          onBlur={() => setTimeout(() => setSlash(null), 150)}
          placeholder={
            mode === "note"
              ? "Ghi chú chỉ đội ngũ thấy, khách không nhận được…"
              : mode === "private"
                ? "Nhắn riêng vào Messenger của người bình luận…"
                : isComment
                  ? "Trả lời công khai dưới bình luận · gõ / để chọn mẫu"
                  : "Nhập tin nhắn · gõ / để chọn mẫu · Enter gửi"
          }
          className={`textarea min-h-[40px] resize-none ${mode === "note" ? "border-warning" : ""}`}
          aria-label={mode === "note" ? "Ghi chú nội bộ" : "Tin nhắn trả lời"}
        />
        <button type="button" onClick={() => void doSend(text, usedQuick)} disabled={!text.trim() || !!busy} aria-busy={busy === "send"} className={`${mode === "note" ? "btn bg-warning text-white hover:brightness-95" : "btn-primary"} h-10 flex-none`}>
          <Icon name={mode === "note" ? "edit" : "send"} size={15} />
          <span className="hidden sm:inline">{busy === "send" ? "Đang gửi…" : mode === "note" ? "Lưu ghi chú" : "Gửi"}</span>
        </button>
      </div>
    </div>
  );
});
