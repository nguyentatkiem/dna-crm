"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Drawer, EmptyState, Tabs, toast } from "@/components/ui";
import { KIND_LABEL, type KbDocDTO } from "@/lib/kb/shared";
import { chunkText } from "@/lib/kb/text";
import { BotTab } from "./BotTab";
import { LearnTab } from "./LearnTab";
import { errText, kbApi } from "./client-api";

type ListRes = { items: KbDocDTO[]; canManage: boolean; aiAvailable: boolean; counts: { faq: number; docs: number; product: number } };
type Edit = { id?: string; kind: KbDocDTO["kind"]; title: string; content: string; tags: string };
const TABS = ["faq", "docs", "product", "learn", "bot"];

export function KbClient({ initialTab }: { initialTab: string }) {
  const [tab, setTabState] = useState(TABS.includes(initialTab) ? initialTab : "faq");
  const [data, setData] = useState<ListRes | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const seq = useRef(0);
  const listTab = tab === "faq" || tab === "docs" || tab === "product";

  const setTab = (t: string) => {
    setTabState(t);
    setQ("");
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", t);
      window.history.replaceState(null, "", u);
    } catch {
      // bỏ qua
    }
  };

  const load = useCallback(async () => {
    const t = listTab ? tab : "faq";
    const n = ++seq.current;
    try {
      const r = await kbApi<ListRes>(`/api/kb?tab=${t}&q=${encodeURIComponent(q.trim())}`);
      if (n === seq.current) setData(r);
    } catch (e) {
      if (n === seq.current) setData((d) => d ?? { items: [], canManage: false, aiAvailable: false, counts: { faq: 0, docs: 0, product: 0 } });
      toast(errText(e, "Không tải được kho kiến thức"), "error");
    }
  }, [tab, q, listTab]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const canManage = !!data?.canManage;

  async function save() {
    if (!edit || busy) return;
    setBusy("save");
    try {
      const body = { kind: edit.kind, title: edit.title, content: edit.content, tags: edit.tags };
      if (edit.id) await kbApi(`/api/kb/${edit.id}`, { method: "PATCH", json: body });
      else await kbApi("/api/kb", { json: body });
      toast(edit.id ? "Đã lưu" : "Đã thêm vào kho");
      setEdit(null);
      await load();
    } catch (e) {
      toast(errText(e, "Không lưu được"), "error");
    } finally {
      setBusy("");
    }
  }
  async function toggle(d: KbDocDTO) {
    setData((x) => (x ? { ...x, items: x.items.map((i) => (i.id === d.id ? { ...i, active: !d.active } : i)) } : x));
    try {
      await kbApi(`/api/kb/${d.id}`, { method: "PATCH", json: { active: !d.active } });
    } catch (e) {
      toast(errText(e), "error");
      await load();
    }
  }
  async function remove(d: KbDocDTO) {
    if (!confirm(`Xoá “${d.title}” khỏi kho kiến thức? Không khôi phục được.`)) return;
    try {
      await kbApi(`/api/kb/${d.id}`, { method: "DELETE" });
      toast("Đã xoá");
      await load();
    } catch (e) {
      toast(errText(e), "error");
    }
  }
  async function seed() {
    setBusy("seed");
    try {
      const r = await kbApi<{ created: number }>("/api/kb/seed", { json: {} });
      toast(r.created ? `Đã thêm ${r.created} mục mẫu` : "Bộ mẫu đã có sẵn");
      await load();
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy("");
    }
  }
  async function syncProducts() {
    setBusy("sync");
    try {
      const r = await kbApi<{ added: number; updated: number; removed: number }>("/api/kb/products", { json: {} });
      toast(`Đồng bộ xong: thêm ${r.added}, cập nhật ${r.updated}, bỏ ${r.removed}`);
      await load();
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy("");
    }
  }

  const items = data?.items ?? null;
  const counts = data?.counts;

  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold">Kho kiến thức</h1>
          <p className="mt-1 max-w-3xl text-ink-2">Dạy AI hiểu cửa hàng: câu hỏi thường gặp, chính sách, sản phẩm. Hộp thư dùng kho này để gợi ý câu trả lời, và chatbot trả lời khách ngoài giờ khi đủ chắc chắn.</p>
        </div>
        {canManage && tab === "faq" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={15} /> Nhập CSV
            </button>
            <a className="btn-outline" href="/api/kb/export">
              <Icon name="download" size={15} /> Xuất CSV
            </a>
            <button type="button" className="btn-primary" onClick={() => setEdit({ kind: "faq", title: "", content: "", tags: "" })}>
              <Icon name="plus" size={15} /> Thêm câu hỏi
            </button>
          </div>
        )}
        {canManage && tab === "docs" && (
          <button type="button" className="btn-primary" onClick={() => setEdit({ kind: "policy", title: "", content: "", tags: "" })}>
            <Icon name="plus" size={15} /> Thêm tài liệu
          </button>
        )}
        {canManage && tab === "product" && (
          <button type="button" className="btn-outline" onClick={syncProducts} disabled={!!busy}>
            <Icon name="refresh" size={15} /> {busy === "sync" ? "Đang đồng bộ…" : "Đồng bộ lại"}
          </button>
        )}
      </div>

      {data && !data.aiAvailable && (
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          <Icon name="spark" size={13} className="mr-1 inline" />
          Chưa cấu hình Claude API: gợi ý và chatbot dùng nguyên văn câu trả lời trong kho. Thêm ANTHROPIC_API_KEY để AI viết lại theo ngữ cảnh từng khách (vẫn chỉ dựa trên kho).
        </p>
      )}

      <Tabs
        className="mt-4"
        value={tab}
        onChange={setTab}
        items={[
          { key: "faq", label: "Câu hỏi thường gặp", count: counts?.faq },
          { key: "docs", label: "Tài liệu & chính sách", count: counts?.docs },
          { key: "product", label: "Sản phẩm", count: counts?.product },
          { key: "learn", label: "Học từ hội thoại" },
          { key: "bot", label: "Chatbot" },
        ]}
      />

      {listTab && (
        <div className="mt-3 flex items-center gap-2">
          <div className="relative w-full max-w-md">
            <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-2" />
            <input className="input pl-8" placeholder="Tìm như khách hỏi, vd. “bao nhiêu tiền”, “ở đâu”…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm trong kho" />
          </div>
          {q && <span className="text-[12.5px] text-ink-2">Xếp theo độ liên quan</span>}
        </div>
      )}

      {listTab &&
        (items === null ? (
          <div className="mt-3 grid gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
        ) : !items.length ? (
          <div className="card mt-3">
            {q ? (
              <EmptyState icon="search" title="Không tìm thấy mục phù hợp" desc="Thử cách hỏi khác, hoặc thêm câu hỏi này vào kho." compact />
            ) : tab === "faq" ? (
              <EmptyState icon="help" title="Chưa có câu hỏi thường gặp" desc="Thêm các câu khách hay hỏi: giá, địa chỉ, giờ mở cửa, đặt lịch, bảo hành… Có ít nhất 5 câu thì gợi ý và chatbot mới phát huy tác dụng." action={canManage ? { label: busy === "seed" ? "Đang nạp…" : "Nạp bộ câu hỏi mẫu theo ngành", onClick: seed } : undefined} />
            ) : tab === "docs" ? (
              <EmptyState icon="doc" title="Chưa có tài liệu" desc="Dán chính sách bảo hành, đổi trả, quy định đặt lịch… hoặc tải lên file .txt/.md. Tài liệu dài được tự chia đoạn để tìm." action={canManage ? { label: "Thêm tài liệu", onClick: () => setEdit({ kind: "policy", title: "", content: "", tags: "" }) } : undefined} />
            ) : (
              <EmptyState icon="box" title="Chưa có sản phẩm" desc="Sản phẩm đang bán trong mục Sản phẩm sẽ tự có mặt ở đây (tên, giá, mô tả, bảo hành)." action={{ label: "Mở Sản phẩm", href: "/w/products" }} />
            )}
          </div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {items.map((d) => (
              <li key={d.id} className={`card p-3 sm:p-4 ${d.active ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="text-[14.5px]">{d.title}</b>
                      {d.kind !== "faq" && <span className={d.kind === "policy" ? "badge-accent" : d.kind === "conversation" ? "badge-info" : "badge"}>{KIND_LABEL[d.kind]}</span>}
                      {d.tags.map((t) => (
                        <span key={t} className="badge">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className={`mt-1 whitespace-pre-line text-[13.5px] text-ink-2 ${tab === "docs" ? "line-clamp-3" : "line-clamp-4"}`}>{d.content}</p>
                    <p className="mt-1.5 text-[11.5px] text-ink-2">
                      {tab === "docs" && `${d.content.length.toLocaleString("vi-VN")} ký tự · ${chunkText(d.content).length} đoạn · `}
                      Dùng {d.uses} lần{d.createdBy ? ` · ${d.createdBy}` : ""}
                      {d.source.startsWith("inbox:") && (
                        <>
                          {" · "}
                          <a className="text-primary hover:underline" href={`/w/inbox?c=${d.source.slice(6)}`}>
                            Xem hội thoại gốc
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-none items-center gap-1">
                      <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2" title={tab === "product" ? "Cho AI dùng thông tin sản phẩm này" : "Bật/tắt mục này"}>
                        <input type="checkbox" checked={d.active} onChange={() => toggle(d)} className="h-4 w-4 accent-[var(--primary)]" />
                        <span className="hidden sm:inline">{tab === "product" ? "Dùng" : "Bật"}</span>
                      </label>
                      {d.kind !== "product" && (
                        <>
                          <button type="button" className="btn-ghost h-8 w-8 justify-center px-0" aria-label={`Sửa ${d.title}`} onClick={() => setEdit({ id: d.id, kind: d.kind, title: d.title, content: d.content, tags: d.tags.join(", ") })}>
                            <Icon name="edit" size={15} />
                          </button>
                          <button type="button" className="btn-ghost h-8 w-8 justify-center px-0 text-danger" aria-label={`Xoá ${d.title}`} onClick={() => remove(d)}>
                            <Icon name="trash" size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === "learn" && <LearnTab canManage={canManage} loaded={!!data} onSaved={load} />}
      {tab === "bot" && <BotTab />}

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Sửa mục" : edit?.kind === "faq" ? "Thêm câu hỏi thường gặp" : "Thêm tài liệu"}
        width={560}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
              Huỷ
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={!edit?.title.trim() || !edit?.content.trim() || busy === "save"}>
              {busy === "save" ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        }
      >
        {edit && <EditForm edit={edit} setEdit={setEdit} />}
      </Drawer>
      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </>
  );
}

function EditForm({ edit, setEdit }: { edit: Edit; setEdit: (e: Edit) => void }) {
  const isFaq = edit.kind === "faq" || edit.kind === "conversation";
  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!/\.(txt|md|markdown|csv)$/i.test(f.name) || f.size > 2_000_000) {
      toast("Chỉ nhận file .txt hoặc .md dưới 2 MB (Word: mở file, chọn tất cả, dán vào ô nội dung)", "error");
      return;
    }
    const text = await f.text();
    setEdit({ ...edit, content: text, title: edit.title || f.name.replace(/\.[^.]+$/, "") });
  }
  return (
    <div className="grid gap-3">
      {!isFaq && (
        <label className="grid gap-1">
          <span className="label">Loại</span>
          <select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Edit["kind"] })}>
            <option value="policy">Chính sách</option>
            <option value="doc">Tài liệu</option>
          </select>
        </label>
      )}
      <label className="grid gap-1">
        <span className="label">{isFaq ? "Câu hỏi của khách" : "Tiêu đề"}</span>
        <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder={isFaq ? "vd. Giá liệu trình chăm sóc da bao nhiêu?" : "vd. Chính sách đổi trả"} maxLength={300} autoFocus />
      </label>
      <label className="grid gap-1">
        <span className="label">{isFaq ? "Câu trả lời mẫu" : "Nội dung"}</span>
        <textarea className="textarea" rows={isFaq ? 5 : 14} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} placeholder={isFaq ? "Viết như đang nhắn cho khách: ghi rõ giá, điều kiện, cách đặt…" : "Dán nội dung tài liệu…"} />
      </label>
      {!isFaq && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <Icon name="upload" size={14} />
          <span>Hoặc tải file .txt / .md:</span>
          <input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={(e) => onFile(e.target.files?.[0])} className="text-[12.5px]" />
        </label>
      )}
      <label className="grid gap-1">
        <span className="label">Thẻ (cách nhau dấu phẩy)</span>
        <input className="input" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder="giá, đặt lịch" />
      </label>
      <p className="text-[12px] text-ink-2">AI chỉ dùng đúng thông tin trong kho. Ghi giá, giờ, điều kiện thật cụ thể để bot trả lời chính xác; không ghi thông tin riêng của khách.</p>
    </div>
  );
}

function ImportDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const r = await kbApi<{ created: number; skipped: number }>("/api/kb/import", { json: { text } });
      toast(`Đã nhập ${r.created} câu${r.skipped ? `, bỏ qua ${r.skipped} câu đã có` : ""}`);
      setText("");
      onClose();
      await onDone();
    } catch (e) {
      toast(errText(e, "Không nhập được"), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Nhập câu hỏi thường gặp"
      subtitle="CSV hoặc dán từ Excel: cột Câu hỏi, Trả lời, Thẻ"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="btn-primary" disabled={!text.trim() || busy} onClick={go}>
            {busy ? "Đang nhập…" : "Nhập"}
          </button>
        </div>
      }
    >
      <div className="grid gap-3">
        <input type="file" accept=".csv,.txt,text/csv" onChange={async (e) => setText((await e.target.files?.[0]?.text()) ?? "")} className="text-[13px]" aria-label="Chọn file CSV" />
        <textarea className="textarea font-mono text-[12.5px]" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Câu hỏi,Trả lời,Thẻ\nGiá bao nhiêu?,Dạ giá 350.000đ/buổi ạ,giá"} aria-label="Nội dung CSV" />
        <p className="text-[12px] text-ink-2">Câu hỏi trùng với câu đã có sẽ được bỏ qua. Tải mẫu bằng nút Xuất CSV.</p>
      </div>
    </Drawer>
  );
}
