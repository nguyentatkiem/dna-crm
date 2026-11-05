export type AgentStatus = "live" | "beta" | "soon";
export type AgentCategory = "sales" | "care" | "marketing" | "insight" | "platform";

export type AgentDef = {
  key: string;
  mark: string;
  name: string;
  desc: string;
  phase: "MVP" | "V2" | "V3";
  /** true = bật được trong bản này; false hiển thị "Sắp ra mắt". */
  live: boolean;
  status: AgentStatus;
  category: AgentCategory;
  icon: string;
  color: string;
  /** Trang làm việc của agent (để trống: agent chạy nền). */
  href?: string;
};

export const AGENT_CATEGORIES: { key: AgentCategory; label: string }[] = [
  { key: "sales", label: "Bán hàng" },
  { key: "care", label: "Hộp thư & chăm sóc" },
  { key: "marketing", label: "Marketing" },
  { key: "insight", label: "Phân tích & dự báo" },
  { key: "platform", label: "Nền tảng" },
];

export const STATUS_LABEL: Record<AgentStatus, string> = { live: "Đang chạy", beta: "Thử nghiệm", soon: "Sắp ra mắt" };

export const AGENTS: AgentDef[] = [
  // Nền tảng
  { key: "architect", mark: "DN", name: "DNA Architect", desc: "Đọc DNA, thiết kế toàn bộ CRM: giai đoạn, trường dữ liệu, dashboard, tự động hoá.", phase: "MVP", live: true, status: "live", category: "platform", icon: "dna", color: "#a25ddc", href: "/w/settings" },
  { key: "copilot", mark: "CP", name: "Trợ lý CRM", desc: "Ra lệnh bằng tiếng Việt: thêm khách, tạo việc, hỏi số liệu, cuộc gọi, tin chưa đọc, ROAS.", phase: "MVP", live: true, status: "live", category: "platform", icon: "spark", color: "#0073ea" },
  { key: "builder", mark: "AB", name: "Automation Builder", desc: "Mô tả quy trình bằng lời, agent dựng công thức nhiều điều kiện, nhiều hành động (tạo việc, gửi Zalo/SMS/email, giao người, chạy kịch bản chăm sóc).", phase: "V2", live: true, status: "live", category: "platform", icon: "bolt", color: "#fdab3d", href: "/w/automations" },
  { key: "hygiene", mark: "DH", name: "Data Hygiene", desc: "Gộp khách trùng, chuẩn hoá số điện thoại, báo mục bị bỏ quên.", phase: "V2", live: false, status: "soon", category: "platform", icon: "refresh", color: "#676879", href: "/w/b/contacts" },
  { key: "manager", mark: "MG", name: "Manager Agent", desc: "Nhận mục tiêu tháng, lập kế hoạch và giao việc cho agent, nhân viên.", phase: "V3", live: false, status: "soon", category: "platform", icon: "target", color: "#676879" },
  // Bán hàng
  { key: "qualifier", mark: "LQ", name: "Lead Qualifier", desc: "Chấm điểm nóng/ấm/lạnh cho mỗi khách mới và giải thích lý do.", phase: "MVP", live: true, status: "live", category: "sales", icon: "spark", color: "#df2f4a", href: "/w/b/contacts" },
  { key: "coach", mark: "SC", name: "Sales Coach", desc: "Gợi ý bước tiếp theo và soạn sẵn tin nhắn follow-up ngay trong từng mục.", phase: "MVP", live: true, status: "live", category: "sales", icon: "person", color: "#00c875", href: "/w/b/deals" },
  { key: "live_call", mark: "LC", name: "Live Call Assist", desc: "Trong lúc gọi: gợi ý câu trả lời phản đối, nhắc thông tin khách, ghi chú tự động và tóm tắt ngay sau cuộc gọi.", phase: "V2", live: true, status: "beta", category: "sales", icon: "headset", color: "#00c875", href: "/w/telesales" },
  { key: "calls", mark: "CA", name: "Call Analyst", desc: "Chép lời ghi âm, chấm điểm từng cuộc gọi theo phiếu, trích bằng chứng, giao việc luyện kỹ năng khi điểm thấp.", phase: "V2", live: true, status: "live", category: "sales", icon: "mic", color: "#0086c0", href: "/w/telesales" },
  { key: "feedback", mark: "FL", name: "Vòng phản hồi", desc: "So sánh cuộc gọi thắng/thua và điểm quản lý chấm lại, đề xuất phiếu chấm và kịch bản mới để chủ duyệt.", phase: "V2", live: true, status: "live", category: "sales", icon: "history", color: "#0086c0", href: "/w/telesales" },
  { key: "sources", mark: "LH", name: "Hub nguồn khách", desc: "Nhận lead từ Facebook, Google, TikTok, Zalo OA, Shopee, Haravan, website; chống trùng, gắn kênh và chiến dịch.", phase: "V2", live: true, status: "live", category: "sales", icon: "inbox", color: "#579bfc", href: "/w/sources" },
  { key: "document", mark: "DO", name: "Document Agent", desc: "Tạo báo giá, hợp đồng từ mục bán hàng; đọc file khách gửi.", phase: "V3", live: false, status: "soon", category: "sales", icon: "doc", color: "#676879", href: "/w/docs" },
  // Hộp thư & chăm sóc
  { key: "inbox", mark: "IA", name: "Inbox Assistant", desc: "Đọc hội thoại Zalo, Messenger, website; soạn sẵn câu trả lời theo giọng thương hiệu, gắn khách và nhắc tin chờ lâu.", phase: "V2", live: true, status: "beta", category: "care", icon: "chat", color: "#579bfc", href: "/w/inbox" },
  { key: "nurture", mark: "NW", name: "Nurture Writer", desc: "Viết kịch bản chăm sóc nhiều bước (Zalo, ZNS, SMS, email) theo ngành và giai đoạn của khách.", phase: "V2", live: true, status: "beta", category: "care", icon: "edit", color: "#ff158a", href: "/w/marketing" },
  { key: "retention", mark: "CR", name: "Care & Retention", desc: "Tìm khách lâu chưa quay lại, soạn tin chăm sóc cá nhân hoá.", phase: "V2", live: false, status: "soon", category: "care", icon: "gift", color: "#676879", href: "/w/marketing" },
  { key: "chat", mark: "SA", name: "Sales Chat 24/7", desc: "Tư vấn khách trên Zalo, Messenger, website; xin số và đặt lịch.", phase: "V3", live: false, status: "soon", category: "care", icon: "sms", color: "#676879", href: "/w/inbox" },
  // Marketing
  { key: "marketing", mark: "MA", name: "Marketing Analyst", desc: "Ghép chi phí quảng cáo với lead và đơn chốt, tính CPL, ROAS từng chiến dịch và đề xuất tăng/giảm ngân sách.", phase: "V2", live: true, status: "beta", category: "marketing", icon: "megaphone", color: "#fdab3d", href: "/w/marketing" },
  { key: "content", mark: "CT", name: "Content & Campaign", desc: "Soạn nội dung khuyến mãi theo giọng thương hiệu, chọn tệp khách.", phase: "V3", live: false, status: "soon", category: "marketing", icon: "send", color: "#676879", href: "/w/marketing" },
  // Phân tích & dự báo
  { key: "briefing", mark: "DB", name: "Daily Briefing", desc: "Tóm tắt mỗi sáng: doanh thu, khách nóng, việc bị trễ, hẹn gọi lại, tin chưa đọc.", phase: "MVP", live: true, status: "live", category: "insight", icon: "clock", color: "#a25ddc", href: "/w" },
  { key: "forecast", mark: "FC", name: "Forecast", desc: "Học từ các deal đã đóng để ước tính % khả năng chốt từng mục và doanh thu kỳ vọng theo tháng.", phase: "V2", live: true, status: "beta", category: "insight", icon: "trend", color: "#00c875", href: "/w" },
  { key: "dashboard", mark: "DS", name: "Dashboard Builder", desc: "Mô tả báo cáo bằng lời, agent dựng dashboard gồm số lớn, biểu đồ, phễu và bảng xếp hạng.", phase: "V2", live: true, status: "beta", category: "insight", icon: "chart", color: "#0086c0", href: "/w/dashboards" },
  { key: "analyst", mark: "DA", name: "Data Analyst", desc: "Hỏi số liệu bằng lời, tự vẽ biểu đồ và giải thích nguyên nhân.", phase: "V2", live: false, status: "soon", category: "insight", icon: "pie", color: "#676879", href: "/w/dashboards" },
];

export const AUTONOMY = [
  { key: "suggest", label: "Chỉ gợi ý" },
  { key: "act_report", label: "Làm rồi báo" },
  { key: "auto", label: "Tự làm" },
];
