// Danh sách "Bắt đầu với DNA CRM" — phần thuần: khai báo mục, tính trạng thái từ số liệu thật (Facts)
// và tiến độ của người dùng. Phần đọc database nằm ở ./server.ts (loadFacts).
import { allowedFor, lowerTerm, MAIN_TOUR, type Term, type TourCtx } from "./tours";
import type { Progress } from "./progress";
import type { Perm } from "../roles";

/**
 * Số liệu thật dùng để tự phát hiện mục đã làm. Đếm "ngoài dữ liệu mẫu": dữ liệu mẫu ghi thẳng vào
 * database không qua nhật ký thao tác, nên các số đếm dựa trên AuditLog / thời điểm sau khi người dùng tham gia.
 */
export type Facts = {
  // Cấp workspace (chủ / quản lý)
  dnaComplete: boolean;
  importsOrCreates: number;
  channelConnected: boolean;
  members: number;
  invites: number;
  rolesOrTeams: number;
  automationsTouched: number;
  automationsEnabled: number;
  salesDocs: number;
  kpiThisMonth: number;
  // Cấp cá nhân (nhân viên)
  myUpdates: number;
  myCalls: number;
  myReplies: number;
  myTasks: number;
  // Dữ liệu mẫu còn lại
  sampleRecords: number;
};

export const EMPTY_FACTS: Facts = { dnaComplete: false, importsOrCreates: 0, channelConnected: false, members: 1, invites: 0, rolesOrTeams: 0, automationsTouched: 0, automationsEnabled: 0, salesDocs: 0, kpiThisMonth: 0, myUpdates: 0, myCalls: 0, myReplies: 0, myTasks: 0, sampleRecords: 0 };

export type Audience = "lead" | "staff";
export const audienceOf = (ctx: Pick<TourCtx, "isOwner" | "base">): Audience => (ctx.isOwner || ctx.base === "manager" ? "lead" : "staff");

type Def = {
  id: string;
  group: string;
  audience: Audience;
  title: string;
  why: string;
  href: string;
  /** Tour mở bằng nút "Hướng dẫn". */
  tour?: string;
  perm?: Perm | Perm[];
  /** Cho phép tự đánh dấu xong (mục không phát hiện được hết). */
  manual?: boolean;
  detect: (f: Facts, p: Progress) => boolean;
};

export type ChecklistItem = Omit<Def, "detect" | "perm" | "audience"> & { done: boolean; via: "auto" | "manual" | null };
export type ChecklistGroup = { title: string; items: ChecklistItem[] };
export type Checklist = { audience: Audience; groups: ChecklistGroup[]; done: number; total: number; pct: number; sampleRecords: number };

