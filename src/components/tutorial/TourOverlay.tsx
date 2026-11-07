"use client";

// Bộ máy chạy tour: phủ mờ, khoét sáng phần tử [data-tour="…"], thẻ hướng dẫn cạnh phần tử.
// Tải lười (next/dynamic) — chỉ vào trình duyệt khi có người bấm mở một tour.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { nextIndex, onPath, stepTarget, type Tour } from "@/lib/tutorial/tours";
import { Icon } from "../Icon";

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const GAP = 12;
const EDGE = 12;
const CARD_W = 340;
const MOBILE = "(max-width: 767px)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Phần tử data-tour đầu tiên đang hiện trên màn hình. */
function findVisible(name: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

async function waitFor(name: string, ms: number, stop: () => boolean) {
  const until = Date.now() + ms;
  while (!stop()) {
    const el = findVisible(name);
    if (el) return el;
    if (Date.now() > until) return null;
    await sleep(100);
  }
  return null;
}

const toRect = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  // Khoét rộng thêm một chút, rồi kẹp trong màn hình.
  const top = Math.max(2, r.top - PAD);
  const left = Math.max(2, r.left - PAD);
  const bottom = Math.min(window.innerHeight - 2, r.bottom + PAD);
  const right = Math.min(window.innerWidth - 2, r.right + PAD);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

const sameRect = (a: Rect | null, b: Rect | null) => !!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

function inView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.top >= 56 && r.bottom <= window.innerHeight - 8 && r.left >= 0 && r.right <= window.innerWidth;
}

type Pos = { mode: "float"; top: number; left: number; width?: number } | { mode: "center" } | { mode: "sheet"; at: "top" | "bottom"; max: number };

/** Chọn chỗ đặt thẻ sao cho không che phần tử đang chỉ. */
function place(rect: Rect | null, card: { w: number; h: number }, mobile: boolean, pref: string | undefined): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (mobile) {
    if (!rect) return { mode: "sheet", at: "bottom", max: vh * 0.6 };
    const below = vh - (rect.top + rect.height) - EDGE;
    const above = rect.top - EDGE;
    return below >= above ? { mode: "sheet", at: "bottom", max: Math.max(160, below) } : { mode: "sheet", at: "top", max: Math.max(160, above) };
  }
  if (!rect) return { mode: "center" };
  // Bề rộng cố định (không dùng bề rộng đo được, để thẻ hẹp lại không làm đổi qua đổi lại chỗ đặt).
  const w = Math.min(CARD_W, vw - 2 * EDGE);
  const { h } = card;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - w - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - h - EDGE);
  const sides = {
    bottom: { fits: rect.top + rect.height + GAP + h <= vh - EDGE, top: rect.top + rect.height + GAP, left: clampX(cx - w / 2), space: vh - rect.top - rect.height },
    top: { fits: rect.top - GAP - h >= EDGE, top: rect.top - GAP - h, left: clampX(cx - w / 2), space: rect.top },
    right: { fits: rect.left + rect.width + GAP + w <= vw - EDGE, top: clampY(cy - h / 2), left: rect.left + rect.width + GAP, space: vw - rect.left - rect.width },
    left: { fits: rect.left - GAP - w >= EDGE, top: clampY(cy - h / 2), left: rect.left - GAP - w, space: rect.left },
  };
  const order = [pref && pref !== "auto" ? pref : "bottom", "bottom", "top", "right", "left"] as (keyof typeof sides)[];
  const hit = order.find((k) => sides[k]?.fits);
  if (hit) return { mode: "float", top: sides[hit].top, left: sides[hit].left };
  // Phần tử rộng / cao: thử thẻ hẹp hơn (tối thiểu 240px) ở bên trái hoặc phải để không che phần tử.
  const leftRoom = rect.left - GAP - EDGE;
  const rightRoom = vw - rect.left - rect.width - GAP - EDGE;
  const room = Math.max(leftRoom, rightRoom);
  if (room >= 240) {
    const nw = Math.min(w, room);
    const nh = card.w > nw + 1 ? h * (card.w / nw) : h; // ước lượng: hẹp lại thì cao lên
    const top = Math.min(Math.max(EDGE, cy - nh / 2), Math.max(EDGE, vh - nh - EDGE));
    return { mode: "float", top, left: rightRoom >= leftRoom ? rect.left + rect.width + GAP : rect.left - GAP - nw, width: nw };
  }
  // Phần tử quá lớn: đặt ở phía còn nhiều chỗ nhất, kẹp trong màn hình.
  const best = (Object.keys(sides) as (keyof typeof sides)[]).sort((a, b) => sides[b].space - sides[a].space)[0];
  return { mode: "float", top: clampY(sides[best].top), left: clampX(sides[best].left) };
}

