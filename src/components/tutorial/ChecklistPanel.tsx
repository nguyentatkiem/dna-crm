"use client";

// Bảng "Bắt đầu với DNA CRM": mục tự phát hiện từ dữ liệu thật, nút Làm ngay / Hướng dẫn / Đánh dấu xong.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "../ui/Toast";
import { Icon } from "../Icon";
import type { ChecklistItem } from "@/lib/tutorial/checklist";
import { tutorial, useTutorial } from "./store";
import { useDialog } from "./useDialog";

const COLORS = ["#0073ea", "#a25ddc", "#00c875", "#fdab3d", "#df2f4a", "#579bfc"];

/** Pháo giấy CSS (tắt khi người dùng bật giảm chuyển động). */
function Confetti() {
  return (
    <span className="tut-confetti pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 7) * 60}ms`, ["--dx" as string]: `${((i * 53) % 120) - 60}px` }} />
      ))}
    </span>
  );
}

export default function ChecklistPanel() {
  const t = useTutorial();
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState("");
  const close = () => tutorial.open(null);
  useDialog(box, close, false);
  const c = t.checklist;
  const lead = !!t.boot && (t.boot.isOwner || t.boot.base === "manager");

  // Mỗi lần mở: tính lại từ dữ liệu thật (vừa thêm khách, tạo báo giá… là thấy tick ngay).
  useEffect(() => {
    void tutorial.refresh();
  }, []);
  // Máy tính: bấm ra ngoài thì đóng (trừ nút tròn ở góc — nút đó tự bật / tắt).
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (box.current?.contains(el) || el.closest?.("[data-tut-pill]")) return;
      close();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tourOk = (id?: string) => !!id && t.tours.some((x) => x.id === id);
  const mark = async (it: ChecklistItem, done: boolean) => {
    setBusy(it.id);
    const ok = await tutorial.mark(it.id, done);
    setBusy("");
    if (!ok) toast("Chưa lưu được, thử lại sau", "error");
  };
  const hide = async () => {
    await tutorial.patch({ checklistHidden: true });
    close();
    toast("Đã ẩn. Mở lại từ nút ? → Danh sách bắt đầu.");
  };

  return (
    <div className="fixed inset-0 z-[65] md:pointer-events-none">
      <div className="anim-fade absolute inset-0 bg-overlay md:hidden" onClick={close} aria-hidden="true" />
      <div
        ref={box}
        data-tut-box=""
        role="dialog"
        aria-modal="false"
        aria-labelledby="tut-cl-h"
        tabIndex={-1}
        className="tut-dock-panel anim-slide-up pointer-events-auto absolute bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-surface shadow-lg outline-none md:bottom-[72px] md:max-h-[min(640px,calc(100dvh-140px))] md:w-[400px] md:rounded-xl md:border md:border-line-soft"
      >
        {/* Chúc mừng một lần: lúc vừa đạt 100% (trong 10 phút), không lặp lại mỗi lần mở. */}
        {c && c.pct === 100 && (!t.progress.completedAt || Date.now() - Date.parse(t.progress.completedAt) < 10 * 60_000) && <Confetti />}
        <header className="flex-none border-b border-line-soft px-4 pb-3 pt-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 id="tut-cl-h" className="font-title text-[17px] font-semibold">
                Bắt đầu với DNA CRM
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-2">{c ? (c.pct === 100 ? "Tuyệt vời — bạn đã làm xong hết!" : `Xong ${c.done}/${c.total} việc · tự đánh dấu khi bạn làm thật`) : "Đang kiểm tra…"}</p>
            </div>
            <button type="button" onClick={close} className="btn-ghost h-8 w-8 flex-none justify-center p-0 text-ink-2" aria-label="Đóng danh sách">
              <Icon name="x" />
            </button>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c?.pct ?? 0} aria-label="Tiến độ">
            <div className={`h-full rounded-full transition-[width] duration-500 ${c?.pct === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${c?.pct ?? 0}%` }} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!c && (
            <div className="grid gap-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-14" />
              ))}
            </div>
          )}
          {c && c.sampleRecords > 0 && (
            <div className="mx-2 mt-3 flex gap-2.5 rounded-lg border border-warning bg-warning-soft px-3 py-2.5 text-[13px]">
              <Icon name="database" size={16} className="mt-0.5 flex-none text-warning" />
              <p className="min-w-0 flex-1">
                <b className="font-semibold">Đây là dữ liệu mẫu — xoá khi sẵn sàng.</b>{" "}
                <span className="text-ink-2">Đang có {c.sampleRecords} mục mẫu để bạn bấm thử thoải mái.</span>{" "}
                {lead ? (
                  <Link href="/w/settings#sample-data" onClick={close} className="font-medium text-primary hover:underline">
                    Xoá trong Cài đặt
                  </Link>
                ) : (
                  <span className="text-ink-2">Chủ workspace sẽ xoá khi bắt đầu dùng thật.</span>
                )}
              </p>
            </div>
          )}
          {c?.groups.map((g) => (
            <section key={g.title} className="mt-3">
              <p className="section-title px-2 pb-1">{g.title}</p>
              <ul className="grid gap-0.5">
                {g.items.map((it) => (
                  <li key={it.id} className="group rounded-lg px-2 py-2 hover:bg-hover">
                    <div className="flex gap-2.5">
                      <span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${it.done ? "border-success bg-success text-white" : "border-line"}`} aria-hidden="true">
                        {it.done && <Icon name="check" size={12} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[14px] font-medium ${it.done ? "text-ink-2 line-through decoration-1" : ""}`}>
                          {it.title}
                          <span className="sr-only">{it.done ? " — đã xong" : " — chưa xong"}</span>
                        </p>
                        {!it.done && <p className="mt-0.5 text-[12.5px] text-ink-2">{it.why}</p>}
                        {!it.done && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Link href={it.href} onClick={close} className="btn-primary h-7 px-2.5 text-[12.5px]">
                              Làm ngay
                            </Link>
                            {tourOk(it.tour) && (
                              <button type="button" className="btn-outline h-7 px-2.5 text-[12.5px]" onClick={() => tutorial.begin(it.tour!)}>
                                <Icon name="play" size={12} /> Hướng dẫn
                              </button>
                            )}
                            {it.manual && (
                              <button type="button" className="btn-ghost h-7 px-2 text-[12.5px] text-ink-2" disabled={busy === it.id} onClick={() => void mark(it, true)}>
                                Đánh dấu xong
                              </button>
                            )}
                          </div>
                        )}
                        {it.via === "manual" && (
                          <button type="button" className="mt-0.5 text-[12px] text-ink-2 hover:text-ink hover:underline" disabled={busy === it.id} onClick={() => void mark(it, false)}>
                            Bỏ đánh dấu
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="flex flex-none items-center gap-2 border-t border-line-soft px-4 py-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] md:pb-2.5">
          {c?.pct === 100 ? <span className="flex-1 text-[13px] font-medium text-success">Bạn đã sẵn sàng dùng DNA CRM!</span> : <span className="flex-1 text-[12px] text-ink-2">Mục tự tick khi bạn làm thật trong app.</span>}
          {t.progress.checklistHidden ? (
            <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => void tutorial.patch({ checklistHidden: false })}>
              Hiện nút ở góc
            </button>
          ) : (
            <button type="button" className="btn-ghost h-8 text-[13px] text-ink-2" onClick={() => void hide()}>
              Ẩn danh sách
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
