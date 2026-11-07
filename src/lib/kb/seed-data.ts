// Dữ liệu mẫu kho kiến thức (thuần). Ngành spa đầy đủ ~15 câu; ngành khác dùng bộ chung.
export type SeedFaq = { q: string; a: string; tags: string[] };

export const SPA_FAQ: SeedFaq[] = [
  { q: "Giá liệu trình chăm sóc da mặt bao nhiêu?", a: "Dạ chăm sóc da mặt cơ bản bên em 450.000đ/buổi (60 phút), liệu trình 10 buổi 3.900.000đ ạ. Anh/chị cho em biết tình trạng da để em tư vấn gói phù hợp nhé.", tags: ["giá", "chăm sóc da"] },
  { q: "Giá trị mụn trọn gói là bao nhiêu?", a: "Dạ liệu trình trị mụn chuẩn y khoa 8 buổi bên em 4.200.000đ, đã gồm lấy nhân mụn và đắp mặt nạ phục hồi ạ.", tags: ["giá", "trị mụn"] },
  { q: "Giá triệt lông vĩnh viễn?", a: "Dạ triệt lông nách 300.000đ/lần; gói triệt lông toàn thân 12 lần 12.000.000đ ạ. Bảo hành 12 tháng sau khi xong liệu trình.", tags: ["giá", "triệt lông"] },
  { q: "Spa ở địa chỉ nào?", a: "Dạ spa bên em ở 25 Nguyễn Trãi, Quận 1, TP.HCM (gần chợ Bến Thành), có chỗ gửi xe máy miễn phí ạ.", tags: ["địa chỉ", "chỉ đường"] },
  { q: "Giờ mở cửa của spa?", a: "Dạ spa mở cửa từ 9:00 đến 20:00 tất cả các ngày trong tuần, kể cả Chủ nhật và ngày lễ ạ. Khách hẹn sau 19:00 vui lòng đặt trước giúp em.", tags: ["giờ mở cửa"] },
  { q: "Làm sao để đặt lịch hẹn?", a: "Dạ anh/chị nhắn giúp em ngày giờ mong muốn và dịch vụ cần làm, em xác nhận lịch ngay và nhắn nhắc trước 1 tiếng ạ. Có thể đặt qua Messenger, Zalo hoặc hotline.", tags: ["đặt lịch"] },
  { q: "Có thể đổi hoặc huỷ lịch hẹn không?", a: "Dạ được ạ. Anh/chị báo trước ít nhất 3 tiếng để em đổi lịch miễn phí; huỷ sát giờ quá 2 lần thì lần sau cần đặt cọc 100.000đ ạ.", tags: ["đặt lịch", "đổi lịch"] },
  { q: "Chính sách bảo hành và hoàn tiền thế nào?", a: "Dạ nếu sau 3 buổi đầu da không cải thiện theo cam kết, spa hoàn 100% phí các buổi còn lại của gói ạ. Liệu trình triệt lông bảo hành 12 tháng. Chi tiết em gửi anh/chị chính sách bảo hành nhé.", tags: ["bảo hành", "hoàn tiền"] },
  { q: "Hiện đang có chương trình khuyến mãi gì?", a: "Dạ tháng này khách mới được giảm 30% buổi đầu tiên cho mọi dịch vụ chăm sóc da, và tặng 1 buổi khi mua gói 10 buổi ạ.", tags: ["khuyến mãi", "ưu đãi"] },
  { q: "Có thanh toán chuyển khoản hoặc trả góp được không?", a: "Dạ spa nhận tiền mặt, chuyển khoản, quẹt thẻ và ví điện tử ạ. Gói từ 5.000.000đ có thể trả góp 0% qua thẻ tín dụng; thẻ thành viên 5 triệu được ưu đãi riêng.", tags: ["thanh toán"] },
  { q: "Da nhạy cảm có làm được không?", a: "Dạ được ạ. Chuyên viên sẽ soi da miễn phí trước khi làm và dùng dòng sản phẩm dịu nhẹ cho da nhạy cảm. Nếu da đang kích ứng nặng em sẽ hẹn anh/chị khi da ổn hơn ạ.", tags: ["tư vấn da"] },
  { q: "Mỗi buổi chăm sóc da mất bao lâu?", a: "Dạ một buổi chăm sóc da cơ bản khoảng 60 phút, trị mụn 75–90 phút ạ.", tags: ["thời gian"] },
  { q: "Có soi da, tư vấn miễn phí không?", a: "Dạ có ạ, soi da và tư vấn hoàn toàn miễn phí, không bắt buộc mua dịch vụ. Anh/chị ghé spa hoặc đặt lịch trước để không phải chờ nhé.", tags: ["tư vấn da", "miễn phí"] },
  { q: "Sản phẩm spa dùng có nguồn gốc thế nào?", a: "Dạ spa dùng mỹ phẩm chính hãng có giấy phép lưu hành của Bộ Y tế, mở niêm phong trước mặt khách ạ.", tags: ["sản phẩm"] },
  { q: "Có gói chăm sóc cho nam không?", a: "Dạ có ạ, spa có gói chăm sóc da và trị mụn riêng cho nam, phòng riêng, giá như dịch vụ thường ạ.", tags: ["dịch vụ"] },
];

