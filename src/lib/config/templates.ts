import type { Dna, IndustryKey } from "../dna";
import type { AutomationDef, ColorKey, FieldDef, ObjectDef, Option, WorkspaceConfig } from "./schema";

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "x";

const SELECT_COLORS: ColorKey[] = ["blue", "purple", "orange", "green", "darkblue", "pink", "grass", "berry"];
const opt = (label: string, color: ColorKey): Option => ({ key: slug(label), label, color });
const opts = (labels: string[]) => labels.map((l, i) => opt(l, SELECT_COLORS[i % SELECT_COLORS.length]));
const f = (label: string, type: FieldDef["type"], options: string[] = []): FieldDef => ({ key: slug(label), label, type, options: opts(options) });

type Tpl = {
  term: WorkspaceConfig["terminology"];
  contactStatuses: [string, ColorKey][];
  contactFields: FieldDef[];
  dealStatuses: [string, ColorKey][];
  dealFields: FieldDef[];
  dealAmountLabel: string;
  apptFields: FieldDef[];
  modules: WorkspaceConfig["modules"];
  kpis: WorkspaceConfig["kpis"];
  automations: AutomationDef[];
  agents: string[];
};

const APPT_STATUSES: [string, ColorKey][] = [
  ["Chờ xác nhận", "sky"],
  ["Đã xác nhận", "blue"],
  ["Hoàn thành", "green"],
  ["Huỷ", "red"],
];

const BASE_AGENTS = ["architect", "copilot", "qualifier", "coach", "briefing"];

