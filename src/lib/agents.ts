export type AgentDef = { key: string; mark: string; name: string; desc: string; phase: "MVP" | "V2" | "V3"; live: boolean };

/** live = đã chạy trong bản này; còn lại hiển thị "Sắp ra mắt". */
export const AGENTS: AgentDef[] = [
  { key: "architect", mark: "DN", name: "DNA Architect", desc: "Đọc DNA, thiết kế toàn bộ CRM: giai đoạn, trường dữ liệu, dashboard, tự động hoá.", phase: "MVP", live: true },
  { key: "copilot", mark: "CP", name: "Trợ lý CRM", desc: "Ra lệnh bằng tiếng Việt: thêm khách, tạo việc, tìm, hỏi số liệu.", phase: "MVP", live: true },
  { key: "qualifier", mark: "LQ", name: "Lead Qualifier", desc: "Chấm điểm nóng/ấm/lạnh cho mỗi khách mới và giải thích lý do.", phase: "MVP", live: true },
  { key: "coach", mark: "SC", name: "Sales Coach", desc: "Gợi ý bước tiếp theo và soạn sẵn tin nhắn follow-up ngay trong từng mục.", phase: "MVP", live: true },
  { key: "briefing", mark: "DB", name: "Daily Briefing", desc: "Tóm tắt mỗi sáng: doanh thu, khách nóng, việc bị trễ.", phase: "MVP", live: true },
  { key: "retention", mark: "CR", name: "Care & Retention", desc: "Tìm khách lâu chưa quay lại, soạn tin chăm sóc cá nhân hoá.", phase: "V2", live: false },
  { key: "analyst", mark: "DA", name: "Data Analyst", desc: "Hỏi số liệu bằng lời, tự vẽ biểu đồ và giải thích nguyên nhân.", phase: "V2", live: false },
  { key: "builder", mark: "AB", name: "Automation Builder", desc: "Mô tả quy trình bằng lời, agent dựng công thức tự động hoá.", phase: "V2", live: true },
  { key: "hygiene", mark: "DH", name: "Data Hygiene", desc: "Gộp khách trùng, chuẩn hoá số điện thoại, báo mục bị bỏ quên.", phase: "V2", live: false },
  { key: "feedback", mark: "FL", name: "Vòng phản hồi", desc: "So sánh cuộc gọi thắng/thua và điểm quản lý chấm lại, đề xuất phiếu chấm và kịch bản mới để chủ duyệt.", phase: "V2", live: true },
  { key: "sources", mark: "LH", name: "Hub nguồn khách", desc: "Nhận lead từ Facebook, Google, TikTok, Zalo OA, Shopee, Haravan, website; chống trùng, gắn kênh và chiến dịch.", phase: "V2", live: true },
  { key: "chat", mark: "SA", name: "Sales Chat 24/7", desc: "Tư vấn khách trên Zalo, Messenger, website; xin số và đặt lịch.", phase: "V3", live: false },
  { key: "calls", mark: "CA", name: "Call Analyst", desc: "Chép lời ghi âm, chấm điểm từng cuộc gọi theo phiếu, trích bằng chứng, giao việc luyện kỹ năng khi điểm thấp.", phase: "V2", live: true },
  { key: "content", mark: "CT", name: "Content & Campaign", desc: "Soạn nội dung khuyến mãi theo giọng thương hiệu, chọn tệp khách.", phase: "V3", live: false },
  { key: "document", mark: "DO", name: "Document Agent", desc: "Tạo báo giá, hợp đồng từ mục bán hàng; đọc file khách gửi.", phase: "V3", live: false },
  { key: "manager", mark: "MG", name: "Manager Agent", desc: "Nhận mục tiêu tháng, lập kế hoạch và giao việc cho agent, nhân viên.", phase: "V3", live: false },
];

export const AUTONOMY = [
  { key: "suggest", label: "Chỉ gợi ý" },
  { key: "act_report", label: "Làm rồi báo" },
  { key: "auto", label: "Tự làm" },
];
