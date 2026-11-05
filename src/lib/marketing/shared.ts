// Phần dùng chung cho cả server và trình duyệt: không import db hay node API ở đây.

export type MsgChannel = "zalo" | "zns" | "sms" | "email" | "messenger";

export const CHANNEL_LABEL: Record<MsgChannel, string> = {
  zalo: "Zalo OA",
  zns: "Zalo ZNS",
  sms: "SMS",
  email: "Email",
  messenger: "Messenger",
};
export const CHANNEL_COLOR: Record<MsgChannel, string> = { zalo: "#0068ff", zns: "#00a2ff", sms: "#00c875", email: "#a25ddc", messenger: "#1877f2" };

export const STATUS_LABEL: Record<string, [string, string]> = {
  sent: ["Đã gửi", "#00c875"],
  failed: ["Lỗi", "#df2f4a"],
  skipped: ["Bỏ qua", "#c4c4c4"],
  dry_run: ["Chạy thử", "#fdab3d"],
};

export const PROVIDER_LABEL: Record<string, string> = { facebook: "Facebook", google: "Google Ads", tiktok: "TikTok", zalo: "Zalo Ads", other: "Khác" };
export const PROVIDER_COLOR: Record<string, string> = { facebook: "#1877f2", google: "#ea4335", tiktok: "#111111", zalo: "#0068ff", other: "#676879" };

/** Biến chèn vào nội dung tin. */
export const VARS: [string, string][] = [
  ["{ten}", "Tên khách"],
  ["{ten_doanh_nghiep}", "Tên doanh nghiệp"],
  ["{so_dien_thoai}", "SĐT khách"],
  ["{nguoi_phu_trach}", "Người phụ trách"],
];

export type VarValues = { ten: string; ten_doanh_nghiep: string; so_dien_thoai: string; nguoi_phu_trach: string };

export function fillVars(text: string, v: Partial<VarValues>) {
  return text.replace(/\{(ten|ten_doanh_nghiep|so_dien_thoai|nguoi_phu_trach)\}/g, (_, k: keyof VarValues) => v[k] ?? "");
}

/** Chuẩn hoá tên chiến dịch để so khớp: bỏ dấu, chữ thường, bỏ ký tự đặc biệt. */
export function normCampaign(s: string) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type Step = { delayHours: number; channel: MsgChannel; subject?: string; body: string; templateId?: string; condition?: "no_reply" | "any" };
export type TriggerType = "record_created" | "status_changed" | "inactive_days" | "manual";

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  record_created: "Khi có khách mới",
  status_changed: "Khi đổi trạng thái",
  inactive_days: "Khi khách im lặng N ngày",
  manual: "Thêm khách bằng tay",
};

export type SeqTemplate = {
  key: string;
  name: string;
  desc: string;
  triggerType: TriggerType;
  objectKey: "contacts" | "deals";
  /** "open" = trạng thái đang mở đầu tiên của bảng bán hàng, "won" = trạng thái thắng; còn lại là giá trị cố định. */
  triggerValue: "" | "open" | "won" | string;
  steps: Step[];
};

export const SEQ_TEMPLATES: SeqTemplate[] = [
  {
    key: "welcome",
    name: "Chào lead mới",
    desc: "Gửi ngay khi có lead, nhắc lại sau 1 ngày và gửi ưu đãi sau 3 ngày nếu khách chưa trả lời.",
    triggerType: "record_created",
    objectKey: "contacts",
    triggerValue: "",
    steps: [
      { delayHours: 0, channel: "zalo", body: "Chào {ten}, cảm ơn anh/chị đã quan tâm {ten_doanh_nghiep}. Em là {nguoi_phu_trach}, anh/chị cần tư vấn gì cứ nhắn em nhé!" },
      { delayHours: 24, channel: "sms", body: "{ten_doanh_nghiep}: Chao {ten}, anh/chi da xem thong tin chua a? Can tu van them, goi/nhan {nguoi_phu_trach} nhe.", condition: "no_reply" },
      { delayHours: 48, channel: "zns", body: "Ưu đãi dành riêng cho {ten} trong tuần này tại {ten_doanh_nghiep}.", condition: "no_reply" },
    ],
  },
  {
    key: "not_closed",
    name: "Chưa chốt sau 3 ngày gửi ưu đãi",
    desc: "Đơn đang tư vấn quá 3 ngày chưa chốt: gửi ưu đãi để khách quyết định. Tự dừng khi đơn đổi trạng thái.",
    triggerType: "status_changed",
    objectKey: "deals",
    triggerValue: "open",
    steps: [{ delayHours: 72, channel: "zns", body: "{ten} ơi, {ten_doanh_nghiep} giữ ưu đãi riêng cho anh/chị đến hết tuần. Nhắn lại để {nguoi_phu_trach} giữ suất nhé!", condition: "no_reply" }],
  },
  {
    key: "review",
    name: "Sau mua 30 ngày xin đánh giá",
    desc: "30 ngày sau khi chốt đơn, hỏi thăm và xin khách đánh giá.",
    triggerType: "status_changed",
    objectKey: "deals",
    triggerValue: "won",
    steps: [{ delayHours: 720, channel: "zalo", body: "Chào {ten}, đã 1 tháng kể từ khi anh/chị dùng dịch vụ của {ten_doanh_nghiep}. Anh/chị thấy thế nào ạ? Một đánh giá ngắn sẽ giúp bên em rất nhiều!" }],
  },
  {
    key: "silent",
    name: "Khách im lặng 14 ngày",
    desc: "Khách không có hoạt động nào trong 14 ngày: hỏi thăm, sau 3 ngày gửi ưu đãi quay lại.",
    triggerType: "inactive_days",
    objectKey: "contacts",
    triggerValue: "14",
    steps: [
      { delayHours: 0, channel: "zalo", body: "Lâu rồi không gặp {ten}! {ten_doanh_nghiep} vừa có nhiều điều mới, anh/chị ghé xem nhé." },
      { delayHours: 72, channel: "sms", body: "{ten_doanh_nghiep}: Uu dai quay lai danh rieng cho {ten}. Lien he {nguoi_phu_trach} de nhan nhe.", condition: "no_reply" },
    ],
  },
];

export function delayText(h: number) {
  if (!h) return "Gửi ngay";
  if (h % 24 === 0) return `Chờ ${h / 24} ngày`;
  return `Chờ ${h} giờ`;
}