export default function TourOverlay({ tour, startAt = 0, onClose }: { tour: Tour; startAt?: number; onClose: (status: "done" | "skipped") => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = tour.steps;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startAt), steps.length - 1));
  const [phase, setPhase] = useState<"seek" | "show">("seek");
  const [slow, setSlow] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [card, setCard] = useState({ w: 340, h: 200 });
  const [mobile, setMobile] = useState(false);
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [retry, setRetry] = useState(0);
  const elRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dir = useRef<1 | -1>(1);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigated = useRef("");
  const navFrom = useRef("");
  const titleId = useId();
  const bodyId = useId();
  const step = steps[index];

  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const mq = window.matchMedia(MOBILE);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => {
      mq.removeEventListener("change", on);
      returnFocus.current?.focus?.();
    };
  }, []);

  const finish = useCallback((status: "done" | "skipped") => onClose(status), [onClose]);

  const go = useCallback(
    (d: 1 | -1, extraMissing?: string) => {
      dir.current = d;
      const miss = extraMissing ? new Set(missing).add(extraMissing) : missing;
      if (extraMissing) setMissing(miss);
      const n = nextIndex(steps, index, d, miss);
      if (n >= 0) return setIndex(n);
      if (d === 1) return finish("done");
      // Không lùi được nữa: nếu bước hiện tại cũng không tìm thấy thì tiến lên.
      if (extraMissing) {
        const f = nextIndex(steps, index, 1, miss);
        return f >= 0 ? setIndex(f) : finish("done");
      }
    },
    [index, missing, steps, finish],
  );

  // Tìm phần tử của bước hiện tại: mở trang (nếu cần) → bấm mở (nếu cần) → chờ tối đa ~3 giây.
  useEffect(() => {
    if (!step) return;
    let stop = false;
    setPhase("seek");
    setSlow(false);
    const slowT = setTimeout(() => setSlow(true), 450);
    if (step.path && !onPath(pathname, step.path)) {
      // Đã mở trang cho bước này và đã sang một trang khác (bị chặn quyền, chuyển hướng…): bỏ bước, không mở lại liên tục.
      if (navigated.current === step.id && navFrom.current !== pathname) {
        go(dir.current, step.id);
        return () => clearTimeout(slowT);
      }
      if (navigated.current !== step.id) {
        navigated.current = step.id;
        navFrom.current = pathname;
        router.push(step.path);
      }
      // Trang không mở được (mạng chậm, lỗi…): bỏ bước sau 8 giây.
      const t = setTimeout(() => !stop && go(dir.current, step.id), 8000);
      return () => {
        stop = true;
        clearTimeout(t);
        clearTimeout(slowT);
      };
    }
    (async () => {
      if (step.click) {
        const c = await waitFor(step.click, 2500, () => stop);
        if (stop) return;
        if (c) {
          c.click();
          await sleep(300);
        }
      }
      const name = stepTarget(step, window.matchMedia(MOBILE).matches);
      if (!name) {
        elRef.current = null;
        setRect(null);
        setPhase("show");
        return;
      }
      // Vừa mở trang mới (trang dựng không đồng bộ, dev server có thể đang biên dịch) thì chờ lâu hơn.
      const extra = navigated.current === step.id ? 3000 : 0;
      const el = await waitFor(name, (step.optional ? 1500 : 3000) + extra, () => stop);
      if (stop) return;
      if (!el) {
        // Điện thoại: bước chính không thấy phần tử thì hiện giữa màn hình; còn lại bỏ qua nhẹ nhàng.
        if (window.matchMedia(MOBILE).matches && !step.optional) {
          elRef.current = null;
          setRect(null);
          setPhase("show");
        } else go(dir.current, step.id);
        return;
      }
      // Trang vừa dựng còn xê dịch bố cục: chờ phần tử đứng yên (tối đa ~0,6 giây).
      for (let i = 0, last = el.getBoundingClientRect(); i < 8 && !stop; i++) {
        await sleep(80);
        const now = el.getBoundingClientRect();
        if (Math.abs(now.top - last.top) < 1 && Math.abs(now.left - last.left) < 1 && Math.abs(now.height - last.height) < 1) break;
        last = now;
      }
      if (stop) return;
      if (!inView(el)) {
        // Cuộn ngay (không "smooth"): cuộn mượt có thể chưa kịp bắt đầu khi đo, làm thẻ hiện sai chỗ rồi nhảy.
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        await sleep(50);
        if (stop) return;
      }
      elRef.current = el;
      setRect(toRect(el));
      setPhase("show");
    })();
    return () => {
      stop = true;
      clearTimeout(slowT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pathname, retry, step?.id]);

  // Bám theo phần tử khi cuộn / đổi cỡ / bố cục thay đổi.
  useEffect(() => {
    if (phase !== "show") return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = elRef.current;
        if (!el) return;
        if (!el.isConnected || el.getBoundingClientRect().width === 0) return setRetry((n) => n + 1);
        const r = toRect(el);
        setRect((old) => (sameRect(old, r) ? old : r));
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const t = setInterval(update, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      clearInterval(t);
    };
  }, [phase]);

  // Đo thẻ để đặt đúng chỗ.
  useLayoutEffect(() => {
    const c = cardRef.current;
    if (!c) return;
    const measure = () => {
      const r = c.getBoundingClientRect();
      setCard((o) => (Math.abs(o.w - r.width) < 1 && Math.abs(o.h - r.height) < 1 ? o : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    return () => ro.disconnect();
  }, [phase, index]);

  // Đưa focus vào thẻ ở mỗi bước.
  useEffect(() => {
    if (phase === "show") cardRef.current?.focus({ preventScroll: true });
  }, [phase, index]);

  // Phím: → tiếp, ← quay lại, Esc thoát; Tab xoay vòng trong thẻ. Bắt ở pha capture để không lọt xuống trang.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish("skipped");
      } else if (e.key === "ArrowRight" && phase === "show") {
        e.preventDefault();
        e.stopImmediatePropagation();
        go(1);
      } else if (e.key === "ArrowLeft" && phase === "show") {
        e.preventDefault();
        e.stopImmediatePropagation();
        go(-1);
      } else if (e.key === "Tab" && cardRef.current) {
        const f = [...cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const a = document.activeElement;
        if (!cardRef.current.contains(a)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && (a === first || a === cardRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && a === last) {
          e.preventDefault();
          first.focus();
        }
      } else {
        // Không để phím tắt của trang (j k e / Enter…) chạy khi đang xem tour. Không chặn hành vi mặc định,
        // nên Enter / Space trên nút của thẻ vẫn bấm được.
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [go, finish, phase]);

  if (!step) return null;
  const visible = steps.filter((s) => !missing.has(s.id));
  const pos = Math.max(1, visible.findIndex((s) => s.id === step.id) + 1);
  const total = visible.length;
  const isLast = nextIndex(steps, index, 1, missing) < 0;
  const isFirst = nextIndex(steps, index, -1, missing) < 0;
  const showCard = phase === "show";
  // Mục ở thanh bên: đặt thẻ bên phải để không che các mục khác.
  const pref = step.placement ?? (step.target?.startsWith("nav") ? "right" : undefined);
  const p = place(rect, card, mobile, pref);

  const cardStyle: React.CSSProperties =
    p.mode === "float" ? { top: p.top, left: p.left, width: p.width ?? CARD_W } : p.mode === "center" ? { top: "50%", left: "50%", width: 380, transform: "translate(-50%, -50%)" } : p.at === "bottom" ? { left: 0, right: 0, bottom: 0, maxHeight: p.max } : { left: 0, right: 0, top: 0, maxHeight: p.max };
  const cardCls =
    p.mode === "sheet"
      ? `fixed z-[82] overflow-y-auto bg-surface px-4 pt-4 shadow-lg outline-none ${p.at === "bottom" ? "rounded-t-2xl pb-[calc(16px+env(safe-area-inset-bottom))]" : "rounded-b-2xl pb-4 pt-[calc(16px+env(safe-area-inset-top))]"}`
      : "fixed z-[82] max-w-[calc(100vw-24px)] rounded-xl border border-line-soft bg-surface p-4 shadow-lg outline-none";

  return (
    <div className="tut-root" data-tutorial-overlay="">
      {/* Chặn bấm vào trang phía dưới (tour không làm thay đổi dữ liệu). */}
      <div className="fixed inset-0 z-[80]" aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={() => cardRef.current?.focus()} />
      {rect ? (
        <div aria-hidden="true" className="tut-spot pointer-events-none fixed z-[81] rounded-lg" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      ) : (
        <div aria-hidden="true" className="tut-dim anim-fade pointer-events-none fixed inset-0 z-[81]" />
      )}

      <p className="sr-only" aria-live="polite">
        {showCard ? `Bước ${pos} trên ${total}: ${step.title}` : slow ? "Đang mở…" : ""}
      </p>

      {!showCard && slow && (
        <div className="fixed left-1/2 top-1/2 z-[82] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface px-4 py-2 text-[13px] text-ink-2 shadow-lg">
          <Icon name="refresh" size={14} className="mr-1.5 inline animate-spin" /> Đang mở…
        </div>
      )}

      <div
        ref={cardRef}
        data-tut-box=""
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={`${cardCls} ${showCard ? "tut-card-in" : "pointer-events-none invisible"}`}
        style={cardStyle}
        key={`${index}-${phase}`}
      >
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary-selected text-primary">
            <Icon name={tour.icon} size={13} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
            {tour.title} · <span className="tnum">{pos}/{total}</span>
          </span>
          <button type="button" onClick={() => finish("skipped")} className="btn-ghost h-7 w-7 flex-none justify-center p-0 text-ink-2" aria-label="Thoát hướng dẫn">
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(pos / Math.max(1, total)) * 100}%` }} />
        </div>
        <h2 id={titleId} className="mt-3 font-title text-[16px] font-semibold leading-snug">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1 text-[14px] leading-relaxed text-ink-2">
          {(mobile && step.mobileBody) || step.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className="btn-ghost h-8 px-2 text-[13px] text-ink-2" onClick={() => finish("skipped")}>
            Bỏ qua
          </button>
          <span className="hidden flex-1 text-[11.5px] text-ink-2 md:block" aria-hidden="true">
            <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> · <kbd className="kbd">Esc</kbd>
          </span>
          <span className="flex-1 md:hidden" />
          <button type="button" className="btn-outline h-8 text-[13px]" onClick={() => go(-1)} disabled={isFirst}>
            Quay lại
          </button>
          <button type="button" className="btn-primary h-8 text-[13px]" onClick={() => (isLast ? finish("done") : go(1))}>
            {isLast ? "Xong" : "Tiếp"}
          </button>
        </div>
      </div>
    </div>
  );
}
