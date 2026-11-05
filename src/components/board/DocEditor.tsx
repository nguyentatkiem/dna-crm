"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import type { DocDTO } from "@/lib/docs";
import { Icon } from "../Icon";

type Loaded = DocDTO & { contentJson: Record<string, unknown> };
type Save = "idle" | "dirty" | "saving" | "saved" | "error";

const PROSE = `
.doc-prose .ProseMirror{outline:none;min-height:240px;font-size:15px;line-height:1.65;color:var(--ink)}
.doc-prose .ProseMirror>*+*{margin-top:.6em}
.doc-prose h1{font-size:1.65em;font-weight:600;line-height:1.25;margin-top:.8em}
.doc-prose h2{font-size:1.3em;font-weight:600;line-height:1.3;margin-top:1em}
.doc-prose h3{font-size:1.1em;font-weight:600;margin-top:.9em}
.doc-prose ul{list-style:disc;padding-left:1.4em}
.doc-prose ol{list-style:decimal;padding-left:1.4em}
.doc-prose li>p{margin:0}
.doc-prose li+li{margin-top:.2em}
.doc-prose blockquote{border-left:3px solid var(--primary);padding:.2em 0 .2em 1em;color:var(--ink-2);background:var(--surface-2);border-radius:0 6px 6px 0}
.doc-prose code{background:var(--surface-2);border:1px solid var(--line-soft);border-radius:4px;padding:.05em .35em;font-size:.88em}
.doc-prose pre{background:#1f2235;color:#e6e8f0;border-radius:8px;padding:.8em 1em;overflow-x:auto;font-size:13px}
.doc-prose pre code{background:none;border:0;padding:0;color:inherit}
.doc-prose hr{border:0;border-top:1px solid var(--line);margin:1.2em 0}
.doc-prose a{color:var(--primary);text-decoration:underline}
.doc-prose p.is-editor-empty:first-child::before,.doc-prose .is-empty::before{content:attr(data-placeholder);color:var(--ink-2);opacity:.7;float:left;height:0;pointer-events:none}
`;

