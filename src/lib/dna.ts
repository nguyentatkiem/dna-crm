import { z } from "zod";

export const INDUSTRIES = {
  spa: { mark: "SP", label: "Spa & Thẩm mỹ", desc: "Liệu trình, đặt lịch, tái khám" },
  bds: { mark: "BĐ", label: "Bất động sản", desc: "Dự án, xem nhà, đặt cọc" },
  edu: { mark: "GD", label: "Giáo dục & Đào tạo", desc: "Khoá học, học thử, đóng phí" },
  retail: { mark: "BL", label: "Bán lẻ & E-commerce", desc: "Đơn hàng, đa kênh, tích điểm" },
  b2b: { mark: "B2", label: "Dịch vụ B2B", desc: "Cơ hội, báo giá, hợp đồng" },
  dental: { mark: "NK", label: "Nha khoa & Phòng khám", desc: "Bệnh nhân, phác đồ, tái khám" },
  fnb: { mark: "FB", label: "Nhà hàng & F&B", desc: "Đặt bàn, tiệc, khách quen" },
  auto: { mark: "OT", label: "Ô tô & Xe máy", desc: "Lái thử, báo giá, bảo dưỡng" },
  insurance: { mark: "BH", label: "Bảo hiểm & Tài chính", desc: "Tư vấn, hợp đồng, tái tục" },
  interior: { mark: "NT", label: "Nội thất & Xây dựng", desc: "Khảo sát, thiết kế, thi công" },
} as const;
export type IndustryKey = keyof typeof INDUSTRIES;

export const CHANNELS = ["Facebook", "Zalo", "TikTok", "Website", "Hotline", "Khách vãng lai", "Giới thiệu"];
export const CYCLES = ["Trong ngày", "1–4 tuần", "1–3 tháng", "Trên 3 tháng"];
export const TEAM_SIZES = ["Chỉ mình tôi", "2–5 người", "6–20 người", "Trên 20 người"];
export const KPI_CHOICES = ["Doanh thu", "Số khách mới", "Tỉ lệ chốt", "Số lịch hẹn", "Tỉ lệ quay lại", "Khách nóng"];

export const DnaSchema = z.object({
  industry: z.enum(Object.keys(INDUSTRIES) as [IndustryKey, ...IndustryKey[]]),
  businessName: z.string().min(1).max(120),
  model: z.enum(["B2C", "B2B", "Cả hai"]),
  products: z.string().max(1000),
  targetCustomer: z.string().max(1000),
  channels: z.array(z.string()).max(10),
  salesCycle: z.string(),
  repeatPurchase: z.boolean(),
  hasAppointments: z.boolean(),
  salesSteps: z.string().max(1500),
  teamSize: z.string(),
  teamMembers: z.string().max(500),
  kpis: z.array(z.string()).max(10),
  painPoints: z.string().max(1500),
});
export type Dna = z.infer<typeof DnaSchema>;

