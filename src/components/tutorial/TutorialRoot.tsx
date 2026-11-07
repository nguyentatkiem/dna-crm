"use client";

// Gốc của hệ thống hướng dẫn trong layout /w: nhận sự kiện mở tour, nhớ trang đã ghé,
// hiện nút "Bắt đầu" + gợi ý "Lần đầu ở đây?". Phần nặng (bộ máy tour, lời chào, danh sách, phím tắt) tải lười.
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { introTourFor } from "@/lib/tutorial/tours";
import { VISIT_PAGES } from "@/lib/tutorial/checklist";
import type { TutorialBoot } from "@/lib/tutorial/server";
import { OPEN_EVENT, START_EVENT, tutorial, useTutorial, type Panel } from "./store";
import { Icon } from "../Icon";

const TourOverlay = dynamic(() => import("./TourOverlay"), { ssr: false });
const WelcomeModal = dynamic(() => import("./WelcomeModal"), { ssr: false });
const ChecklistPanel = dynamic(() => import("./ChecklistPanel"), { ssr: false });
const ShortcutsSheet = dynamic(() => import("./ShortcutsSheet"), { ssr: false });


export function TutorialRoot({ boot }: { boot: TutorialBoot }) {
  return (
    <Suspense fallback={null}>
      <Root boot={boot} />
    </Suspense>
  );
}

function Root({ boot }: { boot: TutorialBoot }) {
  const t = useTutorial();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    tutorial.init(boot);
    setMounted(true);
  }, [boot]);

  // Sự kiện toàn cục: tutorial:start { id } / tutorial:open "checklist" | "shortcuts" | "welcome".
  useEffect(() => {
    const start = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) tutorial.begin(id);
    };
    const open = (e: Event) => tutorial.open((e as CustomEvent<Panel>).detail ?? null);
    window.addEventListener(START_EVENT, start);
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener(OPEN_EVENT, open);
    };
  }, []);

  // Link từ thông báo "Gửi nhắc": /w?tutorial=checklist, hoặc ?tour=<id>.
  useEffect(() => {
    if (!mounted) return;
    const panel = search.get("tutorial");
    const tour = search.get("tour");
    if (!panel && !tour) return;
    if (panel === "checklist" || panel === "shortcuts") tutorial.open(panel);
    if (tour) tutorial.begin(tour);
    const sp = new URLSearchParams(search.toString());
    sp.delete("tutorial");
    sp.delete("tour");
    router.replace(pathname + (sp.size ? `?${sp}` : ""), { scroll: false });
  }, [mounted, search, pathname, router]);

  // Ghi nhận trang đã ghé + làm mới danh sách (tối đa 10 giây một lần).
  const visible = mounted && !!t.boot && t.settings.showChecklist && !t.progress.checklistHidden;
  useEffect(() => {
    if (!mounted || !t.boot) return;
    const v = VISIT_PAGES[pathname];
    if (v && !tutorial.get().progress.visited[v]) void tutorial.patch({ visit: v });
    if (!visible && t.panel !== "checklist") return;
    const now = Date.now();
    if (now - lastRefresh.current < 10_000) return;
    lastRefresh.current = now;
    const run = () => void tutorial.refresh();
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 800);
  }, [mounted, pathname, t.boot, visible, t.panel]);

  if (!mounted || !t.boot) return null;
  const active = t.active ? t.tours.find((x) => x.id === t.active!.id) : null;

  return (
    <>
      <Dock visible={visible} pathname={pathname} />
      {active && <TourOverlay key={t.active!.key} tour={active} startAt={t.active!.at} onClose={(s) => tutorial.end(s)} />}
      {t.panel === "welcome" && !active && <WelcomeModal />}
      {t.panel === "checklist" && !active && <ChecklistPanel />}
      {t.panel === "shortcuts" && <ShortcutsSheet onClose={() => tutorial.open(null)} />}
    </>
  );
}

/** Góc trái dưới: gợi ý "Lần đầu ở đây?" và nút tròn tiến độ "Bắt đầu". */
function Dock({ visible, pathname }: { visible: boolean; pathname: string }) {
  const t = useTutorial();
  const [hint, setHint] = useState<string | null>(null);
  const c = t.checklist;

  // Gợi ý tour của trang (sau 1,2 giây để không làm phiền khi chỉ lướt qua).
  useEffect(() => {
    setHint(null);
    const id = introTourFor(pathname, t.tours);
    if (!id) return;
    const timer = setTimeout(() => setHint(id), 1200);
    return () => clearTimeout(timer);
  }, [pathname, t.tours]);

  const tour = hint ? t.tours.find((x) => x.id === hint) : null;
  const showHint = !!tour && !t.active && !t.panel && t.progress.welcomeSeen && !t.progress.hints[tour.id] && !t.progress.tours[tour.id];
  const showPill = visible && !!c && !t.active && !(c.pct === 100 && t.progress.completedAt && Date.now() - Date.parse(t.progress.completedAt) > 3 * 864e5);
  if (!showHint && !showPill) return null;

  const R = 9;
  const L = 2 * Math.PI * R;
  return (
    <div className="tut-dock pointer-events-none fixed z-30 flex max-w-[calc(100vw-104px)] flex-col items-start gap-2 md:max-w-[420px]">
      {showHint && tour && (
        <div className="anim-slide-up pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-line-soft bg-surface py-1 pl-3 pr-1 text-[13px] shadow-md" role="status">
          <Icon name="help" size={15} className="flex-none text-primary" />
          <span className="min-w-0 truncate">
            Lần đầu ở đây? <span className="max-sm:hidden">Xem nhanh “{tour.title}”</span>
          </span>
          <button
            type="button"
            className="btn-primary h-7 flex-none rounded-full px-3 text-[12.5px]"
            onClick={() => {
              void tutorial.patch({ hint: tour.id });
              tutorial.begin(tour.id);
            }}
          >
            Xem {tour.minutes} phút
          </button>
          <button type="button" className="btn-ghost h-7 w-7 flex-none justify-center rounded-full p-0 text-ink-2" aria-label="Ẩn gợi ý" onClick={() => void tutorial.patch({ hint: tour.id })}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {showPill && c && (
        <button
          type="button"
          data-tut-pill=""
          onClick={() => tutorial.open(t.panel === "checklist" ? null : "checklist")}
          aria-expanded={t.panel === "checklist"}
          aria-haspopup="dialog"
          className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-line-soft bg-surface pl-1.5 pr-3.5 text-[13px] font-medium text-ink shadow-md transition hover:shadow-lg"
          aria-label={`Bắt đầu với DNA CRM: xong ${c.done} trên ${c.total} việc`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" className="flex-none -rotate-90">
            <circle cx="12" cy="12" r={R} fill="none" stroke="var(--line)" strokeWidth="3" />
            <circle cx="12" cy="12" r={R} fill="none" stroke={c.pct === 100 ? "var(--success)" : "var(--primary)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - c.pct / 100)} className="transition-[stroke-dashoffset] duration-500" />
          </svg>
          <span className="whitespace-nowrap">{c.pct === 100 ? "Đã sẵn sàng!" : "Bắt đầu"}</span>
          <span className="tnum text-[12px] text-ink-2">
            {c.done}/{c.total}
          </span>
        </button>
      )}
    </div>
  );
}

