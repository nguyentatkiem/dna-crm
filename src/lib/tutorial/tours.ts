// Các tour hướng dẫn (khai báo thuần — không đụng DOM, có kiểm thử).
// Mỗi bước trỏ vào một phần tử có thuộc tính data-tour="…"; không có target = thẻ ở giữa màn hình.
// Bộ máy chạy tour nằm ở src/components/tutorial/TourOverlay.tsx.
import type { BuiltinRole, Perm } from "../roles";

export type Term = { contact: string; deal: string; appointment: string };

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Lời trên điện thoại (<768px) nếu khác máy tính. */
  mobileBody?: string;
  /** Giá trị data-tour của phần tử cần chỉ. Bỏ trống = thẻ giữa màn hình. */
  target?: string;
  /** Trên điện thoại (<768px): phần tử thay thế, hoặc "center" để hiện thẻ giữa màn hình. */
  mobileTarget?: string;
  /** Mở trang này trước (router.push) rồi mới tìm phần tử. */
  path?: string;
  /** Bấm phần tử data-tour này trước khi tìm target (vd. mở một hội thoại, mở hồ sơ). */
  click?: string;
  placement?: "auto" | "top" | "bottom" | "left" | "right";
  /** Chỉ hiện khi có MỘT trong các quyền này. */
  perm?: Perm | Perm[];
  /** Chỉ hiện với các vai trò gốc này (owner / manager / member — vai trò tự tạo theo vai trò gốc). */
  roles?: BuiltinRole[];
  /** Chỉ hiện khi KHÔNG có quyền này (lời dành cho người chỉ được xem). */
  unlessPerm?: Perm;
  /** Phần tử có thể không có (tuỳ dữ liệu): chờ ngắn hơn rồi bỏ qua. */
  optional?: boolean;
};

export type Tour = {
  id: string;
  title: string;
  summary: string;
  icon: string;
  minutes: number;
  /** Trang của tour: gợi ý "Lần đầu ở đây?" hiện ở trang này. */
  page?: string;
  perm?: Perm | Perm[];
  roles?: BuiltinRole[];
  steps: TourStep[];
};

export type TourCtx = {
  isOwner: boolean;
  base: BuiltinRole;
  perms: ReadonlySet<string> | readonly string[];
};

export const MAIN_TOUR = "lam-quen";

const has = (ctx: TourCtx, p: string) => (ctx.perms instanceof Set ? ctx.perms.has(p) : (ctx.perms as readonly string[]).includes(p));

/** Người này có đủ điều kiện (quyền / vai trò) cho bước hoặc tour không. Chủ luôn có mọi quyền. */
export function allowedFor(ctx: TourCtx, rule: { perm?: Perm | Perm[]; roles?: BuiltinRole[]; unlessPerm?: Perm }) {
  if (rule.roles && !rule.roles.includes(ctx.isOwner ? "owner" : ctx.base)) return false;
  if (rule.unlessPerm && (ctx.isOwner || has(ctx, rule.unlessPerm))) return false;
  if (rule.perm) {
    const ps = Array.isArray(rule.perm) ? rule.perm : [rule.perm];
    if (!ctx.isOwner && !ps.some((p) => has(ctx, p))) return false;
  }
  return true;
}

const LEAD: BuiltinRole[] = ["owner", "manager"];
const STAFF: BuiltinRole[] = ["member"];

/** Viết thường thuật ngữ để ghép vào câu, giữ nguyên chữ viết tắt ("Khách hàng DN" → "khách hàng DN"). */
export const lowerTerm = (s: string) =>
  s
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase() ? w : w.toLowerCase()))
    .join(" ");