function defs(term: Term): Def[] {
  const c = lowerTerm(term.contact);
  return [
    // ── Chủ / quản lý ──
    { id: "dna", group: "Thiết lập", audience: "lead", title: "Hoàn thiện DNA doanh nghiệp", why: "Tên, địa chỉ, số điện thoại in trên báo giá và giúp AI gợi ý đúng ngành.", href: "/w/settings/company", perm: ["company_edit", "settings_manage"], manual: true, detect: (f) => f.dnaComplete },
    { id: "import", group: "Thiết lập", audience: "lead", title: `Thêm hoặc nhập ${c} thật`, why: `Đưa danh sách ${c} của bạn vào — nhập từ Excel chỉ mất một phút.`, href: "/w/b/contacts", tour: "bang", detect: (f) => f.importsOrCreates > 0 },
    { id: "channel", group: "Thiết lập", audience: "lead", title: "Kết nối kênh (Zalo OA, fanpage, form web)", why: "Khách nhắn tin hay để lại số là tự vào CRM, không sót ai.", href: "/w/sources", tour: "hop-thu", perm: ["integrations_manage", "inbox_settings"], manual: true, detect: (f) => f.channelConnected },
    { id: "invite", group: "Đội ngũ", audience: "lead", title: "Mời thành viên", why: "Cả đội cùng dùng một nơi: giao việc, chia khách, xem tiến độ.", href: "/w/settings#members", tour: "vai-tro", perm: "members_manage", detect: (f) => f.members > 1 || f.invites > 0 },
    { id: "roles", group: "Đội ngũ", audience: "lead", title: "Phân quyền hoặc tạo phòng ban", why: "Ai thấy dữ liệu nào, ai được xoá, xuất file — đặt rõ từ đầu.", href: "/w/settings/roles", tour: "vai-tro", perm: ["roles_manage", "teams_manage"], detect: (f) => f.rolesOrTeams > 0 },
    { id: "kpi", group: "Đội ngũ", audience: "lead", title: "Đặt KPI tháng này", why: "Mục tiêu rõ ràng để cả đội theo dõi mỗi ngày.", href: "/w/kpi", tour: "hieu-suat", perm: "kpi_set", detect: (f) => f.kpiThisMonth > 0 },
    { id: "automation", group: "Vận hành", audience: "lead", title: "Bật một tự động hoá", why: "Để CRM tự giao khách, nhắc gọi lại, báo cả đội thay bạn.", href: "/w/automations", tour: "tu-dong", perm: "automations_manage", detect: (f) => f.automationsTouched > 0 && f.automationsEnabled > 0 },
    { id: "sales", group: "Vận hành", audience: "lead", title: "Tạo báo giá hoặc đơn đầu tiên", why: "Theo dõi doanh thu, công nợ ngay trong CRM.", href: "/w/quotes/new", tour: "ban-hang", perm: "sales_create", detect: (f) => f.salesDocs > 0 },
    { id: "perf", group: "Vận hành", audience: "lead", title: "Xem tổng quan hiệu suất", why: "Biết ai đang làm tốt, ai cần hỗ trợ.", href: "/w/perf/overview", tour: "hieu-suat", perm: "perf_view_team", manual: true, detect: (_f, p) => p.tours["hieu-suat"] === "done" || !!p.visited["perf-overview"] },
    // ── Nhân viên ──
    { id: "tour", group: "Làm quen", audience: "staff", title: "Hoàn thành tour làm quen", why: "Hai phút để biết mọi thứ nằm ở đâu.", href: "/w", tour: MAIN_TOUR, detect: (_f, p) => p.tours[MAIN_TOUR] === "done" },
    { id: "my-work", group: "Làm quen", audience: "staff", title: 'Xem "Việc của tôi"', why: "Việc hôm nay, việc quá hạn và lịch hẹn của bạn ở một chỗ.", href: "/w/my-work", manual: true, detect: (_f, p) => !!p.visited["my-work"] },
    { id: "update", group: "Hằng ngày", audience: "staff", title: `Cập nhật một ${c}`, why: "Ghi chú, đổi trạng thái để cả đội biết tình hình mới nhất.", href: "/w/b/contacts", tour: "bang", detect: (f) => f.myUpdates > 0 },
    { id: "call", group: "Hằng ngày", audience: "staff", title: "Gọi hoặc ghi nhận một cuộc gọi", why: "Kết quả gọi được lưu và chấm điểm để bạn tiến bộ nhanh hơn.", href: "/w/telesales", tour: "telesales", manual: true, detect: (f) => f.myCalls > 0 },
    { id: "reply", group: "Hằng ngày", audience: "staff", title: "Trả lời một hội thoại", why: "Khách nhắn Zalo, Messenger — trả lời ngay trong CRM.", href: "/w/inbox", tour: "hop-thu", detect: (f) => f.myReplies > 0 },
    { id: "task", group: "Hằng ngày", audience: "staff", title: "Tạo một việc", why: "Hẹn gọi lại, gửi báo giá… để không quên việc nào.", href: "/w/my-work", detect: (f) => f.myTasks > 0 },
  ];
}

/** Trang được ghi nhận "đã ghé" (đường dẫn → id), dùng cho mục "Xem Việc của tôi", "Xem tổng quan hiệu suất". */
export const VISIT_PAGES: Record<string, string> = { "/w/my-work": "my-work", "/w/perf/overview": "perf-overview" };
export const VISIT_IDS = new Set(Object.values(VISIT_PAGES));

/** Các id mục hợp lệ (để kiểm tra PATCH "Đánh dấu xong"). */
export const CHECKLIST_IDS = new Set(defs({ contact: "khách", deal: "giao dịch", appointment: "lịch hẹn" }).map((d) => d.id));

/** Tính danh sách bắt đầu cho một người (thuần). */
export function evaluateChecklist(term: Term, ctx: TourCtx, facts: Facts, progress: Progress): Checklist {
  const audience = audienceOf(ctx);
  const groups: ChecklistGroup[] = [];
  for (const d of defs(term)) {
    if (d.audience !== audience || !allowedFor(ctx, d)) continue;
    const auto = d.detect(facts, progress);
    const manual = !auto && !!d.manual && !!progress.manual[d.id];
    const item: ChecklistItem = { id: d.id, group: d.group, title: d.title, why: d.why, href: d.href, tour: d.tour, manual: d.manual, done: auto || manual, via: auto ? "auto" : manual ? "manual" : null };
    const g = groups.find((x) => x.title === d.group);
    if (g) g.items.push(item);
    else groups.push({ title: d.group, items: [item] });
  }
  const all = groups.flatMap((g) => g.items);
  const done = all.filter((i) => i.done).length;
  return { audience, groups, done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 100, sampleRecords: facts.sampleRecords };
}

/**
 * Người "đã dùng nhiều" thì không chào lại: tài khoản tạo hơn 7 ngày VÀ đã có thao tác thật.
 * Họ chỉ còn menu Trợ giúp.
 */
export function isVeteran(userCreatedAt: Date, activityCount: number, now = new Date()) {
  return now.getTime() - userCreatedAt.getTime() > 7 * 864e5 && activityCount > 0;
}