async function patchDoc(id: string, body: Record<string, unknown>, keepalive = false) {
  const r = await fetch(`/api/docs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Không lưu được");
  return (await r.json()) as DocDTO;
}

/**
 * Trình soạn thảo tài liệu (Tiptap). Tự tải tài liệu theo id, lưu tự động sau 800ms ngừng gõ.
 * immediatelyRender: false để tránh lỗi hydrate khi trang render phía server.
 */
export function DocEditor({ id, onBack, onDeleted, onSaved, full }: { id: string; onBack?: () => void; onDeleted?: () => void; onSaved?: (d: DocDTO) => void; full?: boolean }) {
  const [doc, setDoc] = useState<Loaded | null>(null);
  const [err, setErr] = useState("");
  const [title, setTitle] = useState("");
  const [state, setState] = useState<Save>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [by, setBy] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(
    async (keepalive = false) => {
      clearTimeout(timer.current);
      const body = pending.current;
      if (!Object.keys(body).length) return;
      pending.current = {};
      setState("saving");
      try {
        const d = await patchDoc(id, body, keepalive);
        setSavedAt(new Date(d.updatedAt));
        setBy(d.updatedBy);
        setState(Object.keys(pending.current).length ? "dirty" : "saved");
        onSavedRef.current?.(d);
      } catch (e) {
        pending.current = { ...body, ...pending.current };
        setState("error");
        setErr(e instanceof Error ? e.message : "Không lưu được");
      }
    },
    [id],
  );

  const schedule = useCallback(
    (part: Record<string, unknown>) => {
      pending.current = { ...pending.current, ...part };
      setState("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
        Placeholder.configure({ placeholder: "Gõ nội dung… Dùng # cho tiêu đề, - cho danh sách, > cho trích dẫn" }),
      ],
      editorProps: { attributes: { class: "doc-body", "aria-label": "Nội dung tài liệu" } },
      onUpdate: ({ editor }) => schedule({ contentJson: editor.getJSON(), contentText: editor.getText({ blockSeparator: "\n" }) }),
    },
    [id],
  );

  useEffect(() => {
    let alive = true;
    setDoc(null);
    setErr("");
    fetch(`/api/docs/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Không mở được tài liệu");
        return j as Loaded;
      })
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        setTitle(d.title);
        setSavedAt(new Date(d.updatedAt));
        setBy(d.updatedBy);
        setState("saved");
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "Không mở được tài liệu"));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (editor && doc) editor.commands.setContent(doc.contentJson, { emitUpdate: false });
  }, [editor, doc]);

  // Rời trang/đóng panel khi còn thay đổi chưa lưu → lưu ngay.
  useEffect(() => {
    const h = () => void flush(true);
    window.addEventListener("beforeunload", h);
    return () => {
      window.removeEventListener("beforeunload", h);
      void flush(true);
    };
  }, [flush]);

  async function del() {
    const r = await fetch(`/api/docs/${id}`, { method: "DELETE" });
    if (r.ok) {
      pending.current = {};
      onDeleted?.();
    } else setErr((await r.json().catch(() => ({}))).error ?? "Không xoá được");
  }

  if (err && !doc)
    return (
      <div className="rounded-lg bg-surface p-6 text-center">
        <p className="text-ink-2">{err}</p>
        {onBack && (
          <button type="button" className="btn-outline mt-3" onClick={onBack}>
            Quay lại
          </button>
        )}
      </div>
    );

  const status =
    state === "saving" ? "Đang lưu…" : state === "dirty" ? "Có thay đổi chưa lưu" : state === "error" ? `Chưa lưu được: ${err}` : savedAt ? `Đã lưu lúc ${savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}${by ? ` · ${by}` : ""}` : "";

  return (
    <div className={`doc-prose flex min-h-0 flex-col rounded-lg border border-line-soft bg-surface`}>
      <style>{PROSE}</style>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        {onBack && (
          <button type="button" className="btn-ghost h-8 px-2" onClick={() => { void flush(); onBack(); }} aria-label="Quay lại danh sách tài liệu">
            <Icon name="chevron" size={16} className="rotate-90" /> Tài liệu
          </button>
        )}
        <span className={`ml-auto text-[12.5px] ${state === "error" ? "text-[#df2f4a]" : "text-ink-2"}`} role="status" aria-live="polite" suppressHydrationWarning>
          {status}
        </span>
        {state === "error" && (
          <button type="button" className="btn-outline h-7 text-[12.5px]" onClick={() => void flush()}>
            Thử lại
          </button>
        )}
        {onDeleted &&
          (confirmDel ? (
            <span className="flex items-center gap-1 text-[13px]">
              Xoá tài liệu?
              <button type="button" className="btn h-7 bg-[#df2f4a] text-white" onClick={del}>
                Xoá
              </button>
              <button type="button" className="btn-ghost h-7" onClick={() => setConfirmDel(false)}>
                Huỷ
              </button>
            </span>
          ) : (
            <button type="button" className="btn-ghost h-8 w-8 justify-center p-0 text-[#df2f4a]" aria-label="Xoá tài liệu" onClick={() => setConfirmDel(true)}>
              <Icon name="trash" size={15} />
            </button>
          ))}
      </div>
      <div className={`px-4 pt-4 sm:px-6 ${full ? "sm:px-10 sm:pt-8" : ""}`}>
        <input
          aria-label="Tiêu đề tài liệu"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) schedule({ title: e.target.value });
          }}
          placeholder="Tiêu đề tài liệu"
          className={`w-full bg-transparent font-semibold outline-none placeholder:text-ink-2 ${full ? "text-[28px]" : "text-[20px]"}`}
          disabled={!doc}
        />
        {doc?.recordTitle && (
          <p className="mt-1 text-[12.5px] text-ink-2">
            Gắn với{" "}
            <a className="text-primary hover:underline" href={`/w/b/${doc.recordObject}?open=${doc.recordId}`}>
              {doc.recordTitle}
            </a>
          </p>
        )}
      </div>
      <Toolbar editor={editor} />
      <div className={`min-h-0 flex-1 px-4 pb-6 pt-2 sm:px-6 ${full ? "sm:px-10" : ""}`}>
        {doc && editor ? <EditorContent editor={editor} /> : <div className="h-40 animate-pulse rounded bg-surface-2" aria-label="Đang tải" />}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            ul: e.isActive("bulletList"),
            ol: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            pre: e.isActive("codeBlock"),
            undo: e.can().undo(),
            redo: e.can().redo(),
          }
        : null,
  });
  if (!editor || !s) return <div className="h-10 border-b border-line-soft" />;
  const c = () => editor.chain().focus();
  const B = ({ on, label, onClick, children, disabled }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-8 min-w-8 place-items-center rounded px-1.5 text-[13.5px] disabled:opacity-40 ${on ? "bg-primary-selected text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"}`}
    >
      {children}
    </button>
  );
  const sep = <span className="mx-0.5 h-5 w-px bg-line-soft" />;
  return (
    <div className="sticky top-0 z-10 mt-2 flex flex-wrap items-center gap-0.5 border-y border-line-soft bg-surface px-3 py-1" role="toolbar" aria-label="Định dạng">
      <B label="Tiêu đề 1" on={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}>
        <b>H1</b>
      </B>
      <B label="Tiêu đề 2" on={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <b>H2</b>
      </B>
      <B label="Tiêu đề 3" on={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <b>H3</b>
      </B>
      {sep}
      <B label="In đậm (Ctrl+B)" on={s.bold} onClick={() => c().toggleBold().run()}>
        <b>B</b>
      </B>
      <B label="In nghiêng (Ctrl+I)" on={s.italic} onClick={() => c().toggleItalic().run()}>
        <i className="font-serif">I</i>
      </B>
      <B label="Gạch ngang" on={s.strike} onClick={() => c().toggleStrike().run()}>
        <s>S</s>
      </B>
      <B label="Mã" on={s.code} onClick={() => c().toggleCode().run()}>
        <code className="text-[12px]">{"</>"}</code>
      </B>
      {sep}
      <B label="Danh sách chấm" on={s.ul} onClick={() => c().toggleBulletList().run()}>
        <span aria-hidden="true">• ≡</span>
      </B>
      <B label="Danh sách số" on={s.ol} onClick={() => c().toggleOrderedList().run()}>
        <span aria-hidden="true">1.≡</span>
      </B>
      <B label="Trích dẫn" on={s.quote} onClick={() => c().toggleBlockquote().run()}>
        <span aria-hidden="true" className="text-[17px] leading-none">❝</span>
      </B>
      <B label="Khối mã" on={s.pre} onClick={() => c().toggleCodeBlock().run()}>
        <span aria-hidden="true" className="font-mono text-[12px]">{"{ }"}</span>
      </B>
      <B label="Đường kẻ ngang" onClick={() => c().setHorizontalRule().run()}>
        <span aria-hidden="true">―</span>
      </B>
      {sep}
      <B label="Hoàn tác (Ctrl+Z)" disabled={!s.undo} onClick={() => c().undo().run()}>
        <span aria-hidden="true">↶</span>
      </B>
      <B label="Làm lại (Ctrl+Shift+Z)" disabled={!s.redo} onClick={() => c().redo().run()}>
        <span aria-hidden="true">↷</span>
      </B>
    </div>
  );
}