/** Toàn bộ tour, chữ theo thuật ngữ ngành (vd. "Khách hàng" / "Học viên"). */
export function buildTours(term: Term): Tour[] {
  const c = lowerTerm(term.contact);
  const C = term.contact;
  const d = lowerTerm(term.deal);
  return [
    {
      id: MAIN_TOUR,
      title: "Làm quen DNA CRM",
      summary: "Đi một vòng các khu chính: menu, tìm nhanh, bảng, việc, hộp thư, trợ lý AI.",
      icon: "map",
      minutes: 2,
      steps: [
        { id: "nav", target: "nav", mobileTarget: "mobile-nav", placement: "right", title: "Menu chính", mobileBody: "Các khu hay dùng nằm ở thanh dưới cùng. Bấm Thêm để mở mọi khu khác: Bảng dữ liệu, Bán hàng, Chăm sóc, Marketing, Công cụ.", body: "Mọi khu vực nằm ở thanh bên: Làm việc hằng ngày, các Bảng dữ liệu, Bán hàng, Chăm sóc, Marketing và Công cụ. Thu gọn bằng nút ở cuối nếu cần thêm chỗ." },
        { id: "search", target: "search", title: "Tìm nhanh", mobileBody: `Gõ tên, số điện thoại của ${c}, tên trang hay một hành động để mở ngay.`, body: `Gõ tên, số điện thoại của ${c}, tên trang hay một hành động. Phím tắt: Ctrl K (⌘K trên Mac) ở bất cứ đâu.` },
        { id: "board", path: "/w/b/contacts", target: "board-add", roles: STAFF, title: `Bảng ${C}`, body: `Đây là nơi lưu mọi ${c}. Bấm nút này để thêm ${c} mới, hoặc gõ thẳng vào dòng "+ Thêm" cuối mỗi nhóm.` },
        { id: "board-lead", path: "/w/b/contacts", target: "board-add", roles: LEAD, title: `Bảng ${C}`, body: `Nơi lưu mọi ${c}. Thêm từng người bằng nút này, hoặc bấm Nhập (bên phải) để đưa cả file Excel vào — số điện thoại trùng tự gộp.`, mobileBody: `Nơi lưu mọi ${c}. Bấm nút này để thêm từng người, hoặc biểu tượng tải lên trên thanh công cụ để nhập cả file Excel — số điện thoại trùng tự gộp.` },
        { id: "open", path: "/w/b/contacts", target: "board-row", optional: true, title: "Mở hồ sơ 360°", body: `Rê chuột vào một dòng rồi bấm "Mở" cạnh tên để xem hồ sơ đầy đủ: lịch sử chăm sóc, cuộc gọi, đơn hàng, việc cần làm của ${c} đó.`, mobileBody: `Bấm biểu tượng mở cạnh tên để xem hồ sơ đầy đủ: lịch sử chăm sóc, cuộc gọi, đơn hàng, việc cần làm của ${c} đó.` },
        { id: "my-work", target: "nav-my-work", mobileTarget: "mnav-my-work", title: "Việc của tôi", body: "Mỗi sáng mở đây trước: việc quá hạn, việc hôm nay và lịch hẹn của bạn, gom một chỗ." },
        { id: "inbox", target: "nav-inbox", mobileTarget: "mnav-inbox", roles: LEAD, title: "Hộp thư", body: "Tin nhắn Zalo, Messenger và bình luận fanpage về chung một hộp. Bạn phân công hội thoại cho nhân viên và xem thống kê tại đây." },
        { id: "inbox-staff", target: "nav-inbox", mobileTarget: "mnav-inbox", roles: STAFF, title: "Hộp thư", body: `Khách nhắn Zalo, Messenger đều về đây. Mở hội thoại, bấm "Nhận hội thoại" để nhận phần mình rồi trả lời ngay.` },
        { id: "call", target: "nav-telesales", mobileTarget: "mnav-telesales", roles: STAFF, title: "Gọi điện", body: `Telesales xếp sẵn hàng ${c} cần gọi. Gọi xong ghi kết quả là hệ thống tự chấm điểm và nhắc lịch gọi lại.` },
        { id: "channels", target: "nav-sources", mobileTarget: "mnav-more", perm: "integrations_manage", title: "Kết nối kênh", mobileBody: "Bấm Thêm → Nguồn khách để nối Zalo OA, fanpage, form website: khách để lại thông tin là tự vào CRM.", body: "Nối Zalo OA, fanpage, form trên website: khách để lại thông tin là tự vào CRM, không phải nhập tay." },
        { id: "team", target: "nav-settings", mobileTarget: "mnav-more", perm: "members_manage", title: "Mời đội & phân quyền", mobileBody: "Bấm Thêm → DNA & Cấu hình để tạo link mời nhân viên, chọn vai trò và giới hạn ai thấy dữ liệu nào.", body: "Trong Cài đặt: tạo link mời nhân viên, chọn vai trò và giới hạn ai thấy dữ liệu nào." },
        { id: "copilot", target: "copilot", title: "Trợ lý AI", body: `Hỏi bằng lời: "${C} nào đang nóng?", "Doanh thu tháng này?", hay nhờ tạo ${c}, tạo việc giúp bạn.` },
        { id: "bell", target: "bell", title: "Thông báo", body: `Được giao ${c}, ${d} hay việc sắp đến hạn, chuông sẽ báo ở đây.` },
        { id: "help", target: "help", title: "Cần xem lại?", body: "Nút này mở các hướng dẫn theo từng tính năng, danh sách việc cần làm và phím tắt. Chúc bạn làm việc hiệu quả!" },
      ],
    },
    {
      id: "bang",
      title: "Bảng & dạng xem",
      summary: "Lọc, lưu dạng xem, chọn cột, đổi kiểu xem và xuất Excel.",
      icon: "table",
      minutes: 1,
      page: "/w/b/",
      steps: [
        { id: "views", path: "/w/b/contacts", target: "board-views", title: "Dạng xem đã lưu", body: `Lưu bộ lọc hay dùng thành dạng xem (vd. "${C} nóng tuần này") và chia sẻ cho cả đội.` },
        { id: "tabs", path: "/w/b/contacts", target: "board-viewtabs", title: "Kiểu xem", body: "Cùng dữ liệu, xem dạng bảng, Kanban kéo thả theo trạng thái, lịch, biểu đồ hoặc Gantt." },
        { id: "filter", path: "/w/b/contacts", target: "board-filter", title: "Lọc theo điều kiện", body: "Ghép nhiều điều kiện: nguồn, trạng thái, ngày tạo… Bấm Lưu thành nhóm khách để gửi tin hàng loạt về sau." },
        { id: "columns", path: "/w/b/contacts", target: "board-columns", optional: true, title: "Chọn cột", body: "Ẩn, hiện cột cho gọn. Kéo tiêu đề cột để đổi thứ tự, bấm vào tiêu đề để sắp xếp." },
        { id: "export", path: "/w/b/contacts", target: "board-export", perm: "record_export", optional: true, title: "Xuất Excel", body: "Tải đúng phần đang lọc về máy. Mọi lần xuất đều được ghi vào nhật ký." },
        { id: "open", path: "/w/b/contacts", target: "board-row", optional: true, title: "Mở hồ sơ", body: `Rê chuột vào một dòng rồi bấm "Mở" cạnh tên để xem chi tiết. Sửa nhanh thì bấm thẳng vào ô trên bảng.`, mobileBody: "Bấm biểu tượng mở cạnh tên để xem chi tiết. Sửa nhanh thì bấm thẳng vào ô trên bảng." },
        { id: "panel", path: "/w/b/contacts", click: "board-row-open", target: "item-tabs", optional: true, title: "Các thẻ trong hồ sơ", body: `360° tổng hợp mọi tương tác; Cập nhật để ghi chú; Việc để hẹn gọi lại. Đóng hồ sơ bằng Esc.` },
      ],
    },
    {
      id: "hop-thu",
      title: "Hộp thư",
      summary: "Lọc hội thoại, trả lời nhanh bằng /, xem hồ sơ khách và tạo đơn ngay trong chat.",
      icon: "chat",
      minutes: 1,
      page: "/w/inbox",
      steps: [
        { id: "list", path: "/w/inbox", target: "inbox-list", title: "Danh sách hội thoại", body: "Tin mới nhất ở trên. Tab Chờ đưa người đợi lâu nhất lên đầu. Phím ↑ ↓ (hoặc j k) để chọn, Enter để mở." },
        { id: "filter", path: "/w/inbox", target: "inbox-filter", title: "Bộ lọc", body: "Lọc theo trang, thẻ, người phụ trách, chưa đọc, có số điện thoại…" },
        { id: "setup", path: "/w/inbox", target: "inbox-setup", perm: "inbox_settings", optional: true, title: "Chưa có tin nhắn?", body: "Làm theo hướng dẫn kết nối Zalo OA và Messenger ở đây — chỉ cần dán link webhook." },
        { id: "composer", path: "/w/inbox", click: "inbox-item", target: "inbox-composer", optional: true, title: "Trả lời nhanh với /", body: 'Gõ "/" ở đầu ô để chọn mẫu trả lời nhanh. Enter để gửi, Shift + Enter để xuống dòng. Phím e đánh dấu xong.' },
        { id: "claim", path: "/w/inbox", target: "inbox-claim", roles: STAFF, optional: true, title: "Nhận hội thoại", body: "Hội thoại chưa ai phụ trách: bấm Nhận để người khác biết bạn đang lo." },
        { id: "crm", path: "/w/inbox", target: "inbox-crm", mobileTarget: "center", optional: true, title: "Hồ sơ khách bên cạnh", body: `Thông tin ${c}, lịch sử mua và ghi chú hiện ngay cạnh khung chat. Chưa có hồ sơ thì tạo luôn từ đây.` },
        { id: "order", path: "/w/inbox", target: "inbox-order", mobileTarget: "center", perm: "sales_create", optional: true, title: "Tạo đơn trong chat", body: "Chốt xong là lên đơn, tạo báo giá ngay mà không cần rời hộp thư." },
      ],
    },
    {
      id: "telesales",
      title: "Telesales",
      summary: "Gọi theo hàng ưu tiên, ghi kết quả và được AI chấm điểm.",
      icon: "phone",
      minutes: 1,
      page: "/w/telesales",
      steps: [
        { id: "queue", path: "/w/telesales", target: "ts-queue", optional: true, title: "Hàng gọi", body: `Danh sách ${c} nên gọi trước, đã xếp sẵn: hẹn gọi lại đến giờ, ${c} chưa gọi lần nào (điểm cao lên trước), cuộc gọi lỡ cần gọi lại.` },
        { id: "desk", path: "/w/telesales", target: "ts-desk", optional: true, title: "Gọi & ghi nhận", body: "Bấm Gọi để quay số (qua tổng đài hoặc điện thoại). Gọi xong chọn kết quả, thêm ghi âm hoặc ghi chú rồi lưu." },
        { id: "auto", path: "/w/telesales", target: "ts-auto", optional: true, title: "Gọi liên tục", body: `Bật để tự mở ${c} kế tiếp và đếm ngược quay số — gọi được nhiều hơn trong một buổi.` },
        { id: "score", path: "/w/telesales", target: "ts-tabs", title: "Chấm điểm cuộc gọi", body: "Mỗi cuộc có ghi âm được AI chấm theo phiếu. Tab Đội ngũ xếp hạng cả nhóm, tab Phiếu chấm để quản lý sửa tiêu chí." },
      ],
    },
    {
      id: "ban-hang",
      title: "Bán hàng",
      summary: "Từ sản phẩm → báo giá → đơn hàng → thu tiền.",
      icon: "cart",
      minutes: 1,
      perm: ["sales_create", "product_manage", "debt_view"],
      steps: [
        { id: "products", path: "/w/products", target: "sales-products", title: "1. Sản phẩm & giá", body: "Danh mục dịch vụ, sản phẩm và giá dùng chung: lập báo giá, đơn hàng chỉ việc chọn từ đây, không phải gõ lại." },
        { id: "quotes", path: "/w/quotes", target: "sales-quotes", title: "2. Báo giá", body: `Lập báo giá cho ${c}, gửi duyệt nếu cần rồi gửi qua Zalo, email hoặc link.` },
        { id: "orders", path: "/w/orders", target: "sales-orders", title: "3. Đơn hàng", body: "Khách đồng ý thì chuyển báo giá thành đơn chỉ một bấm. Theo dõi trạng thái giao hàng ở đây." },
        { id: "pay", path: "/w/orders", target: "sales-debts", perm: "debt_view", optional: true, title: "4. Thu tiền & công nợ", body: "Mở đơn, bấm Thu tiền để ghi phiếu thu. Trang Công nợ cho biết ai còn nợ và nợ bao lâu." },
        { id: "tip", title: "Mẹo", body: "Trong Hộp thư cũng có nút Tạo đơn và Tạo báo giá ngay cạnh khung chat." },
      ],
    },
    {
      id: "tu-dong",
      title: "Tự động hoá",
      summary: "Bật luật có sẵn để CRM tự giao việc, nhắc lịch, báo cả đội.",
      icon: "bolt",
      minutes: 1,
      page: "/w/automations",
      steps: [
        { id: "intro", path: "/w/automations", title: "Tự động hoá là gì?", body: `Luật dạng "Khi … thì …" chạy nền 24/7. Ví dụ: khi có ${c} mới thì giao cho người trực và nhắc gọi trong 15 phút.` },
        { id: "ai", path: "/w/automations", target: "auto-ai", perm: "automations_manage", optional: true, title: "Mô tả bằng lời", body: "Gõ quy trình như nói chuyện, AI dựng thành luật để bạn duyệt trước khi bật." },
        { id: "library", path: "/w/automations", target: "auto-tabs", perm: "automations_manage", title: "Thư viện mẫu", body: "Mở tab Thư viện mẫu: các luật hay dùng cho ngành của bạn, bấm một nút là dùng." },
        { id: "library-view", path: "/w/automations", target: "auto-tabs", unlessPerm: "automations_manage", title: "Luật đội đang dùng", body: "Tab Luật của bạn liệt kê các luật đang chạy, Lịch sử chạy cho biết luật nào vừa chạy. Muốn thêm hay sửa luật, nhờ chủ hoặc quản lý bật giúp." },
        { id: "new", path: "/w/automations", target: "auto-new", perm: "automations_manage", optional: true, title: "Tự ghép luật", body: "Hoặc chọn điều kiện, hành động từng phần. Tab Lịch sử chạy cho biết luật nào đã chạy, chạy lúc nào." },
      ],
    },
    {
      id: "hieu-suat",
      title: "Hiệu suất",
      summary: "Bảng xếp hạng, xu hướng, cảnh báo và hồ sơ hiệu suất từng người.",
      icon: "award",
      minutes: 1,
      page: "/w/perf/overview",
      steps: [
        { id: "range", path: "/w/perf/overview", target: "perf-range", title: "Chọn khoảng thời gian", body: "Tuần này, tháng này hay tự chọn — mọi con số so với kỳ trước liền kề." },
        { id: "board", path: "/w/perf/overview", target: "perf-board", perm: "perf_view_team", title: "Bảng chỉ số", body: "Doanh thu, cuộc gọi, tốc độ phản hồi của từng người. Màu xanh, đỏ cho biết đang hơn hay kém trung vị của đội." },
        { id: "board-me", path: "/w/perf/overview", target: "perf-board", unlessPerm: "perf_view_team", title: "Chỉ số của bạn", body: "Doanh thu, cuộc gọi, tốc độ phản hồi của bạn trong kỳ. Màu xanh, đỏ cho biết bạn đang hơn hay kém trung vị của đội." },
        { id: "person", path: "/w/perf/overview", target: "perf-board", perm: "perf_view_team", title: "Hồ sơ cá nhân", body: "Bấm vào tên một người để xem hồ sơ hiệu suất: xu hướng, điểm mạnh, việc cần cải thiện." },
        { id: "person-me", path: "/w/perf/overview", target: "perf-board", unlessPerm: "perf_view_team", title: "Hồ sơ của bạn", body: "Bấm vào tên mình để xem hồ sơ hiệu suất: xu hướng theo tuần, điểm mạnh và việc nên cải thiện." },
        { id: "alerts", path: "/w/perf/overview", target: "perf-alerts", perm: "perf_view_team", optional: true, title: "Cảnh báo", body: "Ai đang tụt chỉ số, ai để khách chờ lâu — xem để kèm cặp kịp thời." },
        { id: "alerts-me", path: "/w/perf/overview", target: "perf-alerts", unlessPerm: "perf_view_team", optional: true, title: "Cần chú ý", body: `Những điểm bạn nên xử lý sớm: chỉ số đang giảm, ${c} chờ trả lời lâu.` },
        { id: "kpi", path: "/w/kpi", target: "kpi-head", perm: "kpi_set", title: "Đặt KPI tháng", body: "Đặt chỉ tiêu cho từng người hoặc cả đội. Sang tháng mới, bấm “Chép tháng trước” cho nhanh." },
      ],
    },
    {
      id: "vai-tro",
      title: "Vai trò & quyền",
      summary: "Tạo vai trò, chọn quyền và phạm vi dữ liệu, chia phòng ban.",
      icon: "shield",
      minutes: 1,
      page: "/w/settings/roles",
      perm: ["roles_manage", "teams_manage", "members_manage"],
      steps: [
        { id: "list", path: "/w/settings/roles", target: "roles-list", perm: "roles_manage", title: "Danh sách vai trò", body: "Có sẵn Chủ, Quản lý, Nhân viên. Thêm vai trò riêng như Kế toán, Telesale, Chăm sóc khách." },
        { id: "perms", path: "/w/settings/roles", target: "roles-perms", perm: "roles_manage", title: "Quyền & phạm vi", body: `Tích quyền theo từng mô-đun và chọn phạm vi: chỉ ${c} của mình, của đội, hay toàn bộ.` },
        { id: "teams", path: "/w/settings/teams", target: "teams-head", perm: "teams_manage", title: "Phòng ban / đội", body: "Nhóm nhân viên theo đội để đặt KPI theo đội và cho trưởng nhóm xem dữ liệu của cả đội." },
        { id: "invite", path: "/w/settings", target: "settings-members", perm: "members_manage", title: "Mời thành viên", body: "Tạo link mời, chọn vai trò và gửi cho nhân viên qua Zalo. Người được mời tự đặt mật khẩu." },
      ],
    },
  ];
}