export const SPA_POLICIES: { title: string; kind: "policy" | "doc"; content: string; tags: string[] }[] = [
  {
    title: "Chính sách bảo hành & hoàn tiền",
    kind: "policy",
    tags: ["bảo hành", "hoàn tiền"],
    content: `1. Cam kết hiệu quả: với gói chăm sóc da và trị mụn, nếu sau 3 buổi đầu da không cải thiện theo đánh giá của chuyên viên và khách, spa hoàn 100% phí các buổi còn lại của gói.

2. Triệt lông: bảo hành 12 tháng kể từ buổi cuối của liệu trình. Lông mọc lại trong thời gian bảo hành được làm lại miễn phí.

3. Hoàn tiền được thực hiện bằng chuyển khoản trong 7 ngày làm việc kể từ khi khách gửi yêu cầu.

4. Không áp dụng hoàn tiền với buổi lẻ đã sử dụng, quà tặng và buổi khuyến mãi.

5. Khách bị kích ứng sau khi làm: liên hệ spa trong 48 giờ để được bác sĩ da liễu đối tác kiểm tra miễn phí.`,
  },
  {
    title: "Quy định đặt lịch, đổi lịch và đặt cọc",
    kind: "policy",
    tags: ["đặt lịch", "đổi lịch", "đặt cọc"],
    content: `Đặt lịch: qua Messenger, Zalo, hotline hoặc trực tiếp tại quầy. Spa xác nhận lịch bằng tin nhắn và nhắc trước 1 tiếng.

Đổi lịch: miễn phí nếu báo trước ít nhất 3 tiếng. Mỗi gói được đổi lịch không giới hạn.

Huỷ sát giờ hoặc không đến: từ lần thứ 3 trở đi, khách cần đặt cọc 100.000đ cho lịch tiếp theo; tiền cọc được trừ vào hoá đơn.

Đến trễ: spa giữ lịch 15 phút; trễ hơn có thể phải rút ngắn thời gian hoặc dời lịch.`,
  },
];

/** Bộ chung cho ngành khác (thay tên doanh nghiệp). */
export function genericFaq(biz: string): SeedFaq[] {
  const b = biz || "bên em";
  return [
    { q: "Giá sản phẩm/dịch vụ bao nhiêu?", a: `Dạ giá bên ${b} tuỳ theo gói và nhu cầu cụ thể ạ. Anh/chị cho em biết nhu cầu để em gửi báo giá chính xác nhé.`, tags: ["giá"] },
    { q: "Địa chỉ cửa hàng ở đâu?", a: `Dạ ${b} đang cập nhật địa chỉ chi tiết, nhân viên sẽ gửi anh/chị bản đồ ngay ạ.`, tags: ["địa chỉ"] },
    { q: "Giờ làm việc thế nào?", a: "Dạ bên em làm việc từ 8:00 đến 21:00 hằng ngày ạ.", tags: ["giờ mở cửa"] },
    { q: "Có giao hàng / hỗ trợ tận nơi không?", a: "Dạ có ạ, phí và thời gian tuỳ khu vực, anh/chị cho em xin khu vực để em báo cụ thể nhé.", tags: ["giao hàng"] },
    { q: "Thanh toán bằng cách nào?", a: "Dạ bên em nhận tiền mặt, chuyển khoản và quẹt thẻ ạ.", tags: ["thanh toán"] },
    { q: "Chính sách bảo hành, đổi trả?", a: "Dạ bên em hỗ trợ đổi trả theo chính sách bảo hành, nhân viên sẽ gửi anh/chị chi tiết ạ.", tags: ["bảo hành"] },
  ];
}
