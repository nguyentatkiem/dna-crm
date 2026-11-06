"use client";

import { Fragment, useRef, useState } from "react";
import { Avatar } from "../Avatar";

/** Ô viết cập nhật có gợi ý @tên: gõ "@" rồi vài chữ, chọn bằng chuột hoặc ↑↓ Enter. */
export function MentionTextarea({ id, value, onChange, team, placeholder, onSubmit }: { id: string; value: string; onChange: (v: string) => void; team: string[]; placeholder?: string; onSubmit?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  const matches = query ? team.filter((t) => fold(t).includes(fold(query.text))).slice(0, 6) : [];

  const detect = (v: string, caret: number) => {
    const before = v.slice(0, caret);
    const m = /(^|\s)@([\p{L}\p{N} ]{0,24})$/u.exec(before);
    if (m && !/\s{2}/.test(m[2])) {
      setQuery({ start: caret - m[2].length - 1, text: m[2] });
      setActive(0);
    } else setQuery(null);
  };

  const pick = (name: string) => {
    if (!query) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}@${name} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    const pos = query.start + name.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        id={id}
        value={value}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
        aria-controls={`${id}-mentions`}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => detect(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[active]);
              return;
            }
            if (e.key === "Escape") {
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="min-h-[84px] w-full resize-y rounded-t-lg bg-transparent px-4 py-3 text-[14px] outline-none"
      />
      {matches.length > 0 && (
        <ul id={`${id}-mentions`} role="listbox" aria-label="Nhắc tên" className="absolute left-3 top-full z-40 -mt-2 w-60 rounded-lg bg-surface p-1.5 shadow-panel">
          {matches.map((t, i) => (
            <li key={t} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(t)}
                onMouseEnter={() => setActive(i)}
                className={`flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] ${i === active ? "bg-primary-selected" : "hover:bg-hover"}`}
              >
                <Avatar name={t} size={24} /> {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Hiện nội dung cập nhật, tô đậm các @tên có trong đội. */
export function WithMentions({ text, team }: { text: string; team: string[] }) {
  const names = [...new Set(team.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!names.length || !text.includes("@")) return <>{text}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(${names.map(esc).join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > 0 && /[\p{L}\p{N}_]/u.test(text[i - 1])) continue;
    parts.push(<Fragment key={`t${i}`}>{text.slice(last, i)}</Fragment>);
    parts.push(
      <span key={`m${i}`} className="rounded bg-primary-selected px-1 font-medium text-primary">
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  parts.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}
