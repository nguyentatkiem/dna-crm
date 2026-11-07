"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState, toast } from "@/components/ui";
import { errText, kbApi } from "./client-api";

type Cand = { id: string; name: string; channel: string; status: string; tags: string[]; orderMarked: boolean; lastAt: string; messages: number; learned: boolean };
type Pair = { question: string; answer: string; conversationId: string; keep: boolean };

export function LearnTab({ canManage, loaded, onSaved }: { canManage: boolean; loaded: boolean; onSaved: () => Promise<void> }) {
  const [items, setItems] = useState<Cand[] | null>(null);
  const [aiAvailable, setAi] = useState(false);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [origin, setOrigin] = useState<"ai" | "rule">("rule");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!canManage) return;
    try {
      const r = await kbApi<{ items: Cand[]; aiAvailable: boolean }>(`/api/kb/learn?all=${all ? 1 : 0}&q=${encodeURIComponent(q.trim())}`);
      setItems(r.items);
      setAi(r.aiAvailable);
    } catch (e) {
      setItems([]);
      toast(errText(e), "error");
    }
  }, [all, q, canManage]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  if (!loaded) return <div className="skeleton mt-3 h-40" />;
  if (!canManage) return <div className="card mt-3"><EmptyState icon="lock" title="Cần quyền “Kho kiến thức & chatbot”" desc="Nhờ quản lý cấp quyền để rút câu hỏi–đáp từ hội thoại." compact /></div>;

  async function extract() {
    setBusy("extract");
    try {
      const r = await kbApi<{ pairs: Omit<Pair, "keep">[]; origin: "ai" | "rule" }>("/api/kb/learn", { json: { ids: [...sel] } });
      setPairs(r.pairs.map((p) => ({ ...p, keep: true })));
      setOrigin(r.origin);
      if (!r.pairs.length) toast("Không tìm thấy cặp hỏi–đáp rõ ràng trong các hội thoại này", "info");
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy("");
    }
  }
  async function saveAll() {
    if (!pairs) return;
    const keep = pairs.filter((p) => p.keep && p.question.trim() && p.answer.trim());
    if (!keep.length) return;
    setBusy("save");
    try {
      const r = await kbApi<{ created: number }>("/api/kb/bulk", { json: { items: keep.map((p) => ({ kind: "conversation", title: p.question.trim(), content: p.answer.trim(), source: `inbox:${p.conversationId}` })) } });
      toast(`Đã lưu ${r.created} cặp hỏi–đáp vào kho`);
      setPairs(null);
      setSel(new Set());
      await Promise.all([load(), onSaved()]);
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy("");
    }
  }

  if (pairs)
    return (
      <div className="mt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setPairs(null)}>
            <Icon name="chevron" size={15} className="rotate-90" /> Chọn lại hội thoại
          </button>
          <p className="flex-1 text-[13px] text-ink-2">
            {origin === "ai" ? "Claude đã rút và viết tổng quát" : "Ghép câu hỏi của khách với câu trả lời kế tiếp của nhân viên"} · SĐT, email, địa chỉ đã được che. Sửa cho tổng quát (bỏ tên, lịch riêng của khách) rồi lưu.
          </p>
          <button type="button" className="btn-primary" disabled={busy === "save" || !pairs.some((p) => p.keep)} onClick={saveAll}>
            {busy === "save" ? "Đang lưu…" : `Lưu ${pairs.filter((p) => p.keep).length} mục vào kho`}
          </button>
        </div>
        {!pairs.length ? (
          <div className="card">
            <EmptyState icon="chat" title="Không có cặp hỏi–đáp nào" desc="Các hội thoại đã chọn chưa có câu hỏi rõ ràng kèm câu trả lời của nhân viên." compact />
          </div>
        ) : (
          <ul className="grid gap-2">
            {pairs.map((p, i) => (
              <li key={i} className={`card grid gap-2 p-3 ${p.keep ? "" : "opacity-60"}`}>
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <input type="checkbox" checked={p.keep} onChange={() => setPairs(pairs.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} className="h-4 w-4 accent-[var(--primary)]" />
                  Lưu cặp này
                </label>
                <input className="input" value={p.question} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} aria-label="Câu hỏi" />
                <textarea className="textarea" rows={3} value={p.answer} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} aria-label="Câu trả lời" />
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  return (
    <div className="mt-3">
      <p className="mb-3 max-w-3xl text-[13px] text-ink-2">
        Chọn hội thoại đã chăm sóc tốt (đã xong, đã gắn thẻ hoặc đã chốt đơn). {aiAvailable ? "Claude sẽ rút các cặp câu hỏi – câu trả lời dùng lại được" : "Hệ thống ghép câu hỏi của khách với câu trả lời kế tiếp của nhân viên"}; bạn duyệt trước khi lưu. Thông tin cá nhân được che trước khi xử lý.
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Tìm theo tên khách…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm hội thoại" />
        <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /> Gồm cả hội thoại chưa xong
        </label>
        <span className="flex-1" />
        <button type="button" className="btn-primary" disabled={!sel.size || busy === "extract"} onClick={extract}>
          <Icon name="spark" size={15} /> {busy === "extract" ? "Đang rút…" : `Rút hỏi–đáp (${sel.size})`}
        </button>
      </div>
      {items === null ? (
        <div className="skeleton h-40" />
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon="inbox" title="Chưa có hội thoại phù hợp" desc="Đánh dấu Xong hoặc gắn thẻ cho hội thoại chăm sóc tốt trong Hộp thư, rồi quay lại đây." action={{ label: "Mở Hộp thư", href: "/w/inbox" }} compact />
        </div>
      ) : (
        <ul className="card divide-y divide-line-soft">
          {items.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-hover">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={sel.has(c.id)}
                  onChange={() => {
                    const n = new Set(sel);
                    if (n.has(c.id)) n.delete(c.id);
                    else if (n.size < 20) n.add(c.id);
                    else toast("Tối đa 20 hội thoại mỗi lần", "info");
                    setSel(n);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <b className="text-[14px]">{c.name}</b>
                  <span className="ml-2 text-[12px] text-ink-2">
                    {c.channel} · {c.messages} tin · {new Date(c.lastAt).toLocaleDateString("vi-VN")}
                  </span>
                </span>
                <span className="flex flex-none flex-wrap justify-end gap-1">
                  {c.learned && <span className="badge-success">Đã học</span>}
                  {c.status === "done" && <span className="badge">Xong</span>}
                  {c.orderMarked && <span className="badge-accent">Có đơn</span>}
                  {c.tags.slice(0, 2).map((t) => (
                    <span key={t} className="badge">
                      {t}
                    </span>
                  ))}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