/** Gợi ý điền sẵn theo ngành để học viên chỉ cần sửa. */
export const DNA_HINTS: Record<IndustryKey, Pick<Dna, "businessName" | "products" | "targetCustomer" | "salesSteps" | "hasAppointments" | "repeatPurchase" | "model">> = {
  spa: {
    businessName: "Hương Spa",
    model: "B2C",
    products: "Chăm sóc da, triệt lông, gội dưỡng sinh, trị mụn",
    targetCustomer: "Nữ 25–45 tuổi, dân văn phòng, thu nhập khá, sống gần cơ sở",
    salesSteps: "Khách nhắn fanpage → tư vấn → đặt lịch → làm dịch vụ → hỏi thăm sau 3 ngày → hẹn tái khám",
    hasAppointments: true,
    repeatPurchase: true,
  },
  bds: {
    businessName: "An Cư Land",
    model: "B2C",
    products: "Căn hộ, nhà phố, đất nền khu Đông",
    targetCustomer: "Gia đình trẻ 30–45 tuổi mua để ở, nhà đầu tư nhỏ ngân sách 3–8 tỷ",
    salesSteps: "Lead quảng cáo → gọi lọc nhu cầu → dẫn xem nhà → đàm phán → đặt cọc → ký hợp đồng",
    hasAppointments: true,
    repeatPurchase: false,
  },
  edu: {
    businessName: "Học viện AI Thực Chiến",
    model: "B2C",
    products: "Khoá AI cho chủ doanh nghiệp, Marketing AI, Bán hàng online",
    targetCustomer: "Chủ doanh nghiệp nhỏ, quản lý 28–50 tuổi muốn ứng dụng AI",
    salesSteps: "Lead webinar → tư vấn 1-1 → học thử → chốt học phí → nhập học → mời khoá nâng cao",
    hasAppointments: true,
    repeatPurchase: true,
  },
  retail: {
    businessName: "Mộc Nhiên Store",
    model: "B2C",
    products: "Mỹ phẩm thiên nhiên, tinh dầu, quà tặng",
    targetCustomer: "Nữ 20–35 tuổi mua online qua Shopee, TikTok Shop",
    salesSteps: "Khách nhắn hỏi → chốt đơn → xác nhận → giao hàng → xin đánh giá → mời mua lại",
    hasAppointments: false,
    repeatPurchase: true,
  },
  b2b: {
    businessName: "Tín Việt Solutions",
    model: "B2B",
    products: "Phần mềm quản lý kho, triển khai ERP, bảo trì hệ thống",
    targetCustomer: "Doanh nghiệp sản xuất, thương mại 50–500 nhân sự",
    salesSteps: "Tiếp cận → khảo sát nhu cầu → demo → báo giá → thương thảo → ký hợp đồng",
    hasAppointments: true,
    repeatPurchase: true,
  },
  dental: {
    businessName: "Nha khoa Nụ Cười Việt",
    model: "B2C",
    products: "Niềng răng, implant, bọc sứ, tẩy trắng, cạo vôi",
    targetCustomer: "Người đi làm 22–50 tuổi quan tâm thẩm mỹ răng, phụ huynh đưa con đi khám",
    salesSteps: "Khách nhắn hỏi giá → đặt lịch khám → chụp phim và tư vấn phác đồ → báo giá → điều trị → tái khám định kỳ",
    hasAppointments: true,
    repeatPurchase: true,
  },
  fnb: {
    businessName: "Bếp Nhà Mây",
    model: "B2C",
    products: "Món Việt gia đình, set trưa văn phòng, tiệc sinh nhật, đặt cỗ",
    targetCustomer: "Gia đình và nhóm bạn 25–45 tuổi, công ty đặt tiệc quanh khu vực",
    salesSteps: "Khách nhắn đặt bàn/tiệc → xác nhận thực đơn → nhận cọc → phục vụ → xin đánh giá → mời quay lại",
    hasAppointments: true,
    repeatPurchase: true,
  },
  auto: {
    businessName: "Thành Đạt Auto",
    model: "B2C",
    products: "Xe mới, xe lướt, bảo dưỡng, phụ kiện, bảo hiểm xe",
    targetCustomer: "Gia đình trẻ mua xe lần đầu, chủ doanh nghiệp đổi xe 30–55 tuổi",
    salesSteps: "Lead hỏi giá → tư vấn → hẹn lái thử → báo giá lăn bánh → đặt cọc → giao xe → nhắc bảo dưỡng",
    hasAppointments: true,
    repeatPurchase: true,
  },
  insurance: {
    businessName: "An Tâm Insurance",
    model: "B2C",
    products: "Bảo hiểm nhân thọ, sức khoẻ, giáo dục, bảo hiểm doanh nghiệp",
    targetCustomer: "Gia đình có con nhỏ, người đi làm 28–50 tuổi thu nhập ổn định",
    salesSteps: "Tiếp cận → hẹn gặp phân tích nhu cầu → thiết kế giải pháp → ký hồ sơ → phát hành hợp đồng → chăm sóc và tái tục",
    hasAppointments: true,
    repeatPurchase: true,
  },
  interior: {
    businessName: "Mộc Gia Interior",
    model: "Cả hai",
    products: "Thiết kế nội thất căn hộ, nhà phố, thi công trọn gói, đồ gỗ đặt làm",
    targetCustomer: "Chủ căn hộ mới nhận nhà, chủ nhà phố sửa chữa, văn phòng nhỏ",
    salesSteps: "Nhận yêu cầu → khảo sát hiện trạng → lên ý tưởng thiết kế → báo giá → ký hợp đồng → thi công → bàn giao, bảo hành",
    hasAppointments: true,
    repeatPurchase: false,
  },
};

export function defaultDna(industry: IndustryKey = "spa"): Dna {
  return {
    industry,
    ...DNA_HINTS[industry],
    channels: ["Facebook", "Zalo"],
    salesCycle: "1–4 tuần",
    teamSize: "2–5 người",
    teamMembers: "Thu Trang, Minh Đức",
    kpis: ["Doanh thu", "Số khách mới", "Tỉ lệ chốt"],
    painPoints: "Hay quên chăm sóc lại khách cũ, không biết kênh nào ra khách",
  };
}
