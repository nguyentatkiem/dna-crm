"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { LpBlocks } from "@/app/lp/Blocks";
import { BLOCK_LABEL, THEMES, blankBlock, slugError, themeColor, type Block, type BlockType } from "@/app/lp/model";

type Page = { id: string; title: string; slug: string; theme: string; published: boolean; views: number; conversions: number; blocks: Block[] };
const TYPES = Object.keys(BLOCK_LABEL) as BlockType[];

export function Editor({ initial, manage, origin, aiOn }: { initial: Page; manage: boolean; origin: string; aiOn: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [open, setOpen] = useState<string | null>(initial.blocks[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [addType, setAddType] = useState<BlockType>("benefits");
  const color = themeColor(p.theme);
  const url = `${origin}/lp/${p.slug}`;

  // Nhắc khi rời trang mà chưa lưu.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const patch = (x: Partial<Page>) => {
    setP((cur) => ({ ...cur, ...x }));
    setDirty(true);
  };
  const setBlock = (id: string, x: Partial<Block>) => patch({ blocks: p.blocks.map((b) => (b.id === id ? ({ ...b, ...x } as Block) : b)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= p.blocks.length) return;
    const next = [...p.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ blocks: next });
  };
  const remove = (id: string) => confirm("Xoá khối này?") && patch({ blocks: p.blocks.filter((b) => b.id !== id) });
  const add = () => {
    const b = blankBlock(addType);
    patch({ blocks: [...p.blocks, b] });
    setOpen(b.id);
  };

  async function save(extra: { published?: boolean } = {}) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/landing/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: p.title, slug: p.slug, theme: p.theme, blocks: p.blocks, ...extra }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error }), false;
    setP((cur) => ({ ...cur, blocks: j.blocks, ...(extra.published !== undefined ? { published: extra.published } : {}) }));
    setDirty(false);
    setMsg({ ok: true, text: extra.published === true ? "Đã xuất bản. Trang đã chạy công khai." : extra.published === false ? "Đã ngừng xuất bản." : "Đã lưu." });
    router.refresh();
    return true;
  }

  async function aiRewrite() {
    if (p.blocks.length && !confirm("AI sẽ viết lại toàn bộ khối theo DNA doanh nghiệp. Nội dung hiện tại sẽ bị thay (chưa lưu cho tới khi bấm Lưu). Tiếp tục?")) return;
    setBusy(true);
    const r = await fetch("/api/landing/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    patch({ blocks: j.blocks });
    setOpen(j.blocks[0]?.id ?? null);
    setMsg({ ok: true, text: j.source === "ai" ? "AI đã viết lại trang. Xem trước rồi bấm Lưu." : "Đã dựng lại theo mẫu từ DNA (chưa có ANTHROPIC_API_KEY). Xem trước rồi bấm Lưu." });
  }

  async function del() {
    if (busy || !confirm(`Xoá trang “${p.title}”? Link công khai sẽ ngừng hoạt động.`)) return;
    setBusy(true);
    const r = await fetch(`/api/landing/${p.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      setDirty(false);
      router.push("/w/landing");
      router.refresh();
      return;
    }
    setBusy(false);
    setMsg({ ok: false, text: (await r?.json().catch(() => ({})))?.error ?? "Không xoá được trang" });
  }

  const slugErr = p.slug !== initial.slug ? slugError(p.slug) : null;
  const ro = !manage;

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/landing" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <Icon name="chevron" size={14} className="rotate-90" /> Landing page
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <input className="input h-10 min-w-0 flex-1 basis-60 text-[18px] font-semibold" value={p.title} onChange={(e) => patch({ title: e.target.value })} disabled={ro} aria-label="Tên trang" maxLength={160} />
        {p.published ? <span className="badge-success">Đang chạy</span> : <span className="badge">Nháp</span>}
        {manage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline" onClick={aiRewrite} disabled={busy} title={aiOn ? "Claude viết theo DNA" : "Dựng theo mẫu từ DNA"}>
              <Icon name="spark" size={16} /> AI viết lại
            </button>
            <button type="button" className="btn-outline" onClick={() => save()} disabled={busy || !dirty || !!slugErr}>
              {dirty ? "Lưu" : "Đã lưu"}
            </button>
            <button type="button" className="btn-primary" onClick={() => save({ published: !p.published })} disabled={busy || !!slugErr}>
              <Icon name={p.published ? "pause" : "send"} size={16} /> {p.published ? "Ngừng xuất bản" : "Xuất bản"}
            </button>
          </div>
        )}
      </div>
      {msg && (
        <p role="status" className={`mt-3 rounded px-3 py-2 text-[13px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      <section className="card mt-4 grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid min-w-0 gap-1">
          <span className="label">Đường dẫn</span>
          <div className="flex min-w-0 items-center gap-1">
            <span className="hidden flex-none text-[13px] text-ink-2 sm:inline">{origin}/lp/</span>
            <input className="input min-w-0 font-mono text-[13px]" value={p.slug} onChange={(e) => patch({ slug: typingSlug(e.target.value) })} disabled={ro} aria-label="Đường dẫn" maxLength={60} />
          </div>
          {slugErr && <span className="text-[12.5px] text-danger">{slugErr}</span>}
          {p.published && !dirty && (
            <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
              <a href={`/lp/${p.slug}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Mở trang công khai
              </a>
              · Gắn UTM: <code className="break-all">{url}?utm_source=facebook&amp;utm_campaign=ten-chien-dich</code>
            </span>
          )}
        </div>
        <div className="grid gap-1">
          <span className="label">Màu chủ đạo</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} type="button" disabled={ro} onClick={() => patch({ theme: k })} title={t.label} aria-label={t.label} aria-pressed={p.theme === k} className={`h-8 w-8 rounded-full border-2 ${p.theme === k ? "border-ink" : "border-transparent"}`} style={{ background: t.color }} />
            ))}
          </div>
          <span className="text-[12.5px] text-ink-2 tnum">
            {p.views} lượt xem · {p.conversions} đăng ký · {p.views ? `${Math.round((p.conversions / p.views) * 1000) / 10}%` : "–"}
          </span>
        </div>
      </section>

      <div className="segmented mt-4 lg:hidden">
        <button type="button" aria-pressed={view === "edit"} onClick={() => setView("edit")}>
          <Icon name="edit" size={14} /> Sửa khối
        </button>
        <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>
          <Icon name="eye" size={14} /> Xem trước
        </button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className={`grid min-w-0 content-start gap-2 ${view === "preview" ? "hidden lg:grid" : ""}`}>
          {p.blocks.map((b, i) => (
            <article key={b.id} className="card overflow-hidden">
              <header className="flex items-center gap-1 px-3 py-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === b.id ? null : b.id)} aria-expanded={open === b.id}>
                  <Icon name="chevron" size={14} className={`flex-none transition-transform ${open === b.id ? "" : "-rotate-90"}`} />
                  <span className="min-w-0 truncate text-[14px] font-medium">{BLOCK_LABEL[b.type]}</span>
                  <span className="min-w-0 truncate text-[13px] text-ink-2">{summary(b)}</span>
                </button>
                {manage && (
                  <>
                    <button type="button" className="btn-ghost h-7 w-7 justify-center p-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên trên">
                      <Icon name="chevron" size={14} className="rotate-180" />
                    </button>
                    <button type="button" className="btn-ghost h-7 w-7 justify-center p-0" onClick={() => move(i, 1)} disabled={i === p.blocks.length - 1} aria-label="Xuống dưới">
                      <Icon name="chevron" size={14} />
                    </button>
                    <button type="button" className="btn-ghost h-7 w-7 justify-center p-0 text-danger" onClick={() => remove(b.id)} aria-label="Xoá khối">
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </header>
              {open === b.id && (
                <div className="grid gap-3 border-t border-line-soft p-3 anim-fade">
                  <BlockFields b={b} set={(x) => setBlock(b.id, x)} ro={ro} />
                </div>
              )}
            </article>
          ))}
          {!p.blocks.length && <p className="card px-4 py-8 text-center text-[13.5px] text-ink-2">Trang chưa có khối nào. Thêm khối bên dưới hoặc bấm “AI viết lại”.</p>}
          {manage && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select className="input w-auto min-w-0 flex-1 sm:flex-none" value={addType} onChange={(e) => setAddType(e.target.value as BlockType)} aria-label="Loại khối">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BLOCK_LABEL[t]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-outline" onClick={add}>
                <Icon name="plus" size={16} /> Thêm khối
              </button>
            </div>
          )}
          {manage && (
            <button type="button" className="btn-ghost mt-4 w-fit text-danger" onClick={del} disabled={busy}>
              <Icon name="trash" size={16} /> Xoá trang
            </button>
          )}
        </section>

        <aside className={`min-w-0 lg:sticky lg:top-4 lg:self-start ${view === "edit" ? "hidden lg:block" : ""}`}>
          <p className="section-title mb-2">Xem trước trên điện thoại</p>
          <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border-[6px] border-[#1f2430] bg-white shadow-panel">
            <div className="h-[70vh] max-h-[760px] overflow-y-auto overflow-x-hidden">
              <LpBlocks blocks={p.blocks} color={color} slug={p.slug} preview />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Chuẩn hoá khi đang gõ: bỏ dấu, chữ thường, giữ dấu gạch ở cuối để gõ tiếp được. */
const typingSlug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 60);

function summary(b: Block) {
  if (b.type === "image") return b.url ? b.url.replace(/^https?:\/\//, "") : "chưa có ảnh";
  if (b.type === "testimonial") return b.author;
  return "title" in b ? b.title : "";
}

function Field({ label, value, onChange, ro, area, max = 300, placeholder }: { label: string; value: string; onChange: (v: string) => void; ro: boolean; area?: boolean; max?: number; placeholder?: string }) {
  return (
    <label className="grid gap-1">
      <span className="label">{label}</span>
      {area ? (
        <textarea className="textarea min-h-[80px]" value={value} onChange={(e) => onChange(e.target.value)} disabled={ro} maxLength={max} placeholder={placeholder} />
      ) : (
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={ro} maxLength={max} placeholder={placeholder} />
      )}
    </label>
  );
}

function BlockFields({ b, set, ro }: { b: Block; set: (x: Partial<Block>) => void; ro: boolean }) {
  switch (b.type) {
    case "hero":
      return (
        <>
          <Field label="Tiêu đề" value={b.title} onChange={(v) => set({ title: v })} ro={ro} max={160} />
          <Field label="Mô tả" value={b.subtitle} onChange={(v) => set({ subtitle: v })} ro={ro} area max={400} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chữ trên nút" value={b.button} onChange={(v) => set({ button: v })} ro={ro} max={60} />
            <Field label="Nút dẫn tới" value={b.href} onChange={(v) => set({ href: v })} ro={ro} max={500} placeholder="#dang-ky hoặc https://…" />
          </div>
          <Field label="Ảnh (URL, không bắt buộc)" value={b.image} onChange={(v) => set({ image: v })} ro={ro} max={1000} placeholder="https://…" />
        </>
      );
    case "benefits":
      return (
        <>
          <Field label="Tiêu đề" value={b.title} onChange={(v) => set({ title: v })} ro={ro} max={160} />
          <label className="grid gap-1">
            <span className="label">Lợi ích (mỗi dòng một ý)</span>
            <textarea className="textarea min-h-[120px]" value={b.items.join("\n")} onChange={(e) => set({ items: e.target.value.split("\n").slice(0, 12) })} disabled={ro} />
          </label>
        </>
      );
    case "image":
      return (
        <>
          <Field label="Đường dẫn ảnh" value={b.url} onChange={(v) => set({ url: v })} ro={ro} max={1000} placeholder="https://…" />
          <Field label="Mô tả ảnh (cho người khiếm thị)" value={b.alt} onChange={(v) => set({ alt: v })} ro={ro} max={200} />
          <Field label="Chú thích" value={b.caption} onChange={(v) => set({ caption: v })} ro={ro} max={200} />
        </>
      );
    case "testimonial":
      return (
        <>
          <Field label="Cảm nhận" value={b.quote} onChange={(v) => set({ quote: v })} ro={ro} area max={600} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên khách" value={b.author} onChange={(v) => set({ author: v })} ro={ro} max={80} />
            <Field label="Mô tả" value={b.role} onChange={(v) => set({ role: v })} ro={ro} max={120} />
          </div>
        </>
      );
    case "form":
      return (
        <>
          <Field label="Tiêu đề" value={b.title} onChange={(v) => set({ title: v })} ro={ro} max={160} />
          <Field label="Mô tả ngắn" value={b.subtitle} onChange={(v) => set({ subtitle: v })} ro={ro} max={300} />
          <div className="grid gap-1">
            <span className="label">Ô thông tin</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
              <label className="inline-flex items-center gap-1.5 text-ink-2">
                <input type="checkbox" checked disabled /> Họ tên (bắt buộc)
              </label>
              {(["phone", "email", "note"] as const).map((k) => (
                <label key={k} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={b.fields[k]} disabled={ro} onChange={(e) => set({ fields: { ...b.fields, [k]: e.target.checked } })} />
                  {k === "phone" ? "Số điện thoại" : k === "email" ? "Email" : "Lời nhắn"}
                </label>
              ))}
            </div>
          </div>
          <Field label="Chữ trên nút gửi" value={b.button} onChange={(v) => set({ button: v })} ro={ro} max={60} />
          <Field label="Lời cảm ơn sau khi gửi" value={b.thanks} onChange={(v) => set({ thanks: v })} ro={ro} area max={400} />
        </>
      );
    case "faq":
      return (
        <>
          <Field label="Tiêu đề" value={b.title} onChange={(v) => set({ title: v })} ro={ro} max={160} />
          {b.items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded border border-line-soft p-2">
              <div className="flex items-center gap-2">
                <input className="input" value={it.q} placeholder="Câu hỏi" maxLength={200} disabled={ro} onChange={(e) => set({ items: b.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                {!ro && (
                  <button type="button" className="btn-ghost h-8 w-8 flex-none justify-center p-0 text-danger" aria-label="Xoá câu hỏi" onClick={() => set({ items: b.items.filter((_, j) => j !== i) })}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              <textarea className="textarea min-h-[60px]" value={it.a} placeholder="Câu trả lời" maxLength={800} disabled={ro} onChange={(e) => set({ items: b.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
            </div>
          ))}
          {!ro && b.items.length < 12 && (
            <button type="button" className="btn-ghost w-fit" onClick={() => set({ items: [...b.items, { q: "", a: "" }] })}>
              <Icon name="plus" size={15} /> Thêm câu hỏi
            </button>
          )}
        </>
      );
    case "cta":
      return (
        <>
          <Field label="Tiêu đề" value={b.title} onChange={(v) => set({ title: v })} ro={ro} max={160} />
          <Field label="Mô tả" value={b.subtitle} onChange={(v) => set({ subtitle: v })} ro={ro} max={300} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chữ trên nút" value={b.button} onChange={(v) => set({ button: v })} ro={ro} max={60} />
            <Field label="Nút dẫn tới" value={b.href} onChange={(v) => set({ href: v })} ro={ro} max={500} placeholder="#dang-ky hoặc https://…" />
          </div>
        </>
      );
  }
}
