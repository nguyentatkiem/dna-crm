// Thư viện từ chối thường gặp khi gọi telesales. Dùng chung trình duyệt và máy chủ (không import node:*).

export type ObjectionCtx = { businessName: string; terminology: { contact: string; deal: string } };
export type Objection = { key: string; label: string; keywords: string[]; replies: string[] };

type Def = { key: string; label: string; keywords: string[]; replies: (biz: string, deal: string) => string[] };

const DEFS: Def[] = [
  {
    key: "dat",
    label: "Đắt quá",
    keywords: ["đắt", "giá cao", "mắc", "tốn kém", "nhiều tiền", "không đủ tiền", "chát", "giá hơi cao", "bên khác rẻ hơn", "rẻ hơn"],
    replies: (biz, deal) => [
      `Dạ em hiểu ạ, ai cũng muốn chi tiêu hợp lý. Anh/chị cho em hỏi, mình đang so sánh với mức nào để em tư vấn ${deal} vừa ngân sách nhất ạ?`,
      `Dạ nhiều khách lúc đầu cũng thấy vậy, nhưng tính ra mỗi ngày chỉ vài chục nghìn mà ${biz} cam kết hiệu quả rõ ràng. Em gửi anh/chị bảng so sánh chi tiết nhé ạ?`,
    ],
  },
  {
    key: "suy_nghi",
    label: "Để suy nghĩ thêm",
    keywords: ["suy nghĩ", "nghĩ thêm", "cân nhắc", "để xem", "tính sau", "từ từ", "để sau", "xem lại"],
    replies: () => [
      "Dạ vâng ạ. Anh/chị còn băn khoăn ở điểm nào nhất: giá, thời gian hay hiệu quả, để em gửi thêm thông tin đúng chỗ đó ạ?",
      "Dạ em hiểu. Để anh/chị dễ quyết, em giữ ưu đãi cho mình đến hết thứ sáu, chiều thứ năm em gọi lại hỏi ý mình được không ạ?",
    ],
  },
  {
    key: "hoi_nguoi_nha",
    label: "Hỏi ý chồng/vợ",
    keywords: ["hỏi chồng", "hỏi vợ", "hỏi ý", "bàn với", "hỏi lại", "ông xã", "bà xã", "nhà chị", "nhà anh", "người nhà", "bố mẹ", "sếp"],
    replies: (biz) => [
      "Dạ đúng rồi ạ, việc quan trọng thì nên bàn cùng gia đình. Em gửi anh/chị tài liệu ngắn gọn để mình đưa người nhà xem cùng nhé ạ?",
      `Dạ vâng, nếu tiện em hẹn một buổi gọi ngắn có cả hai anh chị, em tư vấn luôn để nhà mình hiểu rõ về ${biz} ạ. Tối nay hay tối mai tiện hơn ạ?`,
    ],
  },
  {
    key: "ban",
    label: "Đang bận",
    keywords: ["bận", "đang họp", "đang lái", "đang làm", "không tiện", "gọi sau", "lúc khác", "đang đi"],
    replies: () => [
      "Dạ em xin lỗi đã làm phiền ạ. Em xin 30 giây thôi, hay anh/chị hẹn em một khung giờ tiện hơn trong hôm nay ạ?",
      "Dạ vâng, em gọi lại lúc 5 giờ chiều nay hay 8 giờ tối thì tiện cho anh/chị hơn ạ?",
    ],
  },
  {
    key: "ben_khac",
    label: "Đã dùng bên khác",
    keywords: ["bên khác", "chỗ khác", "đang dùng", "đã dùng", "đã mua", "có rồi", "đăng ký rồi", "nơi khác"],
    replies: (biz) => [
      "Dạ tốt quá ạ, vậy anh/chị đã có kinh nghiệm rồi. Cho em hỏi mình thấy bên đó điểm nào ưng, điểm nào chưa ưng ạ?",
      `Dạ không sao ạ. Nhiều khách chuyển sang ${biz} vì được hỗ trợ sát hơn. Em gửi anh/chị so sánh nhanh để mình tham khảo, không ép đổi đâu ạ.`,
    ],
  },
  {
    key: "chua_nhu_cau",
    label: "Chưa có nhu cầu",
    keywords: ["chưa cần", "không cần", "chưa có nhu cầu", "không có nhu cầu", "không quan tâm", "chưa quan tâm", "không muốn"],
    replies: () => [
      "Dạ em hiểu ạ. Cho em hỏi một câu thôi: hiện tại anh/chị đang xử lý việc này thế nào ạ? Biết đâu em có mẹo giúp được mình.",
      "Dạ vâng ạ. Em xin phép gửi anh/chị thông tin ưu đãi qua Zalo, khi nào cần mình mở ra xem, em không làm phiền thêm ạ.",
    ],
  },
  {
    key: "gui_zalo",
    label: "Gửi thông tin qua Zalo",
    keywords: ["gửi zalo", "qua zalo", "nhắn zalo", "gửi thông tin", "gửi tài liệu", "gửi báo giá", "nhắn tin", "gửi qua"],
    replies: () => [
      "Dạ vâng em gửi ngay ạ. Để em gửi đúng thứ mình cần, anh/chị quan tâm nhất đến giá, lịch hay quyền lợi ạ?",
      "Dạ em gửi liền ạ. Em hẹn 10 phút sau gọi lại 2 phút giải thích những chỗ khó hiểu được không ạ?",
    ],
  },
  {
    key: "khong_tin",
    label: "Không tin tưởng",
    keywords: ["lừa", "lừa đảo", "không tin", "uy tín", "có thật không", "sợ mất tiền", "chắc không", "đảm bảo không", "spam"],
    replies: (biz) => [
      `Dạ anh/chị cẩn thận là đúng ạ. ${biz} có địa chỉ và hợp đồng rõ ràng, em gửi mình xem đánh giá của khách thật và giấy tờ nhé ạ.`,
      "Dạ em hiểu ạ. Mình có thể ghé trực tiếp hoặc thanh toán sau khi nhận, để anh/chị hoàn toàn yên tâm ạ.",
    ],
  },
  {
    key: "khong_co_thoi_gian",
    label: "Không có thời gian",
    keywords: ["không có thời gian", "không có time", "kín lịch", "không sắp xếp được", "xa quá"],
    replies: () => [
      "Dạ em hiểu anh/chị rất bận. Bên em có khung giờ linh hoạt cả tối và cuối tuần, mình thường rảnh khung nào nhất ạ?",
      "Dạ chính vì bận nên mình càng cần cách tiết kiệm thời gian ạ. Em chỉ cần 15 phút để anh/chị thấy rõ lợi ích.",
    ],
  },
];

/** Bỏ dấu tiếng Việt để khớp cả khi gõ không dấu. */
export function unaccent(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

export function objectionLibrary(cfg: ObjectionCtx): Objection[] {
  const deal = cfg.terminology.deal.toLowerCase();
  return DEFS.map((d) => ({ key: d.key, label: d.label, keywords: d.keywords, replies: d.replies(cfg.businessName, deal) }));
}

/** Tìm từ chối trong câu khách nói. Câu gõ không dấu thì so không dấu (tránh "bận" khớp nhầm "bạn"). Trả theo số từ khoá khớp giảm dần. */
export function detectObjections(text: string, lib: Objection[]): Objection[] {
  const t = ` ${text.toLowerCase()} `;
  const plain = unaccent(t) === t;
  const has = (k: string) => (plain ? t.includes(unaccent(k)) : t.includes(k));
  return lib
    .map((o) => ({ o, n: o.keywords.filter(has).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.o);
}
