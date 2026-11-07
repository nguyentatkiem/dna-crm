"use client";

// Kho trạng thái hướng dẫn phía trình duyệt (một bản cho cả app /w).
// Trang bất kỳ mở tour bằng startTour("bang") hoặc window.dispatchEvent(new CustomEvent("tutorial:start", { detail: { id: "bang" } })).
import { useMemo, useSyncExternalStore } from "react";
import { applyPatch, EMPTY_PROGRESS, SETTINGS_DEFAULT, type Progress, type ProgressPatch, type TutorialSettings } from "@/lib/tutorial/progress";
import { toursFor, type Tour, type TourCtx } from "@/lib/tutorial/tours";
import type { Checklist } from "@/lib/tutorial/checklist";
import type { TutorialBoot } from "@/lib/tutorial/server";

export type Panel = null | "welcome" | "checklist" | "shortcuts";
export const START_EVENT = "tutorial:start";
export const OPEN_EVENT = "tutorial:open";

type State = {
  boot: TutorialBoot | null;
  progress: Progress;
  settings: TutorialSettings;
  active: { id: string; at: number; key: number } | null;
  panel: Panel;
  checklist: Checklist | null;
};

let state: State = { boot: null, progress: EMPTY_PROGRESS, settings: SETTINGS_DEFAULT, active: null, panel: null, checklist: null };
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
const SERVER: State = state;

/** Gọi từ bất cứ đâu (kể cả ngoài React): mở một tour. */
export function startTour(id: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(START_EVENT, { detail: { id } }));
}
/** Mở bảng: "checklist" | "shortcuts" | "welcome". */
export function openTutorialPanel(panel: Exclude<Panel, null>) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: panel }));
}

export const tutorial = {
  get: () => state,
  init(boot: TutorialBoot) {
    if (state.boot?.userId === boot.userId) return;
    set({ boot, progress: boot.progress, settings: boot.settings, panel: boot.showWelcome ? "welcome" : null, active: null, checklist: null });
  },
  begin(id: string, at = 0) {
    // Tour không có / người này không được xem (vd. ?tour=… gõ tay): bỏ qua, không để kẹt trạng thái "đang chạy".
    const b = state.boot;
    if (!b || !toursFor(b.term, ctxOf(b)).some((t) => t.id === id)) return;
    set({ active: { id, at, key: Date.now() }, panel: null });
  },
  end(status: "done" | "skipped") {
    const a = state.active;
    set({ active: null });
    if (!a) return;
    void tutorial.patch({ tour: { id: a.id, status } }).then(() => tutorial.refresh());
  },
  open(panel: Panel) {
    set({ panel });
  },
  /** Cập nhật lạc quan rồi lưu lên server. */
  async patch(p: ProgressPatch) {
    set({ progress: applyPatch(state.progress, p) });
    try {
      const r = await fetch("/api/tutorial", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (r.ok) {
        const j = await r.json();
        if (j?.progress) set({ progress: j.progress });
        return true;
      }
    } catch {}
    return false;
  },
  /** Đánh dấu tay một mục: đổi ngay trên màn hình, rồi lưu và tính lại từ server. */
  async mark(id: string, done: boolean) {
    const c = state.checklist;
    if (c) {
      const groups = c.groups.map((g) => ({ ...g, items: g.items.map((i) => (i.id === id && i.via !== "auto" ? { ...i, done, via: done ? ("manual" as const) : null } : i)) }));
      const n = groups.flatMap((g) => g.items).filter((i) => i.done).length;
      set({ checklist: { ...c, groups, done: n, pct: c.total ? Math.round((n / c.total) * 100) : 100 } });
    }
    const ok = await tutorial.patch({ manual: { id, done } });
    await tutorial.refresh();
    return ok;
  },
  /** Tải lại danh sách bắt đầu (tự phát hiện từ dữ liệu thật). */
  async refresh() {
    try {
      const r = await fetch("/api/tutorial", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      set({ checklist: j.checklist, progress: j.progress ?? state.progress, settings: j.settings ?? state.settings });
    } catch {}
  },
};

export const ctxOf = (b: Pick<TutorialBoot, "isOwner" | "base" | "perms">): TourCtx => ({ isOwner: b.isOwner, base: b.base, perms: new Set(b.perms) });

/** Hook dùng trong component: trạng thái + các tour người này được xem. */
export function useTutorial() {
  const s = useSyncExternalStore(subscribe, tutorial.get, () => SERVER);
  const tours: Tour[] = useMemo(() => (s.boot ? toursFor(s.boot.term, ctxOf(s.boot)) : []), [s.boot]);
  return { ...s, tours, startTour, openPanel: openTutorialPanel, actions: tutorial };
}