const TPL: Record<IndustryKey, Tpl> = {
  spa: {
    term: { contact: "Khách", deal: "Liệu trình", appointment: "Lịch hẹn" },
    contactStatuses: [["Khách mới", "blue"], ["Đang chăm sóc", "orange"], ["Khách quen", "green"], ["VIP", "purple"], ["Ngừng chăm sóc", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Loại da", "select", ["Da dầu", "Da khô", "Hỗn hợp", "Nhạy cảm"]), f("Hạng thành viên", "select", ["Mới", "Bạc", "Vàng", "Kim cương"]), f("Lần ghé gần nhất", "date")],
    dealStatuses: [["Tư vấn", "orange"], ["Đặt lịch", "darkblue"], ["Đã làm", "grass"], ["Tái khám", "purple"], ["Hoàn tất", "green"], ["Huỷ", "red"]],
    dealFields: [f("Khách", "text"), f("Dịch vụ", "select", ["Chăm sóc da", "Triệt lông", "Gội dưỡng sinh", "Trị mụn"]), f("Số buổi", "number"), f("Ngày làm", "date")],
    dealAmountLabel: "Giá trị",
    apptFields: [f("Khách", "text"), f("Thời gian", "date"), f("Dịch vụ", "select", ["Chăm sóc da", "Triệt lông", "Gội dưỡng sinh", "Trị mụn"]), f("Phòng", "select", ["Phòng 1", "Phòng 2", "Phòng VIP"])],
    modules: { appointments: true, products: true, invoices: true, loyalty: true, tickets: false },
    kpis: [{ label: "Doanh thu", metric: "won_amount" }, { label: "Lịch hẹn", metric: "appointments" }, { label: "Khách mới", metric: "new_contacts" }, { label: "Khách nóng", metric: "hot_contacts" }],
    automations: [
      { triggerType: "record_created", triggerObject: "appointments", triggerValue: "", actionType: "notify", actionValue: "Gửi Zalo nhắc lịch cho khách trước 2 giờ" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "da_lam", actionType: "create_task", actionValue: "Gọi hỏi thăm {title} sau dịch vụ|3" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "hoan_tat", actionType: "create_task", actionValue: "Mời {title} tái khám|30" },
      { triggerType: "record_created", triggerObject: "contacts", triggerValue: "", actionType: "assign_owner", actionValue: "Chia đều cho nhân viên" },
    ],
    agents: [...BASE_AGENTS, "retention"],
  },
  bds: {
    term: { contact: "Khách mua", deal: "Giao dịch", appointment: "Lịch xem nhà" },
    contactStatuses: [["Lead mới", "blue"], ["Đang tư vấn", "orange"], ["Tiềm năng cao", "grass"], ["Đã mua", "green"], ["Không phù hợp", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Ngân sách", "select", ["2–3 tỷ", "3–5 tỷ", "5–8 tỷ", "Trên 8 tỷ"]), f("Loại BĐS", "select", ["Căn hộ", "Nhà phố", "Đất nền", "Biệt thự"]), f("Khu vực", "select", ["TP Thủ Đức", "Quận 7", "Bình Thạnh", "Nhà Bè"])],
    dealStatuses: [["Quan tâm", "sky"], ["Xem nhà", "orange"], ["Đàm phán", "darkblue"], ["Đặt cọc", "grass"], ["Ký HĐ", "green"], ["Thất bại", "red"]],
    dealFields: [f("Khách mua", "text"), f("Dự án", "select", ["Sông Xanh Residence", "Thảo Viên Garden", "Phú Mỹ Park", "Akira Tower"]), f("Mã căn", "text"), f("Ngày dự kiến ký", "date")],
    dealAmountLabel: "Giá trị giao dịch",
    apptFields: [f("Khách mua", "text"), f("Thời gian", "date"), f("Dự án", "select", ["Sông Xanh Residence", "Thảo Viên Garden", "Phú Mỹ Park", "Akira Tower"]), f("Điểm hẹn", "text")],
    modules: { appointments: true, products: true, invoices: false, loyalty: false, tickets: false },
    kpis: [{ label: "Giá trị đã ký", metric: "won_amount" }, { label: "Pipeline đang mở", metric: "open_amount" }, { label: "Tỉ lệ chốt", metric: "win_rate" }, { label: "Lead mới", metric: "new_contacts" }],
    automations: [
      { triggerType: "record_created", triggerObject: "contacts", triggerValue: "", actionType: "assign_owner", actionValue: "Chia xoay vòng cho sales" },
      { triggerType: "record_created", triggerObject: "contacts", triggerValue: "", actionType: "create_task", actionValue: "Gọi lọc nhu cầu {title} trong 5 phút|0" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "xem_nha", actionType: "create_task", actionValue: "Gửi bảng tính dòng tiền cho {title}|1" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "dat_coc", actionType: "notify", actionValue: "Báo kế toán chuẩn bị hồ sơ đặt cọc" },
    ],
    agents: [...BASE_AGENTS, "hygiene"],
  },
  edu: {
    term: { contact: "Học viên", deal: "Đăng ký", appointment: "Lịch tư vấn" },
    contactStatuses: [["Lead mới", "blue"], ["Đang tư vấn", "orange"], ["Đang học", "green"], ["Cựu học viên", "purple"], ["Ngừng", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Email", "email"), f("Nghề nghiệp", "text"), f("Trình độ", "select", ["Mới bắt đầu", "Cơ bản", "Nâng cao"])],
    dealStatuses: [["Lead mới", "sky"], ["Tư vấn", "orange"], ["Học thử", "darkblue"], ["Chờ đóng phí", "grass"], ["Nhập học", "green"], ["Từ chối", "red"]],
    dealFields: [f("Học viên", "text"), f("Khoá học", "select", ["AI cho chủ DN", "Marketing AI", "Bán hàng online", "Quản trị nhân sự"]), f("Lớp", "select", ["K12 · Tối 3-5", "K13 · Cuối tuần", "Online T11"]), f("Hạn đóng phí", "date")],
    dealAmountLabel: "Học phí",
    apptFields: [f("Học viên", "text"), f("Thời gian", "date"), f("Hình thức", "select", ["Gọi điện", "Zoom", "Tại văn phòng"]), f("Ghi chú", "text")],
    modules: { appointments: true, products: true, invoices: true, loyalty: false, tickets: true },
    kpis: [{ label: "Học phí thu được", metric: "won_amount" }, { label: "Lịch tư vấn", metric: "appointments" }, { label: "Tỉ lệ nhập học", metric: "win_rate" }, { label: "Lead mới", metric: "new_contacts" }],
    automations: [
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "hoc_thu", actionType: "create_task", actionValue: "Gọi chốt học phí với {title}|1" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "cho_dong_phi", actionType: "create_task", actionValue: "Nhắc {title} đóng học phí|3" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "nhap_hoc", actionType: "notify", actionValue: "Gửi Zalo chào mừng và lịch học" },
      { triggerType: "record_created", triggerObject: "contacts", triggerValue: "", actionType: "assign_owner", actionValue: "Chia đều cho tư vấn viên" },
    ],
    agents: [...BASE_AGENTS, "retention"],
  },
  retail: {
    term: { contact: "Khách hàng", deal: "Đơn hàng", appointment: "Lịch" },
    contactStatuses: [["Mới", "blue"], ["Đã mua 1 lần", "orange"], ["Thân thiết", "green"], ["VIP", "purple"], ["Ngủ đông", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Kênh mua", "select", ["Shopee", "TikTok Shop", "Website", "Cửa hàng"]), f("Tổng chi tiêu", "money"), f("Sinh nhật", "date")],
    dealStatuses: [["Mới", "sky"], ["Xác nhận", "orange"], ["Đang giao", "darkblue"], ["Hoàn tất", "green"], ["Hoàn trả", "berry"]],
    dealFields: [f("Khách hàng", "text"), f("Sản phẩm", "select", ["Serum dưỡng", "Tinh dầu", "Hộp quà", "Sữa rửa mặt"]), f("Đơn vị giao", "select", ["GHN", "GHTK", "Tự giao"]), f("Ngày đặt", "date")],
    dealAmountLabel: "Giá trị đơn",
    apptFields: [f("Khách hàng", "text"), f("Thời gian", "date"), f("Nội dung", "text"), f("Kênh", "select", ["Gọi điện", "Tại cửa hàng"])],
    modules: { appointments: false, products: true, invoices: true, loyalty: true, tickets: true },
    kpis: [{ label: "Doanh thu", metric: "won_amount" }, { label: "Đơn đang xử lý", metric: "open_amount" }, { label: "Khách mới", metric: "new_contacts" }, { label: "Tỉ lệ hoàn tất", metric: "win_rate" }],
    automations: [
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "hoan_tat", actionType: "create_task", actionValue: "Xin đánh giá từ {title}|5" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "hoan_tra", actionType: "notify", actionValue: "Tạo yêu cầu CSKH cho đơn hoàn trả" },
      { triggerType: "record_created", triggerObject: "deals", triggerValue: "", actionType: "create_task", actionValue: "Gọi xác nhận đơn {title}|0" },
    ],
    agents: [...BASE_AGENTS, "retention", "hygiene"],
  },
  b2b: {
    term: { contact: "Khách hàng DN", deal: "Cơ hội", appointment: "Lịch gặp" },
    contactStatuses: [["Tiềm năng", "blue"], ["Đang làm việc", "orange"], ["Khách hàng", "green"], ["Chiến lược", "purple"], ["Ngừng", "gray"]],
    contactFields: [f("Công ty", "text"), f("Chức vụ", "select", ["CEO", "Giám đốc", "Trưởng phòng mua hàng", "Kế toán trưởng"]), f("SĐT", "phone"), f("Quy mô", "select", ["10–50", "50–200", "200+"])],
    dealStatuses: [["Tiếp cận", "sky"], ["Khảo sát", "orange"], ["Báo giá", "darkblue"], ["Thương thảo", "grass"], ["Ký hợp đồng", "green"], ["Thua", "red"]],
    dealFields: [f("Công ty", "text"), f("Giải pháp", "select", ["Quản lý kho", "ERP", "Bảo trì hệ thống"]), f("Số tháng HĐ", "number"), f("Ngày dự kiến chốt", "date")],
    dealAmountLabel: "Giá trị dự kiến",
    apptFields: [f("Công ty", "text"), f("Thời gian", "date"), f("Mục đích", "select", ["Demo", "Khảo sát", "Họp báo giá", "Ký hợp đồng"]), f("Địa điểm", "text")],
    modules: { appointments: true, products: true, invoices: true, loyalty: false, tickets: true },
    kpis: [{ label: "Giá trị đã ký", metric: "won_amount" }, { label: "Pipeline đang mở", metric: "open_amount" }, { label: "Tỉ lệ thắng", metric: "win_rate" }, { label: "Cuộc gặp", metric: "appointments" }],
    automations: [
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "bao_gia", actionType: "create_task", actionValue: "Gửi báo giá PDF cho {title}|1" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "ky_hop_dong", actionType: "notify", actionValue: "Báo kế toán và đội triển khai" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "thuong_thao", actionType: "create_task", actionValue: "Họp nội bộ chốt điều khoản {title}|2" },
    ],
    agents: [...BASE_AGENTS, "document"],
  },
  dental: {
    term: { contact: "Bệnh nhân", deal: "Phác đồ", appointment: "Lịch khám" },
    contactStatuses: [["Khách mới", "blue"], ["Đang điều trị", "orange"], ["Tái khám định kỳ", "green"], ["VIP", "purple"], ["Ngừng", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Năm sinh", "number"), f("Tiền sử bệnh", "text"), f("Lần khám gần nhất", "date")],
    dealStatuses: [["Đặt lịch khám", "sky"], ["Đã tư vấn", "orange"], ["Chờ quyết định", "darkblue"], ["Đang điều trị", "grass"], ["Hoàn tất", "green"], ["Không điều trị", "red"]],
    dealFields: [f("Bệnh nhân", "text"), f("Dịch vụ", "select", ["Niềng răng", "Implant", "Bọc sứ", "Tẩy trắng", "Cạo vôi"]), f("Số lần hẹn", "number"), f("Bác sĩ", "select", ["BS. Hằng", "BS. Quân", "BS. Phương"])],
    dealAmountLabel: "Chi phí điều trị",
    apptFields: [f("Bệnh nhân", "text"), f("Thời gian", "date"), f("Bác sĩ", "select", ["BS. Hằng", "BS. Quân", "BS. Phương"]), f("Ghế", "select", ["Ghế 1", "Ghế 2", "Ghế 3"])],
    modules: { appointments: true, products: true, invoices: true, loyalty: false, tickets: true },
    kpis: [{ label: "Doanh thu điều trị", metric: "won_amount" }, { label: "Lịch khám", metric: "appointments" }, { label: "Tỉ lệ nhận điều trị", metric: "win_rate" }, { label: "Bệnh nhân mới", metric: "new_contacts" }],
    automations: [
      { triggerType: "record_created", triggerObject: "appointments", triggerValue: "", actionType: "notify", actionValue: "Gửi Zalo nhắc lịch khám trước 1 ngày" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "cho_quyet_dinh", actionType: "create_task", actionValue: "Gọi tư vấn lại cho {title}|2" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "hoan_tat", actionType: "create_task", actionValue: "Hẹn {title} tái khám định kỳ|180" },
      { triggerType: "record_created", triggerObject: "contacts", triggerValue: "", actionType: "assign_owner", actionValue: "Chia đều cho lễ tân tư vấn" },
    ],
    agents: [...BASE_AGENTS, "retention"],
  },
  fnb: {
    term: { contact: "Khách", deal: "Đơn đặt", appointment: "Đặt bàn" },
    contactStatuses: [["Khách mới", "blue"], ["Khách quen", "green"], ["VIP", "purple"], ["Công ty đặt tiệc", "darkblue"], ["Ngủ đông", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Sinh nhật", "date"), f("Món yêu thích", "text"), f("Dị ứng / ghi chú", "text")],
    dealStatuses: [["Yêu cầu mới", "sky"], ["Chốt thực đơn", "orange"], ["Đã cọc", "darkblue"], ["Đã phục vụ", "green"], ["Huỷ", "red"]],
    dealFields: [f("Khách", "text"), f("Loại", "select", ["Đặt bàn", "Tiệc sinh nhật", "Tiệc công ty", "Đặt cỗ mang về"]), f("Số khách", "number"), f("Ngày phục vụ", "date")],
    dealAmountLabel: "Giá trị đơn",
    apptFields: [f("Khách", "text"), f("Thời gian", "date"), f("Số khách", "number"), f("Khu vực", "select", ["Tầng 1", "Tầng 2", "Phòng VIP", "Sân vườn"])],
    modules: { appointments: true, products: true, invoices: true, loyalty: true, tickets: false },
    kpis: [{ label: "Doanh thu đơn đặt", metric: "won_amount" }, { label: "Lượt đặt bàn", metric: "appointments" }, { label: "Khách mới", metric: "new_contacts" }, { label: "Đơn đang chờ", metric: "open_amount" }],
    automations: [
      { triggerType: "record_created", triggerObject: "appointments", triggerValue: "", actionType: "notify", actionValue: "Gửi Zalo xác nhận đặt bàn cho khách" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "chot_thuc_don", actionType: "create_task", actionValue: "Nhắc {title} chuyển cọc|1" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "da_coc", actionType: "notify", actionValue: "Báo bếp chuẩn bị nguyên liệu" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "da_phuc_vu", actionType: "create_task", actionValue: "Xin đánh giá từ {title}|1" },
    ],
    agents: [...BASE_AGENTS, "retention"],
  },
  auto: {
    term: { contact: "Khách mua xe", deal: "Cơ hội", appointment: "Lịch lái thử" },
    contactStatuses: [["Lead mới", "blue"], ["Đang tư vấn", "orange"], ["Đã mua xe", "green"], ["Khách bảo dưỡng", "purple"], ["Ngừng", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Dòng xe quan tâm", "select", ["Sedan hạng B", "SUV 5 chỗ", "SUV 7 chỗ", "Bán tải", "Xe điện"]), f("Hình thức mua", "select", ["Trả thẳng", "Trả góp"]), f("Xe đang dùng", "text")],
    dealStatuses: [["Hỏi giá", "sky"], ["Lái thử", "orange"], ["Báo giá lăn bánh", "darkblue"], ["Đặt cọc", "grass"], ["Giao xe", "green"], ["Mất khách", "red"]],
    dealFields: [f("Khách mua xe", "text"), f("Phiên bản", "select", ["Tiêu chuẩn", "Cao cấp", "Đặc biệt"]), f("Màu xe", "select", ["Trắng", "Đen", "Đỏ", "Xám"]), f("Ngày dự kiến giao", "date")],
    dealAmountLabel: "Giá lăn bánh",
    apptFields: [f("Khách mua xe", "text"), f("Thời gian", "date"), f("Mục đích", "select", ["Lái thử", "Bảo dưỡng", "Giao xe"]), f("Cố vấn", "text")],
    modules: { appointments: true, products: true, invoices: true, loyalty: false, tickets: true },
    kpis: [{ label: "Doanh số đã giao", metric: "won_amount" }, { label: "Pipeline đang mở", metric: "open_amount" }, { label: "Tỉ lệ chốt", metric: "win_rate" }, { label: "Lịch lái thử", metric: "appointments" }],
    automations: [
      { triggerType: "record_created", triggerObject: "contacts", triggerValue: "", actionType: "assign_owner", actionValue: "Chia xoay vòng cho tư vấn bán hàng" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "lai_thu", actionType: "create_task", actionValue: "Gửi báo giá lăn bánh cho {title}|1" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "dat_coc", actionType: "notify", actionValue: "Báo phòng hồ sơ chuẩn bị đăng ký xe" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "giao_xe", actionType: "create_task", actionValue: "Nhắc {title} bảo dưỡng lần đầu|30" },
    ],
    agents: [...BASE_AGENTS, "retention"],
  },
  insurance: {
    term: { contact: "Khách hàng", deal: "Hợp đồng", appointment: "Lịch hẹn tư vấn" },
    contactStatuses: [["Tiềm năng", "blue"], ["Đang tư vấn", "orange"], ["Đã tham gia", "green"], ["Khách VIP", "purple"], ["Ngừng", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Năm sinh", "number"), f("Gia đình", "select", ["Độc thân", "Đã kết hôn", "Có con nhỏ"]), f("Thu nhập", "select", ["Dưới 15 tr", "15–30 tr", "30–60 tr", "Trên 60 tr"])],
    dealStatuses: [["Tiếp cận", "sky"], ["Phân tích nhu cầu", "orange"], ["Gửi giải pháp", "darkblue"], ["Ký hồ sơ", "grass"], ["Phát hành HĐ", "green"], ["Từ chối", "red"]],
    dealFields: [f("Khách hàng", "text"), f("Sản phẩm", "select", ["Nhân thọ", "Sức khoẻ", "Giáo dục", "Hưu trí"]), f("Kỳ đóng phí", "select", ["Năm", "Nửa năm", "Quý"]), f("Ngày tái tục", "date")],
    dealAmountLabel: "Phí bảo hiểm/năm",
    apptFields: [f("Khách hàng", "text"), f("Thời gian", "date"), f("Hình thức", "select", ["Gặp trực tiếp", "Gọi video", "Gọi điện"]), f("Ghi chú", "text")],
    modules: { appointments: true, products: true, invoices: false, loyalty: false, tickets: true },
    kpis: [{ label: "Phí đã phát hành", metric: "won_amount" }, { label: "Phí đang tư vấn", metric: "open_amount" }, { label: "Tỉ lệ chốt", metric: "win_rate" }, { label: "Khách mới", metric: "new_contacts" }],
    automations: [
      { triggerType: "record_created", triggerObject: "contacts", triggerValue: "", actionType: "create_task", actionValue: "Hẹn gặp phân tích nhu cầu với {title}|1" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "gui_giai_phap", actionType: "create_task", actionValue: "Gọi giải đáp thắc mắc cho {title}|2" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "phat_hanh_hd", actionType: "create_task", actionValue: "Gửi quà cảm ơn {title}|3" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "phat_hanh_hd", actionType: "notify", actionValue: "Ghi nhận doanh số vào báo cáo tuần" },
    ],
    agents: [...BASE_AGENTS, "retention", "document"],
  },
  interior: {
    term: { contact: "Chủ nhà", deal: "Dự án", appointment: "Lịch khảo sát" },
    contactStatuses: [["Mới liên hệ", "blue"], ["Đang tư vấn", "orange"], ["Đã ký", "green"], ["Khách giới thiệu", "purple"], ["Ngừng", "gray"]],
    contactFields: [f("SĐT", "phone"), f("Loại công trình", "select", ["Căn hộ", "Nhà phố", "Biệt thự", "Văn phòng"]), f("Diện tích (m²)", "number"), f("Địa chỉ công trình", "text")],
    dealStatuses: [["Nhận yêu cầu", "sky"], ["Khảo sát", "orange"], ["Thiết kế", "darkblue"], ["Báo giá", "purple"], ["Thi công", "grass"], ["Bàn giao", "green"], ["Huỷ", "red"]],
    dealFields: [f("Chủ nhà", "text"), f("Phong cách", "select", ["Hiện đại", "Tối giản", "Bắc Âu", "Indochine"]), f("Hạng mục", "select", ["Thiết kế", "Thi công trọn gói", "Đồ gỗ đặt làm"]), f("Ngày bàn giao dự kiến", "date")],
    dealAmountLabel: "Giá trị hợp đồng",
    apptFields: [f("Chủ nhà", "text"), f("Thời gian", "date"), f("Mục đích", "select", ["Khảo sát", "Trình bày thiết kế", "Nghiệm thu"]), f("Địa điểm", "text")],
    modules: { appointments: true, products: true, invoices: true, loyalty: false, tickets: true },
    kpis: [{ label: "Giá trị đã bàn giao", metric: "won_amount" }, { label: "Dự án đang chạy", metric: "open_amount" }, { label: "Tỉ lệ ký", metric: "win_rate" }, { label: "Lịch khảo sát", metric: "appointments" }],
    automations: [
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "khao_sat", actionType: "create_task", actionValue: "Gửi bản vẽ ý tưởng cho {title}|5" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "bao_gia", actionType: "create_task", actionValue: "Gọi chốt báo giá với {title}|3" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "thi_cong", actionType: "notify", actionValue: "Báo đội thi công lên kế hoạch và vật tư" },
      { triggerType: "status_changed", triggerObject: "deals", triggerValue: "ban_giao", actionType: "create_task", actionValue: "Kiểm tra bảo hành với {title}|90" },
    ],
    agents: [...BASE_AGENTS, "document"],
  },
};

const statuses = (list: [string, ColorKey][]) => list.map(([l, c]) => opt(l, c));

/** Tầng 1 của Config Engine: template ngành + điền theo DNA. Luôn chạy được, không cần AI. */
export function buildTemplate(dna: Dna): WorkspaceConfig {
  const t = TPL[dna.industry];
  const sourceField = f("Nguồn", "select", dna.channels.length ? dna.channels : ["Facebook", "Zalo"]);
  const objects: ObjectDef[] = [
    {
      key: "contacts",
      label: t.term.contact,
      itemLabel: t.term.contact,
      description: `Danh sách ${t.term.contact.toLowerCase()} của ${dna.businessName}`,
      statusLabel: "Tình trạng",
      statuses: statuses(t.contactStatuses),
      fields: [...t.contactFields, sourceField],
      amountLabel: "",
    },
    {
      key: "deals",
      label: t.term.deal,
      itemLabel: t.term.deal,
      description: `Theo dõi ${t.term.deal.toLowerCase()} theo từng giai đoạn bán hàng`,
      statusLabel: "Giai đoạn",
      statuses: statuses(t.dealStatuses),
      fields: t.dealFields,
      amountLabel: t.dealAmountLabel,
    },
  ];
  const appt = dna.hasAppointments && t.modules.appointments;
  if (appt) {
    objects.push({
      key: "appointments",
      label: t.term.appointment,
      itemLabel: t.term.appointment,
      description: `${t.term.appointment} với ${t.term.contact.toLowerCase()}`,
      statusLabel: "Trạng thái",
      statuses: statuses(APPT_STATUSES),
      fields: t.apptFields,
      amountLabel: "",
    });
  }
  const team = ["Bạn", ...dna.teamMembers.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)].slice(0, 8);
  return {
    version: 1,
    industry: dna.industry,
    businessName: dna.businessName,
    terminology: t.term,
    modules: { ...t.modules, appointments: appt },
    objects,
    kpis: t.kpis,
    automations: t.automations.filter((a) => appt || a.triggerObject !== "appointments"),
    team,
    agents: dna.repeatPurchase ? t.agents : t.agents.filter((a) => a !== "retention"),
  };
}
