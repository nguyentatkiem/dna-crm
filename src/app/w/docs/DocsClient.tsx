"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DocDTO } from "@/lib/docs";
import { ago } from "@/lib/format";
import { Icon } from "@/components/Icon";
import type { DocTemplate } from "@/components/board/RecordDocs";

const DocEditor = dynamic(() => import("@/components/board/DocEditor").then((m) => m.DocEditor), {
  ssr: false,
  loading: () => <div className="h-[60vh] animate-pulse rounded-lg bg-surface-2" aria-label="Đang tải trình soạn thảo" />,
});

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Danh sách mọi tài liệu: tìm theo nội dung, lọc gắn khách / chung, tạo từ mẫu. */
export function DocsList({ initial, templates, boards }: { initial: DocDTO[]; templates: DocTemplate[]; boards: Record<string, string> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "record" | "general">("all");
  const [remote, setRemote] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Tìm trên máy theo tiêu đề + đoạn đầu; đồng thời hỏi server để tìm trong toàn bộ nội dung.
  useEffect(() => {
    const s = q.trim();
    if (!s) return setRemote(null);
    // Huỷ yêu cầu cũ khi gõ tiếp: kết quả về muộn không ghi đè kết quả mới.
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/docs?q=${encodeURIComponent(s)}`, { signal: ctl.signal });
        if (r.ok) setRemote(new Set(((await r.json()).docs as DocDTO[]).map((d) => d.id)));
      } catch {
        /* đã huỷ hoặc mất mạng: giữ kết quả lọc trên máy */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const list = useMemo(() => {
    const s = fold(q.trim());
    return initial.filter((d) => (kind === "all" || (kind === "record" ? !!d.recordId : !d.recordId)) && (!s || remote?.has(d.id) || fold(`${d.title} ${d.recordTitle} ${d.contentText}`).includes(s)));
  }, [initial, q, kind, remote]);

  async function create(template?: string) {
    setBusy(true);
    const r = await fetch("/api/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Không tạo được tài liệu");
    router.push(`/w/docs/${j.id}`);
  }

  const n = { all: initial.length, record: initial.filter((d) => d.recordId).length, general: initial.filter((d) => !d.recordId).length };

  return (
    <>
      <section className="mt-5">
        <h2 className="label mb-2">Tạo mới</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <button type="button" disabled={busy} onClick={() => create()} className="card flex min-h-[92px] flex-col items-start gap-1 p-3 text-left hover:border-primary">
            <span className="grid h-8 w-8 place-items-center rounded bg-primary text-white">
              <Icon name="plus" size={18} />
            </span>
            <b className="text-[14px] font-medium">Tài liệu trống</b>
          </button>
          {templates.map((t) => (
            <button key={t.key} type="button" disabled={busy} onClick={() => create(t.key)} className="card flex min-h-[92px] flex-col items-start gap-1 p-3 text-left hover:border-primary">
              <span className="grid h-8 w-8 place-items-center rounded bg-surface-2 text-primary">
                <Icon name="doc" size={17} />
              </span>
              <b className="text-[14px] font-medium">{t.title}</b>
              <span className="text-[12px] text-ink-2">{t.hint}</span>
            </button>
          ))}
        </div>
        {msg && <p className="mt-2 text-[13px] text-[#df2f4a]">{msg}</p>}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
            <input id="docs-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tiêu đề hoặc nội dung" className="input h-9 pl-8" />
          </label>
          <div className="flex gap-1" role="group" aria-label="Lọc tài liệu">
            {(
              [
                ["all", "Tất cả"],
                ["record", "Gắn khách"],
                ["general", "Chung"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`chip ${kind === k ? "chip-on" : ""}`}>
                {label} <span className="ml-1 text-ink-2 tnum">{n[k]}</span>
              </button>
            ))}
          </div>
        </div>

        {!initial.length ? (
          <div className="mt-4 rounded-lg border border-dashed border-line px-6 py-10 text-center">
            <Icon name="doc" size={24} className="mx-auto text-ink-2" />
            <p className="mt-2 font-semibold">Chưa có tài liệu nào</p>
            <p className="mt-1 text-ink-2">Chọn một mẫu ở trên để bắt đầu, hoặc mở chi tiết một khách và vào tab “Tài liệu”.</p>
          </div>
        ) : !list.length ? (
          <p className="mt-6 text-center text-ink-2">Không có tài liệu nào khớp “{q}”.</p>
        ) : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {list.map((d) => (
              <li key={d.id}>
                <a href={`/w/docs/${d.id}`} className="card grid h-full gap-1.5 p-4 hover:border-primary">
                  <span className="flex items-start gap-2">
                    <Icon name="doc" size={16} className="mt-0.5 flex-none text-primary" />
                    <b className="min-w-0 flex-1 text-[14.5px] font-medium leading-snug">{d.title}</b>
                  </span>
                  {d.contentText && <span className="line-clamp-3 text-[13px] text-ink-2">{d.contentText.replace(/\s+/g, " ").slice(0, 260)}</span>}
                  <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[12px] text-ink-2">
                    {d.recordId ? (
                      <span className="rounded-full bg-primary-selected px-2 py-0.5 text-ink">
                        {boards[d.recordObject] ?? "Mục"}: {d.recordTitle}
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5">Chung</span>
                    )}
                    <span suppressHydrationWarning>
                      Sửa {ago(d.updatedAt)}
                      {d.updatedBy ? ` · ${d.updatedBy}` : ""}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Trang soạn tài liệu toàn màn hình. */
export function DocPage({ id }: { id: string }) {
  const router = useRouter();
  return <DocEditor id={id} full onDeleted={() => router.push("/w/docs")} />;
}
