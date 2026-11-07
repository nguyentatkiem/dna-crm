// Tiến độ hướng dẫn của MỘT người (Pref `tutorial:<userId>`) và cài đặt hướng dẫn của workspace
// (Pref `tutorialSettings`). Phần thuần, không phụ thuộc zod (để không nặng thêm JS trình duyệt);
// schema kiểm tra dữ liệu PATCH nằm ở ./schema.ts.

export const tutorialKey = (userId: string) => `tutorial:${userId}`;
export const SETTINGS_KEY = "tutorialSettings";

export const ID_RE = /^[a-z0-9-]{1,40}$/;
const isId = (k: string) => ID_RE.test(k);
export type TourStatus = "done" | "skipped";

export type Progress = {
  welcomeSeen: boolean;
  tours: Record<string, TourStatus>;
  /** Mục danh sách bắt đầu tự đánh dấu xong. */
  manual: Record<string, true>;
  checklistHidden: boolean;
  /** Lúc danh sách bắt đầu đạt 100% (ISO) — null khi chưa xong. */
  completedAt: string | null;
  /** Gợi ý "Lần đầu ở đây?" đã tắt, theo id tour. */
  hints: Record<string, true>;
  /** Trang đã ghé (dùng cho mục "Xem Việc của tôi", "Xem tổng quan hiệu suất"). */
  visited: Record<string, true>;
};

export const EMPTY_PROGRESS: Progress = { welcomeSeen: false, tours: {}, manual: {}, checklistHidden: false, completedAt: null, hints: {}, visited: {} };

export type TutorialSettings = { welcomeForNewMembers: boolean; showChecklist: boolean };
export const SETTINGS_DEFAULT: TutorialSettings = { welcomeForNewMembers: true, showChecklist: true };

const trueMap = (v: unknown): Record<string, true> => {
  const out: Record<string, true> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (x === true && isId(k)) out[k] = true;
  return out;
};

/** Đọc an toàn (Pref hỏng / bản cũ → giá trị mặc định). */
export function normalizeProgress(raw: unknown): Progress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tours: Record<string, TourStatus> = {};
  if (r.tours && typeof r.tours === "object") for (const [k, v] of Object.entries(r.tours)) if ((v === "done" || v === "skipped") && isId(k)) tours[k] = v;
  return {
    welcomeSeen: r.welcomeSeen === true,
    tours,
    manual: trueMap(r.manual),
    checklistHidden: r.checklistHidden === true,
    completedAt: typeof r.completedAt === "string" && !Number.isNaN(Date.parse(r.completedAt)) ? r.completedAt : null,
    hints: trueMap(r.hints),
    visited: trueMap(r.visited),
  };
}

export function normalizeSettings(raw: unknown): TutorialSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    welcomeForNewMembers: typeof r.welcomeForNewMembers === "boolean" ? r.welcomeForNewMembers : SETTINGS_DEFAULT.welcomeForNewMembers,
    showChecklist: typeof r.showChecklist === "boolean" ? r.showChecklist : SETTINGS_DEFAULT.showChecklist,
  };
}

/** Thân PATCH /api/tutorial: mỗi lần một hoặc vài thay đổi nhỏ (kiểm tra bằng ProgressPatchSchema). */
export type ProgressPatch = {
  welcomeSeen?: boolean;
  tour?: { id: string; status: TourStatus | null };
  manual?: { id: string; done: boolean };
  checklistHidden?: boolean;
  hint?: string;
  visit?: string;
  reset?: true;
};

/** Áp một thay đổi (thuần). "reset" xoá hết rồi mới áp phần còn lại. */
export function applyPatch(cur: Progress, p: ProgressPatch): Progress {
  const next: Progress = p.reset ? { ...EMPTY_PROGRESS, tours: {}, manual: {}, hints: {}, visited: {} } : { ...cur, tours: { ...cur.tours }, manual: { ...cur.manual }, hints: { ...cur.hints }, visited: { ...cur.visited } };
  if (p.welcomeSeen !== undefined) next.welcomeSeen = p.welcomeSeen;
  if (p.checklistHidden !== undefined) next.checklistHidden = p.checklistHidden;
  if (p.tour) {
    if (p.tour.status === null) delete next.tours[p.tour.id];
    // "Bỏ qua" không đè lên "đã xong" của lần trước.
    else if (!(p.tour.status === "skipped" && next.tours[p.tour.id] === "done")) next.tours[p.tour.id] = p.tour.status;
  }
  if (p.manual) {
    if (p.manual.done) next.manual[p.manual.id] = true;
    else delete next.manual[p.manual.id];
  }
  if (p.hint) next.hints[p.hint] = true;
  if (p.visit) next.visited[p.visit] = true;
  return next;
}