/** Các tour người này được xem (đã lọc bước theo quyền, bỏ tour không còn bước nào). */
export function toursFor(term: Term, ctx: TourCtx): Tour[] {
  return buildTours(term)
    .filter((t) => allowedFor(ctx, t))
    .map((t) => ({ ...t, steps: resolveSteps(t, ctx) }))
    .filter((t) => t.steps.length > 0);
}

/** Các bước của tour áp dụng cho người này. */
export function resolveSteps(tour: Tour, ctx: TourCtx): TourStep[] {
  return tour.steps.filter((s) => allowedFor(ctx, s));
}

/** Phần tử cần tìm cho một bước theo cỡ màn hình; null = thẻ giữa màn hình. */
export function stepTarget(step: TourStep, mobile: boolean): string | null {
  if (mobile && step.mobileTarget) return step.mobileTarget === "center" ? null : step.mobileTarget;
  return step.target ?? null;
}

/** Bước đang ở đúng trang chưa (bỏ query, khớp nguyên đường dẫn). */
export function onPath(pathname: string, path: string | undefined) {
  if (!path) return true;
  const p = path.split("?")[0].replace(/\/$/, "");
  return pathname.replace(/\/$/, "") === p;
}

/**
 * Bước kế tiếp còn dùng được theo hướng dir (+1 / -1), bỏ qua các bước đã biết là không tìm thấy.
 * Trả -1 nếu hết.
 */
export function nextIndex(steps: readonly TourStep[], from: number, dir: 1 | -1, missing: ReadonlySet<string> = new Set()) {
  for (let i = from + dir; i >= 0 && i < steps.length; i += dir) if (!missing.has(steps[i].id)) return i;
  return -1;
}

/** Tour gợi ý cho trang hiện tại ("Lần đầu ở đây?"). */
export function introTourFor(pathname: string, tours: readonly Pick<Tour, "id" | "page">[]): string | null {
  for (const t of tours) {
    if (!t.page) continue;
    if (t.page.endsWith("/") ? pathname.startsWith(t.page) && pathname.length > t.page.length : pathname === t.page) return t.id;
  }
  return null;
}
