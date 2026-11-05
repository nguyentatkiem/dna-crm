"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { DocDTO } from "@/lib/docs";
import { ago } from "@/lib/format";
import { Icon } from "../Icon";

// Tiptap chỉ chạy phía trình duyệt.
const DocEditor = dynamic(() => import("./DocEditor").then((m) => m.DocEditor), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-lg bg-surface" aria-label="Đang tải trình soạn thảo" />,
});

export type DocTemplate = { key: string; title: string; hint: string };

/** Tab “Tài liệu” trong panel chi tiết: danh sách tài liệu gắn mục + tạo mới + soạn ngay trong panel. */
export function RecordDocs({ recordId, onCount }: { recordId: string; onCount?: (n: number) => void }) {
  const [docs, setDocs] = useState<DocDTO[] | null>(null);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/docs?recordId=${encodeURIComponent(recordId)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(j.error ?? "Không tải được tài liệu");
      setDocs([]);
      return;
    }
    setDocs(j.docs);
    setTemplates(j.templates ?? []);
    onCount?.(j.docs.length);
  }, [recordId, onCount]);

  useEffect(() => {
    setOpen(null);
    load();
  }, [load]);

  async function create(template?: string) {
    setBusy(true);
    const r = await fetch("/api/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId, template }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Không tạo được tài liệu");
    setDocs((d) => [j, ...(d ?? [])]);
    onCount?.((docs?.length ?? 0) + 1);
    setOpen(j.id);
  }

  if (open)
    return (
      <DocEditor
        id={open}
        onBack={() => {
          setOpen(null);
          load();
        }}
        onDeleted={() => {
          setOpen(null);
          load();
        }}
        onSaved={(d) => setDocs((ds) => ds?.map((x) => (x.id === d.id ? { ...x, title: d.title, updatedAt: d.updatedAt, contentText: d.contentText } : x)) ?? ds)}
      />
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => create()}>
          <Icon name="plus" size={15} /> Tài liệu trống
        </button>
        {templates.map((t) => (
          <button key={t.key} type="button" className="btn-outline h-8 text-[13px]" disabled={busy} title={t.hint} onClick={() => create(t.key)}>
            {t.title}
          </button>
        ))}
      </div>
      {msg && <p className="text-[13px] text-[#df2f4a]">{msg}</p>}
      {docs === null && <div className="h-20 animate-pulse rounded-lg bg-surface" />}
      {docs?.length === 0 && (
        <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center">
          <Icon name="doc" size={22} className="mx-auto text-ink-2" />
          <p className="mt-2 font-medium">Chưa có tài liệu nào</p>
          <p className="mt-1 text-[13px] text-ink-2">Ghi chú tư vấn, biên bản, báo giá… gắn thẳng vào mục này để cả đội cùng xem.</p>
        </div>
      )}
      {docs?.map((d) => (
        <button key={d.id} type="button" onClick={() => setOpen(d.id)} className="grid gap-1 rounded-lg border border-line-soft bg-surface px-4 py-3 text-left hover:border-line">
          <span className="flex items-center gap-2">
            <Icon name="doc" size={16} className="flex-none text-primary" />
            <b className="min-w-0 flex-1 truncate text-[14px] font-medium">{d.title}</b>
            <span className="flex-none text-[12px] text-ink-2" suppressHydrationWarning>
              {ago(d.updatedAt)}
            </span>
          </span>
          {d.contentText && <span className="line-clamp-2 text-[13px] text-ink-2">{d.contentText.replace(/\s+/g, " ").slice(0, 220)}</span>}
        </button>
      ))}
      {docs && docs.length > 0 && (
        <a href="/w/docs" className="justify-self-start text-[13px] text-primary hover:underline">
          Xem mọi tài liệu →
        </a>
      )}
    </div>
  );
}
