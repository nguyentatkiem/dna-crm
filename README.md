# DNA CRM

**CRM đa ngành tự may đo theo DNA doanh nghiệp, kèm đội AI Agent.** Mã nguồn mở để bạn tải về và tự chạy cho doanh nghiệp của mình.

Bạn trả lời 6 nhóm câu hỏi về doanh nghiệp (ngành, sản phẩm, khách hàng, quy trình bán, đội ngũ, mục tiêu). **DNA Architect** sẽ dựng một CRM riêng cho bạn gồm:
- tên gọi đúng ngành (Khách / Bệnh nhân / Học viên / Chủ nhà...);
- các giai đoạn bán hàng, cột dữ liệu và dashboard KPI;
- công thức tự động hoá và các AI Agent phù hợp.

Giao diện theo phong cách Work OS (board chia nhóm màu, ô trạng thái tô màu, Kanban, lịch), quen thuộc với người đã dùng các công cụ quản lý công việc hiện đại.

Đi kèm các module bán hàng thực chiến:
- **Hộp thư hợp nhất**: tin nhắn **Zalo OA** và **Facebook Messenger** về một màn hình, AI soạn sẵn câu trả lời, tự gắn vào đúng khách.
- **Telesales**: **gọi ngay trên trình duyệt** (SIP/WebRTC), **gọi liên tục** theo hàng chờ, **trợ lý gợi ý khi đang gọi**, ghi âm, **AI chấm điểm từng cuộc gọi**, tách giọng nhân viên/khách và đo cảm xúc, **vòng phản hồi** tự cập nhật phiếu chấm và kịch bản.
- **Hub nguồn khách**: lead từ **Facebook, Google, TikTok Ads**, **Zalo OA**, sàn **Shopee, Lazada, TikTok Shop**, web bán hàng **Haravan, Sapo, Shopify, WooCommerce**, website và **tổng đài** đổ về một chỗ, chống trùng, gắn kênh và chiến dịch.
- **Marketing & ROAS**: kéo chi phí từ Facebook/Google Ads, ghép với lead và doanh thu: **CPL, CAC, ROAS từng chiến dịch**; **kịch bản chăm sóc tự động** qua Zalo, ZNS, SMS, email.

Và bộ công cụ Work OS: **Gantt**, kanban kéo thả, bảng hàng nghìn dòng, **cột công thức**, **tài liệu gắn khách**, **dashboard tự chọn widget**, **tự động hoá "Khi… thì…"** nhiều điều kiện/hành động, **phân quyền**, **nhật ký thao tác**, **dự báo khả năng chốt**, **Docker một lệnh**, **sao lưu tự động**.

![Trang chủ trung tâm chỉ huy](docs/screenshots/29-trang-chu-trung-tam.png)

---

## Mục lục

- [Tính năng](#tính-năng)
- [Hình ảnh giao diện](#hình-ảnh-giao-diện)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Bật AI (tuỳ chọn)](#bật-ai-tuỳ-chọn)
- [Kết nối nguồn khách, tổng đài, chép lời](#kết-nối-nguồn-khách-tổng-đài-chép-lời)
- [Đưa lên mạng cho cả đội dùng](#đưa-lên-mạng-cho-cả-đội-dùng)
- [Vận hành: Docker, Postgres, sao lưu, kiểm thử](docs/VAN-HANH.md)
- [Câu hỏi thường gặp](#câu-hỏi-thường-gặp)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [Đề xuất nâng cấp & repo tham khảo](docs/DE-XUAT-NANG-CAP.md)

---

## Tính năng

### DNA doanh nghiệp: CRM tự thay đổi theo ngành
- **Wizard 6 bước**, có khung "DNA đang hình thành" cập nhật theo từng câu trả lời.
- **10 ngành có sẵn**: Spa & Thẩm mỹ · Bất động sản · Giáo dục & Đào tạo · Bán lẻ & E-commerce · Dịch vụ B2B · Nha khoa & Phòng khám · Nhà hàng & F&B · Ô tô & Xe máy · Bảo hiểm & Tài chính · Nội thất & Xây dựng.
- **Màn xem trước**: trước khi áp dụng, bạn bật/tắt từng module và từng công thức tự động hoá.
- **Có phiên bản**: sửa DNA và sinh lại bất cứ lúc nào, khôi phục được phiên bản cũ, dữ liệu cũ được giữ nguyên.
- **Tự sửa bảng ngay trên giao diện**: đổi tên bảng, thêm/bớt/đổi màu trạng thái, thêm/bớt cột (9 kiểu: chữ, số, tiền, ngày, nhãn chọn, điện thoại, email, đoạn văn, đánh giá sao).

### Board kiểu Work OS
- Mỗi giai đoạn là một **nhóm có màu riêng**. Ô trạng thái **tô kín màu**, bấm vào để đổi.
- **Sửa trực tiếp mọi ô**, gán người phụ trách bằng avatar, có hàng "+ Thêm" ở cuối mỗi nhóm.
- **Hàng tổng** cho tiền và số, cùng **thanh tỉ lệ** trạng thái của cả bảng.
- **5 chế độ xem**, lưu trên URL để gửi link cho đồng nghiệp:
  - **Bảng chính**: nhóm theo trạng thái, người phụ trách hoặc **bất kỳ cột lựa chọn nào**, ẩn/hiện cột, chọn nhiều dòng để đổi trạng thái/giao người/xoá hàng loạt, nhóm trên 200 dòng tự cuộn ảo nên hàng nghìn dòng vẫn mượt.
  - **Kanban** kéo thả (cả trên điện thoại), tổng tiền mỗi cột, **% khả năng chốt** trên thẻ giao dịch.
  - **Lịch** tháng/tuần, kéo mục sang ngày khác.
  - **Gantt / Timeline**: thang Ngày/Tuần/Tháng, vạch hôm nay, kéo thanh để dời ngày, kéo mép để đổi hạn.
  - **Biểu đồ**: chia theo trạng thái, người phụ trách hoặc một cột lựa chọn; đo bằng số mục hoặc tổng một cột tiền/số/công thức; dạng cột hoặc tròn.
- **Cột công thức** kiểu Excel: `{so_luong} * {don_gia}`, `IF({diem} > 70; "Nóng"; "Theo dõi")`, `DAYS(TODAY(); {tao_luc})`... Gần 400 hàm (formula.js), kiểm tra cú pháp và xem trước khi lưu, tự cộng ở hàng tổng.
- **14 loại cột**: chữ, đoạn văn, số, tiền, ngày, SĐT, email, nhãn màu, đánh giá sao, công thức, **ô tích**, **liên kết**, **thẻ nhiều lựa chọn**, **tiến độ %** (hàng tổng đếm số ô đã tích và tiến độ trung bình).
- **Menu trên tiêu đề cột** (nút “…”): sắp xếp tăng/giảm theo cột đó, lọc theo cột, nhóm theo cột, ẩn cột.
- **Menu chuột phải trên dòng** (hoặc nút “…”): mở, mở thẻ mới, sao chép link, nhân bản, chuyển giai đoạn, xoá.
- **Menu nhóm**: thu gọn nhóm/tất cả nhóm, chọn cả nhóm, **xuất riêng nhóm ra Excel**.
- **Hiển thị**: độ cao dòng Gọn/Vừa/Thoáng, **tô màu dòng theo điều kiện** (ví dụ chưa cọc thì tô vàng).
- **Nhật ký bảng**: mọi thao tác tạo, sửa, xoá, nhập, xuất trên cả bảng, lọc theo người.
- **Thùng rác**: xoá xong có nút **Hoàn tác**; mục nằm trong thùng rác 30 ngày, khôi phục lại đủ cập nhật, việc, tài liệu; chủ/quản lý xoá vĩnh viễn hoặc dọn sạch.
- **Thanh tỉ lệ màu** dưới mỗi cột lựa chọn, giống cột trạng thái.
- **Lọc nâng cao** nhiều điều kiện (bằng, khác, lớn hơn, chứa, rỗng...), sắp xếp, tìm kiếm.
- **Panel chi tiết**: tab Cập nhật (gõ **@** để nhắc đồng đội, người được nhắc nhận thông báo), Thông tin, Việc cần làm, **Tài liệu** và **Lịch sử** (ai đổi ô nào, từ giá trị gì sang giá trị gì, lọc theo người sửa).
- **Tài liệu** (trình soạn thảo kiểu Notion): gắn vào từng khách hoặc dùng chung, tự lưu, 4 mẫu sẵn (Kịch bản tư vấn, Biên bản họp, Báo giá, Quy trình chăm sóc).

### Dữ liệu vào và ra
- **Nhập từ Excel (.xlsx) / CSV / Google Sheets**: xem trước 10 dòng, tự ghép cột, **gộp khách trùng số điện thoại** (0912…, +84912…, 84912… là một người), có file mẫu .xlsx.
- **Xuất Excel .xlsx thật**: tiêu đề in đậm, định dạng tiền ₫ và ngày, cố định hàng đầu, cột công thức xuất giá trị đã tính. Vẫn xuất được CSV.
- **Form thu lead công khai**: một link để gắn vào fanpage hoặc bio, hoặc mã nhúng cho website. Khách điền xong sẽ tự vào bảng, được chấm điểm và chạy tự động hoá. Form có bẫy chống bot.

### Telesales: gọi, ghi âm, chấm điểm, vòng phản hồi
- **Hàng gọi ưu tiên** tự sắp: hẹn gọi lại đến hạn → lead chưa gọi (điểm cao trước) → gọi lỡ cần thử lại (tối đa 3 lần). Khách đã từ chối, sai số, đã chốt tự rời hàng.
- **Bàn gọi**: bấm giờ, kịch bản gọi ngay bên cạnh, chọn kết quả (8 loại), ghi chú, hẹn gọi lại (tự tạo việc), tải file ghi âm hoặc dán bản chép lời.
- **Gọi ngay trên trình duyệt (softphone)**: khai báo máy nhánh SIP qua WebSocket của tổng đài (Stringee, OMICall, VoIP24h, Asterisk, FreeSWITCH). Có nút gọi, gác máy, tắt mic, giữ máy, bàn phím số, **nhận cuộc gọi đến kèm tên khách**. Trình duyệt **tự ghi âm cả hai phía**, gác máy là thời lượng và file ghi âm được điền sẵn. Chưa có tổng đài thì nút Gọi mở ứng dụng gọi của điện thoại như cũ.
- **Gọi liên tục (power dialer)**: tự mở khách kế tiếp, đếm ngược 5 giây, tự quay số; có tạm dừng, bỏ qua, thống kê phiên (đã gọi, kết nối, hẹn/chốt, thời gian TB).
- **Trợ lý khi đang gọi**: 9 kiểu từ chối hay gặp ("đắt quá", "để suy nghĩ", "hỏi ý chồng/vợ"...) với cách xử lý mẫu; gõ câu khách nói là có gợi ý ngay; khi bật chép lời, cứ 15 giây CRM nghe đoạn hội thoại và **tự gợi ý câu nói tiếp**.
- **Tách giọng + cảm xúc**: hội thoại hiển thị theo người nói (bấm câu để tua ghi âm), **biểu đồ cảm xúc khách** theo thời gian, **tỉ lệ nói NV/KH** (tốt khi 40–60%), số câu hỏi nhân viên đặt ra.
- **Call Analyst chấm điểm** theo phiếu 6 tiêu chí có trọng số (Mở đầu, Khai thác nhu cầu, Tư vấn, Xử lý từ chối, Chốt, Thái độ). Mỗi tiêu chí có điểm 0–10, **câu trích nguyên văn làm bằng chứng** và mẹo cải thiện. Kèm tóm tắt, điểm mạnh, băn khoăn của khách và bước tiếp theo.
- Cuộc gọi dưới 60 điểm: **tự giao việc luyện kỹ năng** cho đúng nhân viên, đúng tiêu chí yếu nhất.
- **Quản lý chấm lại**: kéo điểm, ghi lý do. Các lần chấm lệch nhiều được đưa vào prompt làm **chuẩn chấm** để AI chấm sát ý chủ hơn.
- **Vòng phản hồi**: so sánh điểm từng tiêu chí giữa cuộc ra lịch hẹn/chốt và cuộc không thắng, đo độ lệch AI và quản lý, rồi **đề xuất trọng số mới + đoạn bổ sung kịch bản**. Chủ bấm Áp dụng thì phiếu chấm lên phiên bản mới; cuộc gọi cũ giữ phiên bản đã chấm để so sánh.
- **Bảng xếp hạng**: số cuộc, tỷ lệ nghe máy, thời gian nói, hẹn/chốt, tỷ lệ chuyển đổi, điểm trung bình, kỹ năng theo tiêu chí.
- **Tổng đài**: Stringee, OMICall, VoIP24h, FreeSWITCH/Asterisk... đẩy webhook khi kết thúc cuộc gọi. CRM tự khớp khách theo SĐT, **tải ghi âm về máy** (link nhà mạng hay hết hạn), chép lời và chấm điểm.
- **Chép lời tiếng Việt**: máy chủ chuẩn OpenAI chạy trên máy bạn (faster-whisper qua speaches, whisper.cpp) hoặc FPT.AI. Không cấu hình thì dán bản chép lời bằng tay.

### Hub nguồn khách: Ads, Zalo OA, thương mại điện tử, website
- Mỗi workspace có **URL webhook riêng** cho từng nguồn, kèm hướng dẫn kết nối ngay trong trang và nút **Gửi thử một lead**.
- **Quảng cáo**: Facebook Lead Ads (xác minh webhook, tải tên/SĐT bằng Page token, kiểm tra chữ ký), Google Ads lead form (kiểm tra `google_key`), TikTok Lead Ads.
- **Zalo OA**: khách quan tâm OA, nhắn tin, gửi thông tin đều thành khách (gộp theo Zalo user id và SĐT). Tin nhắn vào dòng thời gian. **Nhắn lại khách qua OA** từ Sales Coach, tự làm mới access token.
- **Thương mại điện tử**: Haravan, Sapo, Shopify, WooCommerce (đơn có khách → tạo khách + mục bán hàng); Shopee, Lazada, TikTok Shop (sàn che SĐT người mua → chỉ tạo đơn để tính doanh thu theo kênh). Đơn cập nhật trạng thái thì mục bán hàng đổi theo (thanh toán → thắng, huỷ → thua).
- **Website, landing page, n8n/Make/Zapier, Ladipage, Pancake**: webhook chung, tự nhận diện tên trường tiếng Việt (`ho_ten`, `so_dien_thoai`...) và `utm_*`.
- **Organic hay Ads**: form thu lead của CRM tự ghi `utm_source`, `utm_campaign`, `gclid/fbclid/ttclid` và trang giới thiệu để phân biệt quảng cáo với tự nhiên.
- **Chống trùng và gộp**: chuẩn hoá SĐT Việt Nam (+84, 84, dấu chấm...), lead quay lại được gộp vào khách cũ kèm ghi chú. Mỗi sự kiện có mã riêng nên nền tảng gửi lại cũng không nhân đôi.
- **Báo cáo theo nguồn**: lead 30 ngày theo kênh, theo nguồn/chiến dịch: số lead, khách nóng, tỷ lệ gọi được, tỷ lệ hẹn/chốt, doanh thu đơn hàng. Có nhật ký nhận lead để đối soát lỗi.

### Hộp thư hợp nhất: Zalo OA, Messenger, bình luận fanpage
- **Nhiều fanpage** (Hộp thư → Trang): mỗi trang một token (không bao giờ gửi xuống trình duyệt), xem gộp tất cả hoặc từng trang. Bật tắt từng trang: tự ẩn bình luận có SĐT, ẩn mọi bình luận, tự thích, tự đánh dấu đã đọc, chữ ký cuối tin nhắn.
- **Bình luận về chung hộp thư**: mỗi người bình luận trên một bài là một hội thoại. Trả lời công khai, **nhắn riêng từ bình luận**, thích, ẩn/hiện, xoá, đánh dấu tạo đơn.
- **Bài viết** (Hộp thư → Bài viết): lọc theo loại (ảnh, video, livestream), sắp xếp theo số bình luận hoặc SĐT. Cài riêng từng bài: tự ẩn, tự trả lời bình luận đầu, tự nhắn riêng. **Gộp các bài livestream** để xem bình luận trực tiếp.
- **Bộ lọc kiểu Pancake**: chưa đọc, chưa trả lời (đợi lâu nhất lên đầu), đã đọc chưa trả lời, có/không SĐT, thẻ (gồm/loại trừ), người phụ trách, nguồn (bài viết, quảng cáo, website, link m.me), khoảng thời gian, bình luận chưa nhắn riêng, livestream. Tìm theo tên, SĐT, nội dung. Phím tắt ↑↓, Enter, e, /. Chọn nhiều để đánh dấu đã đọc, gắn thẻ, phân công.
- **Trả lời nhanh**: gõ `/` + ký tự tắt; chủ đề có màu; biến {ten}, {nhan_vien}, {trang}, {sdt}; nhập/xuất CSV, JSON. **Thẻ hội thoại** có màu.
- **CRM ngay trong chat**: tự nhận SĐT, địa chỉ trong tin nhắn và bình luận, tự nối khách cũ hoặc tạo khách mới. Cột phải: thẻ khách (tổng chi, đơn gần nhất, NPS), **tạo đơn hàng** (sản phẩm, mã giảm giá, địa chỉ, tin xác nhận), tạo giao dịch, lịch hẹn, phiếu hỗ trợ, khảo sát, voucher.
- **Chia hội thoại** (Hộp thư → Cài đặt): tắt / nhân viên tự nhận / tự động xoay vòng theo nhóm có tỉ lệ, chỉ người đang trực tuyến hoặc ít việc nhất; người nhận tin nhắn khác người nhận bình luận; giờ làm việc; khách cũ quay lại giao người cũ; nhân viên chỉ thấy hội thoại của mình.
- **Thống kê** (Hộp thư → Thống kê): theo trang, nhân viên (tin gửi, phiên trả lời, thời gian phản hồi trong giờ làm việc, SĐT mang về), thẻ, bản đồ nhiệt giờ; xuất Excel.
- **AI**: soạn nháp trả lời; phát hiện khách bực để báo người phụ trách và quản lý; chấm chất lượng chăm sóc từng hội thoại.
- **Link m.me theo nguồn**: đếm lượt bấm, hội thoại và khách theo từng link. Ghi nhận khách đến từ quảng cáo.
- Khách trả lời thì **kịch bản chăm sóc tự dừng**. Messenger quá 24 giờ: báo rõ và cho gửi lại với tag HUMAN_AGENT.
- Webhook Facebook cần đăng ký các trường `messages`, `messaging_postbacks`, `messaging_referrals`, `feed`. Chạy thử không cần Facebook: đặt `MESSAGING_DRY_RUN=1` hoặc dùng token bắt đầu bằng `demo_`.

So sánh với Pancake trong [docs/SO-SANH-PANCAKE.md](docs/SO-SANH-PANCAKE.md).

### Marketing & ROAS
- **Kéo chi phí quảng cáo** từ Facebook Marketing API và Google Ads API (6 tiếng một lần hoặc bấm "Đồng bộ ngay"); TikTok và nền tảng khác nhập CSV hoặc nhập tay.
- KPI: **Tổng chi, Lead, CPL, Khách chốt, Doanh thu, ROAS, CAC**; biểu đồ chi phí và doanh thu theo ngày; bảng theo chiến dịch tô màu ROAS (đỏ < 1, cam 1–3, xanh > 3), so với **lead tự nhiên**.
- **Marketing Analyst** nhận xét chiến dịch nên tăng hoặc giảm ngân sách.
- **Kịch bản chăm sóc tự động**: dạng timeline "chờ X giờ → gửi qua kênh → nội dung có biến `{ten}`, `{ten_doanh_nghiep}`...". Kích hoạt khi có khách mới, đổi trạng thái, khách im lặng N ngày hoặc thêm tay. 4 mẫu sẵn: chào lead mới, chưa chốt sau 3 ngày, xin đánh giá sau mua, khách im lặng 14 ngày. **AI viết nội dung**.
- Kênh gửi: **Zalo OA**, **Zalo ZNS**, **SMS** (eSMS, SpeedSMS hoặc API tuỳ biến), **email SMTP**. Nhật ký gửi đầy đủ; đặt `MESSAGING_DRY_RUN=1` để chạy thử không gửi thật.

### Dashboard tự chọn widget
- 12 loại widget: số KPI (so với kỳ trước), cột, đường, vùng, tròn, phễu, bảng xếp hạng, bảng, mục tiêu, việc quá hạn, hoạt động.
- Mỗi widget có bộ lọc riêng (bảng, khoảng thời gian, người phụ trách, kênh). Chế độ **Chỉnh sửa**: kéo thả sắp xếp, kéo góc đổi kích thước.
- **AI tạo dashboard** từ một câu mô tả; 3 mẫu sẵn: Tổng quan kinh doanh, Telesales, Marketing & ROAS.

### Tự động hoá "Khi… thì…"
- Trình tạo dạng câu kiểu monday: **Khi** [sự kiện] **và** [điều kiện] **thì** [hành động] **và** [hành động]. Bấm từng phần để chọn, kéo thả sắp thứ tự hành động.
- 7 sự kiện: có mục mới, đổi trạng thái (từ → sang), đổi trường, điểm AI vượt ngưỡng, có cuộc gọi với kết quả…, khách nhắn tin, đến ngày (trước/sau N ngày của một trường ngày).
- 10 hành động: tạo việc (giao cho ai), thông báo, giao người phụ trách (xoay vòng / ít việc nhất), đổi trạng thái, đổi trường, **gửi tin Zalo/ZNS/SMS/email**, **đưa vào kịch bản chăm sóc**, **gọi webhook** (n8n, Make...), ghi chú, tạo giao dịch từ khách.
- Chống vòng lặp, lịch sử từng luật, tab **Lịch sử chạy** chung (số lần chạy 7 ngày, số lần lỗi, tỉ lệ chạy trơn tru, lọc theo luật và theo kết quả), thư viện mẫu theo ngành. **Mô tả bằng lời → AI tạo luật**.

### Đội AI Agent

| Agent | Việc làm | Trạng thái |
|---|---|---|
| DNA Architect | Thiết kế toàn bộ CRM từ DNA | Đang chạy |
| Trợ lý CRM | Chat tiếng Việt: thêm khách, tạo việc, tìm khách nóng, hỏi KPI | Đang chạy |
| Lead Qualifier | Chấm điểm Nóng / Ấm / Lạnh cho mỗi khách mới | Đang chạy |
| Sales Coach | Gợi ý bước tiếp theo và soạn sẵn tin nhắn Zalo cho từng mục | Đang chạy |
| Daily Briefing | Tóm tắt mỗi ngày trên trang chủ | Đang chạy |
| Automation Builder | Biến câu mô tả thành công thức tự động hoá | Đang chạy |
| Call Analyst | Chép lời ghi âm, chấm điểm cuộc gọi theo phiếu, trích bằng chứng, giao việc luyện kỹ năng | Đang chạy |
| Vòng phản hồi | Học từ cuộc gọi thắng/thua và điểm quản lý chấm lại, đề xuất phiếu chấm và kịch bản mới | Đang chạy |
| Hub nguồn khách | Nhận lead từ Ads, Zalo OA, sàn TMĐT, website; chống trùng, gắn kênh, chiến dịch | Đang chạy |
| Inbox Assistant | Soạn câu trả lời Zalo/Messenger theo ngữ cảnh khách | Đang chạy |
| Live Call Assist | Nghe cuộc gọi, nhận ra lời từ chối, gợi ý câu nói tiếp | Đang chạy |
| Marketing Analyst | Phân tích CPL/ROAS, đề xuất tăng giảm ngân sách | Đang chạy |
| Nurture Writer | Viết nội dung kịch bản chăm sóc | Đang chạy |
| Forecast | Dự báo khả năng chốt từng giao dịch và doanh thu theo tháng | Đang chạy |
| Dashboard Builder | Dựng dashboard từ một câu mô tả | Đang chạy |
| Care & Retention, Data Analyst, Data Hygiene, Sales Chat 24/7, Content & Campaign, Document Agent, Manager Agent | | Sắp ra mắt |

Mỗi agent có công tắc bật/tắt và **mức tự chủ** (Chỉ gợi ý / Làm rồi báo / Tự làm), kèm nhật ký hoạt động.

> **Không có API key vẫn dùng được.** Khi chưa cấu hình Claude, các agent chạy bằng template ngành và luật có sẵn. Thêm key để agent hiểu mọi câu hỏi và viết nội dung tự nhiên hơn.

### Bán hàng: báo giá → đơn hàng → thu tiền
- **Sản phẩm/dịch vụ**: mã, đơn giá, VAT, thời hạn bảo hành, nhóm hàng. **Thông tin doanh nghiệp** (Cài đặt) in lên mọi chứng từ.
- **Báo giá**: chọn khách/giao dịch, dòng hàng có chiết khấu và VAT, số BG tự tăng. Nhân viên **gửi duyệt**, quản lý **duyệt**. **In A4 / lưu PDF**, nhân bản.
- **Link báo giá cho khách** (`/q/…`): khách xem và bấm **Chấp nhận** hoặc **Từ chối**. Chấp nhận thì giao dịch tự chuyển sang thắng và CRM tạo đơn hàng ngay.
- **Đơn hàng**: Mới → Xác nhận → Đang giao → Hoàn tất, **thu tiền nhiều đợt**, lọc còn nợ/quá hạn, trang **công nợ phải thu** theo khách, tự nhắc khi quá hạn. Đơn hoàn tất và thu đủ thì tự **tích điểm** và **tạo phiếu bảo hành**.
- **Hợp đồng**: số HD tự tăng, gắn khách/giao dịch/đơn, link file, **tự nhắc trước khi hết hạn**.
- Trong hồ sơ khách/giao dịch có khối **Bán hàng** hiện báo giá, đơn, hợp đồng, số còn nợ.

### Chăm sóc sau bán
- **Phiếu hỗ trợ**: hạn xử lý theo **SLA** từng mức ưu tiên, quá hạn thì tự báo người xử lý và quản lý. Tạo nhanh từ **Hộp thư** hoặc **cuộc gọi**; trả lời gửi thẳng cho khách qua Zalo/email/SMS; ghi chú nội bộ.
- **Khảo sát hài lòng (CSAT)**: phiếu đã xử lý có link để khách chấm 1–5 sao; dưới 4 sao thì báo người xử lý.
- **Tích điểm và hạng thành viên**: mặc định 10.000đ = 1 điểm, hạng Thành viên / Bạc / Vàng / Kim cương có % ưu đãi, đổi quà, cộng/trừ tay. Hạng xét theo tổng điểm đã tích nên đổi quà không làm tụt hạng.
- **Bảo hành**: tự tạo từ đơn hàng, nhắc trước 30 ngày khi sắp hết hạn, **khách tự tra cứu** bằng số điện thoại tại `/bh/<mã>`.
- **Nhóm khách động**: lưu bộ lọc thành nhóm (nút **Lưu thành nhóm khách** trên bảng), tự cập nhật thành viên, dùng làm danh sách nhận cho Gửi hàng loạt.

### Marketing hàng loạt
- **Gửi hàng loạt** email/SMS/Zalo ZNS/Zalo OA cho một nhóm khách:
  - tự bỏ người thiếu địa chỉ, đã từ chối nhận tin, trùng số;
  - xem trước theo khách thật, **gửi thử**, hẹn giờ, huỷ giữa chừng;
  - gửi tối đa 30 tin mỗi phút mỗi đợt, khởi động lại không gửi trùng;
  - email có link **ngừng nhận tin**, đếm **lượt mở và lượt nhấp**.
- **Landing page**: 7 loại khối (ảnh bìa, lợi ích, hình ảnh, cảm nhận, form, hỏi đáp, kêu gọi), chọn màu, xem trước trên điện thoại, **AI tạo trang** theo DNA. Khách điền form là vào thẳng CRM kèm nguồn và `utm_campaign`; đếm lượt xem, đăng ký, tỉ lệ chuyển đổi.
- **Phễu chuyển đổi**: khách mới → đã liên hệ → có giao dịch → chốt → mua lại, theo kênh hoặc nguồn, kèm bảng cohort theo tháng.

### Làm việc theo đội
- **Chỉ tiêu KPI theo tháng**:
  - chủ/quản lý đặt chỉ tiêu cho từng người và cả công ty: doanh thu, giao dịch thắng, khách mới, cuộc gọi, tỉ lệ chốt, phiếu đã xử lý;
  - thanh tiến độ có vạch nhịp, nhãn **Vượt / Đúng nhịp / Đang chậm**, bảng xếp hạng;
  - thứ Hai hằng tuần tự nhắc người đang chậm.
- **Bảng tin nội bộ**: bài viết, thông báo ghim, kênh, thả cảm xúc, bình luận, @nhắc tên. Chốt giao dịch hay hoàn tất đơn thì **tự đăng bài khoe**.
- **Bảo mật dữ liệu**: che SĐT/email với nhân viên (0912•••678), giới hạn số dòng xuất Excel mỗi người mỗi ngày, báo chủ khi có người xuất nhiều.
- **Cài app trên điện thoại** (PWA): mở bằng Chrome/Safari rồi "Cài app" / "Thêm vào MH chính"; chạy toàn màn hình, xem lại trang đã mở khi mất mạng. **Thông báo đẩy** khi điền khoá VAPID.
- **Vai trò & quyền** (Cài đặt → Vai trò & quyền): 3 vai trò có sẵn **Chủ / Quản lý / Nhân viên** và **vai trò tự tạo** (Kế toán, Trưởng nhóm sale, CSKH…). Mỗi vai trò tích từng quyền trong 56 quyền chia 7 mô-đun (Khách & bảng, Bán hàng, Chăm sóc, Marketing, Telesales, Hiệu suất, Hệ thống) và chọn **phạm vi dữ liệu**: chỉ khách của mình / của cả đội (theo Phòng ban) / toàn bộ. Có bảng so sánh các vai trò; mọi thay đổi ghi vào Nhật ký thao tác. Chủ luôn toàn quyền; chỉ chủ sửa vai trò, thành viên, sao lưu.
- Phạm vi dữ liệu áp dụng cho bảng, tìm kiếm, hộp thư, telesales, báo giá, đơn, phiếu hỗ trợ, dashboard, trợ lý AI, hiệu suất và xuất Excel. Nút không có quyền thì ẩn, máy chủ cũng chặn.
- Mời bằng **link dùng một lần** (chọn vai trò, kể cả vai trò tự tạo), hết hạn sau 7 ngày.
- **Nhật ký thao tác**: ai tạo/sửa/xoá gì, lúc nào, xem giá trị cũ → mới; lọc, xuất CSV.
- **Việc của tôi**: giao việc cho từng người, quản lý xem việc của mọi người.
- **Thông báo**: được giao khách/việc, khách nhắn tin, việc sắp đến hạn và hẹn gọi lại (nhắc trước 30 phút), tự động hoá.
- **Dự báo khả năng chốt**: học từ chính các giao dịch đã thắng/thua của bạn (hồi quy logistic khi có từ 20 giao dịch đã đóng, ít hơn thì dùng mô hình theo giai đoạn). Trang chủ có pipeline, doanh thu kỳ vọng theo tháng và top giao dịch.
- **Phòng ban / đội**: KPI theo đội, xem theo tháng, quý, năm. Doanh thu tính cho người phụ trách giao dịch, nếu không có thì người phụ trách khách, rồi người tạo đơn.
- **Đo lường hiệu suất nhân viên** (Hiệu suất nhân viên → Tổng quan): 27 chỉ số trong 4 nhóm, so với kỳ trước và trung vị của đội:
  - Kết quả: doanh thu, giao dịch thắng, giá trị trung bình, tỉ lệ chốt, khách mới, đơn hàng, công nợ quá hạn.
  - Hoạt động: cuộc gọi, phút gọi, tỉ lệ nghe máy, điểm chất lượng cuộc gọi, tin nhắn đã trả lời, ghi chú, báo giá, việc đúng hạn.
  - Tốc độ: thời gian liên hệ khách mới (speed-to-lead), phản hồi đầu tiên ở Hộp thư, thời gian xử lý phiếu, phiếu đúng SLA, chu kỳ bán hàng, giao dịch tồn đọng.
  - Chất lượng: CSAT, NPS, tỉ lệ khách quay lại, khiếu nại.
  - Bảng xếp hạng có **Điểm hiệu suất** (chủ chỉnh trọng số), xu hướng 8 tuần, bản đồ nhiệt giờ làm việc, phễu từng người, cảnh báo người đang tụt, xuất Excel kèm định nghĩa chỉ số.
  - **Hồ sơ hiệu suất cá nhân**: thẻ chỉ số kèm biểu đồ nhỏ, KPI tháng, điểm mạnh và điểm cần cải thiện tự động, giao dịch tồn đọng, cuộc gọi gần nhất, lịch sử đánh giá, **gợi ý huấn luyện bằng AI** (chỉ gửi số tổng hợp, không gửi thông tin khách).
  - Sáng thứ Hai có **bản tin tuần** cho từng người, trưởng nhóm và chủ. Nhân viên chỉ thấy số của mình, trưởng nhóm thấy đội mình.
- **Đánh giá nhân viên** theo tiêu chí có trọng số (tự lấy từ KPI, từ chỉ số hiệu suất thật + quản lý chấm tay), xếp loại, chốt kỳ, xuất Excel. **Hoa hồng** theo bậc doanh thu, thưởng trưởng nhóm. Nhân viên chỉ thấy phần của mình.
- Từ ngày 10 hằng tháng, **báo nhân viên và trưởng nhóm** khi doanh thu chậm nhịp quá 20%.

### Chân dung khách hàng 360°
- **Tab 360°** trong hồ sơ khách: thẻ tổng quan (tổng chi, số đơn, lần mua cuối, NPS, hạng, nhóm RFM, điểm) và một dòng thời gian gộp mọi điểm chạm, lọc theo loại.
- **Hồ sơ trùng lặp**: quét theo SĐT (kể cả +84, có dấu chấm), email, tên; so sánh cạnh nhau và gộp: toàn bộ đơn, phiếu, cuộc gọi, tin nhắn, điểm thưởng… chuyển về hồ sơ giữ lại, bản bị gộp vào thùng rác. Hằng tuần báo khi có nhóm trùng mới.
- **Chấm điểm theo hành vi**: điểm hồ sơ cộng điểm mở mail, điền form, nhắn tin, gọi tốt, mua hàng, khảo sát…; giảm dần khi khách im lặng. Xem "vì sao điểm này", chỉnh điểm ở **Cài đặt → Chấm điểm khách**.
- **Phân tích RFM**: 8 nhóm (VIP, Trung thành, Sắp rời bỏ, Đã ngủ đông…), lưu thành nhóm khách để gửi hàng loạt.
- **Quét danh thiếp / CCCD** bằng AI để điền sẵn hồ sơ (cần khoá Claude; ảnh không được lưu).

### Khảo sát, voucher, tuỳ chỉnh hiển thị
- **Khảo sát**: câu hỏi NPS, chấm sao, chọn, văn bản; link riêng cho từng khách hoặc link chung; báo cáo NPS theo tuần; tự gửi sau khi xử lý phiếu hỗ trợ; báo người phụ trách khi khách chấm thấp.
- **Voucher**: chiến dịch giảm % hoặc tiền, trần giảm, đơn tối thiểu, số lượt mỗi khách; phát tay, theo nhóm khách hoặc tự động; nhập mã trong đơn hàng.
- **Dạng xem đã lưu**: lưu cột, thứ tự, độ rộng, bộ lọc, nhóm, sắp xếp; chia sẻ cho đội; kéo đổi thứ tự và độ rộng cột.
- **Quyền theo trường** (Sửa / Chỉ xem / Ẩn cho Quản lý và Nhân viên) và **bố cục hồ sơ** theo nhóm trường: **Cài đặt → Quyền & bố cục trường**.
- **Tự động hoá thêm**: khi đến sinh nhật hằng năm, khách im lặng N ngày, mở/nhấp email, điền form, trả lời khảo sát, đổi nhóm RFM, dùng voucher → phát voucher, gửi khảo sát, gắn thẻ, cộng/trừ điểm, giao theo đội hoặc khu vực, gửi tin kênh tự chọn (ZNS → Zalo → SMS → Email).
- Phiếu hỗ trợ có **phân loại** và tự chuyển cho đúng đội.

So sánh đầy đủ với BizCRM (Bizfly) trong [docs/SO-SANH-BIZFLY.md](docs/SO-SANH-BIZFLY.md).

### Vận hành
- **Docker một lệnh** (`docker compose up -d`), kèm tuỳ chọn chép lời (speaches), đường hầm webhook (cloudflared) và Postgres.
- **Sao lưu tự động** mỗi ngày (giữ 14 bản), sao lưu/tải về/khôi phục ngay trong **Cài đặt → Sao lưu**.
- Chuyển **SQLite ↔ Postgres** bằng một lệnh. **Kiểm thử tự động** (`npm test`, `npm run smoke`).

### Khác
- **Bảng lệnh Ctrl/⌘ + K**: tìm khách (không dấu cũng ra), số điện thoại, tài liệu, trang, và hành động nhanh.
- Thanh bên thu gọn được; trên điện thoại có thanh điều hướng dưới cùng.
- Giao diện sáng / tối / theo máy.
- Dữ liệu nằm hoàn toàn trên máy hoặc server của bạn.

---

## Hình ảnh giao diện

### 1. Bắt đầu: đăng ký và điền DNA

| Đăng ký lần đầu | Chọn ngành |
|---|---|
| ![Đăng ký](docs/screenshots/01-dang-ky.png) | ![Chọn ngành](docs/screenshots/02-dna-chon-nganh.png) |

| Kể quy trình bán hàng | Xem trước CRM được dựng |
|---|---|
| ![Quy trình bán](docs/screenshots/03-dna-quy-trinh-ban.png) | ![Xem trước cấu hình](docs/screenshots/04-xem-truoc-cau-hinh.png) |

### 2. Làm việc hằng ngày

**Trang chủ**: Daily Briefing, KPI theo ngành, biểu đồ theo giai đoạn, khách nóng, việc sắp tới.
![Trang chủ](docs/screenshots/05-trang-chu.png)

**Board khách hàng** có điểm AI, và **chọn trạng thái** bằng một cú bấm:

| Board khách hàng | Đổi trạng thái |
|---|---|
| ![Board khách](docs/screenshots/09-board-khach-hang.png) | ![Chọn trạng thái](docs/screenshots/10-chon-trang-thai.png) |

| Kanban kéo thả | Lịch tháng |
|---|---|
| ![Kanban](docs/screenshots/07-kanban.png) | ![Lịch](docs/screenshots/08-lich-hen.png) |

**Panel chi tiết + Sales Coach** gợi ý bước tiếp theo và soạn sẵn tin nhắn:
![Chi tiết và Sales Coach](docs/screenshots/11-chi-tiet-sales-coach.png)

### 3. AI và tự động hoá

**Trợ lý CRM**: ra lệnh bằng tiếng Việt, ghi thẳng vào dữ liệu.
![Trợ lý AI](docs/screenshots/12-tro-ly-ai.png)

| Công thức tự động hoá | Đội AI Agent |
|---|---|
| ![Tự động hoá](docs/screenshots/14-tu-dong-hoa.png) | ![AI Agent](docs/screenshots/15-ai-agent.png) |

### 4. Dữ liệu, đội ngũ, cài đặt

| Nhập từ Excel, tự ghép cột | Việc của tôi |
|---|---|
| ![Nhập Excel](docs/screenshots/13-nhap-excel.png) | ![Việc của tôi](docs/screenshots/16-viec-cua-toi.png) |

| Form thu lead công khai | Giao diện tối |
|---|---|
| ![Form thu lead](docs/screenshots/18-form-thu-lead.png) | ![Giao diện tối](docs/screenshots/19-giao-dien-toi.png) |

**Cài đặt**: DNA, lịch sử phiên bản, thành viên và link mời, form thu lead, sửa bảng/trạng thái/cột.
![Cài đặt](docs/screenshots/17-cai-dat.png)

<p align="center"><img src="docs/screenshots/20-dien-thoai.png" width="300" alt="Giao diện điện thoại"></p>

### 5. Telesales

**Hàng gọi + bàn gọi**: khách xếp theo độ ưu tiên, kịch bản bên cạnh, chọn kết quả và tải ghi âm.
![Hàng gọi](docs/screenshots/21-telesales-hang-goi.png)

**Chấm điểm cuộc gọi**: điểm từng tiêu chí kèm câu trích dẫn, quản lý chấm lại ở cột phải.
![Chấm điểm cuộc gọi](docs/screenshots/23-cham-diem-cuoc-goi.png)

| Danh sách cuộc gọi | Bảng xếp hạng & kỹ năng |
|---|---|
| ![Cuộc gọi](docs/screenshots/22-telesales-cuoc-goi.png) | ![Bảng xếp hạng](docs/screenshots/24-bang-xep-hang.png) |

**Vòng phản hồi**: bài học từ dữ liệu, trọng số đề xuất, chủ duyệt là phiếu chấm lên phiên bản mới.
![Vòng phản hồi](docs/screenshots/25-vong-phan-hoi.png)

### 6. Nguồn khách

**Báo cáo theo kênh và chiến dịch**, cùng các kết nối Ads, Zalo OA, TMĐT, tổng đài.
![Nguồn khách](docs/screenshots/26-nguon-khach.png)

| Kết nối Zalo OA | Telesales trên điện thoại |
|---|---|
| ![Kết nối Zalo OA](docs/screenshots/27-ket-noi-zalo-oa.png) | <img src="docs/screenshots/28-telesales-dien-thoai.png" width="300" alt="Telesales trên điện thoại"> |

### 7. Bản nâng cấp Work OS

**Trang chủ trung tâm chỉ huy**: KPI có biểu đồ nhỏ 14 ngày, dự báo doanh thu, việc hôm nay, hẹn gọi lại, tin chưa đọc (ảnh đầu trang).

**Hộp thư hợp nhất** Zalo OA + Messenger, thẻ khách bên phải, AI soạn trả lời:
![Hộp thư](docs/screenshots/30-hop-thu.png)

| Telesales: gọi trên trình duyệt, gọi liên tục, trợ lý từ chối | Hội thoại theo người nói + cảm xúc khách |
|---|---|
| ![Telesales](docs/screenshots/31-telesales-goi-lien-tuc.png) | ![Hội thoại](docs/screenshots/32-hoi-thoai-cam-xuc.png) |

**Marketing & ROAS**: chi phí, CPL, ROAS từng chiến dịch, nhận xét của Marketing Analyst:
![Marketing ROAS](docs/screenshots/33-marketing-roas.png)

| Kịch bản chăm sóc tự động | Dashboard tự chọn widget |
|---|---|
| ![Chăm sóc tự động](docs/screenshots/34-cham-soc-tu-dong.png) | ![Dashboard](docs/screenshots/35-dashboard.png) |

| Tự động hoá "Khi… thì…" | Gantt / Timeline |
|---|---|
| ![Tự động hoá](docs/screenshots/36-tu-dong-hoa-khi-thi.png) | ![Gantt](docs/screenshots/37-gantt.png) |

| Kanban kèm % khả năng chốt | Tài liệu |
|---|---|
| ![Kanban](docs/screenshots/38-kanban-kha-nang-chot.png) | ![Tài liệu](docs/screenshots/39-tai-lieu.png) |

| Bảng lệnh Ctrl+K | Phân quyền & thành viên |
|---|---|
| ![Bảng lệnh](docs/screenshots/40-bang-lenh.png) | ![Phân quyền](docs/screenshots/41-phan-quyen.png) |

| Nhật ký thao tác | Sao lưu & khôi phục |
|---|---|
| ![Nhật ký](docs/screenshots/42-nhat-ky-thao-tac.png) | ![Sao lưu](docs/screenshots/43-sao-luu.png) |

**Giao diện tối** và **điện thoại**:
![Dashboard tối](docs/screenshots/45-dashboard-toi.png)

<p align="center"><img src="docs/screenshots/46-dien-thoai-trang-chu.png" width="280" alt="Trang chủ trên điện thoại"> <img src="docs/screenshots/44-dien-thoai-hop-thu.png" width="280" alt="Hộp thư trên điện thoại"></p>

**Thao tác trên bảng kiểu monday** (menu cột, nhóm theo cột lựa chọn, biểu đồ, lịch sử thay đổi, lịch sử chạy tự động hoá):

| Menu tiêu đề cột | Nhóm theo cột lựa chọn |
|---|---|
| ![Menu cột](docs/screenshots/47-menu-tieu-de-cot.png) | ![Nhóm theo dịch vụ](docs/screenshots/48-nhom-theo-truong-lua-chon.png) |

| Chế độ Biểu đồ | Lịch sử thay đổi của một mục |
|---|---|
| ![Biểu đồ](docs/screenshots/49-che-do-bieu-do.png) | ![Lịch sử](docs/screenshots/50-lich-su-thay-doi.png) |

![Lịch sử chạy tự động hoá](docs/screenshots/51-lich-su-chay-tu-dong-hoa.png)

**Cột mới, menu dòng, hiển thị, nhật ký bảng, thùng rác, @nhắc tên** (xem bảng so sánh đầy đủ trong [docs/SO-SANH-MONDAY.md](docs/SO-SANH-MONDAY.md)):

| Ô tích, tiến độ, thẻ, liên kết + tô màu | Menu chuột phải |
|---|---|
| ![Cột mới](docs/screenshots/52-cot-moi-va-to-mau.png) | ![Menu chuột phải](docs/screenshots/53-menu-chuot-phai.png) |

| Độ cao dòng, tô màu theo điều kiện | Nhật ký bảng |
|---|---|
| ![Hiển thị](docs/screenshots/54-do-cao-dong-to-mau.png) | ![Nhật ký bảng](docs/screenshots/55-nhat-ky-bang.png) |

| Thùng rác | @nhắc tên trong cập nhật |
|---|---|
| ![Thùng rác](docs/screenshots/56-thung-rac.png) | ![Nhắc tên](docs/screenshots/57-nhac-ten.png) |

### 8. Bán hàng, chăm sóc, marketing hàng loạt, KPI

So sánh đầy đủ với Getfly CRM trong [docs/SO-SANH-GETFLY.md](docs/SO-SANH-GETFLY.md).

| Báo giá: duyệt, gửi link cho khách | Bản in A4 / PDF |
|---|---|
| ![Báo giá](docs/screenshots/58-bao-gia.png) | ![In báo giá](docs/screenshots/59-bao-gia-in.png) |

| Đơn hàng, thu tiền nhiều đợt | Công nợ phải thu |
|---|---|
| ![Đơn hàng](docs/screenshots/60-don-hang-thu-tien.png) | ![Công nợ](docs/screenshots/61-cong-no.png) |

| Phiếu hỗ trợ có SLA | Tích điểm và hạng thành viên |
|---|---|
| ![Phiếu hỗ trợ](docs/screenshots/62-phieu-ho-tro.png) | ![Tích điểm](docs/screenshots/63-tich-diem.png) |

| Bảo hành | Gửi hàng loạt |
|---|---|
| ![Bảo hành](docs/screenshots/64-bao-hanh.png) | ![Gửi hàng loạt](docs/screenshots/65-gui-hang-loat.png) |

| Landing page | Phễu chuyển đổi |
|---|---|
| ![Landing page](docs/screenshots/66-landing-page.png) | ![Phễu](docs/screenshots/67-pheu-chuyen-doi.png) |

| Chỉ tiêu KPI | Bảng tin nội bộ |
|---|---|
| ![KPI](docs/screenshots/68-kpi.png) | ![Bảng tin](docs/screenshots/69-bang-tin.png) |

| Bảo mật dữ liệu | Báo giá trên điện thoại |
|---|---|
| ![Bảo mật](docs/screenshots/70-bao-mat-du-lieu.png) | <img src="docs/screenshots/71-dien-thoai-bao-gia.png" width="280" alt="Báo giá trên điện thoại"> |

---

## Cài đặt và chạy

**Cần có:** [Node.js 20 trở lên](https://nodejs.org) (chọn bản LTS). Chạy được trên Windows, macOS và Linux.

```bash
# 1. Tải mã nguồn
git clone https://github.com/nguyentatkiem/dna-crm.git
cd dna-crm

# 2. Cài thư viện
npm install

# 3. Tạo file cấu hình .env (tự sinh khoá bảo mật) và database
npm run setup

# 4. Chạy
npm run dev
```

`npm run dev` dùng Turbopack (mở trang lần đầu nhanh hơn 2–5 lần). Nếu gặp lỗi lạ khi chạy thử, dùng `npm run dev:webpack` (trình biên dịch cũ).

Mở **http://localhost:3210** trên trình duyệt:
1. Tạo tài khoản đầu tiên. Tài khoản này là chủ workspace.
2. Điền DNA doanh nghiệp, xem trước, bấm **Áp dụng**.
3. Tích ô "Thêm dữ liệu mẫu" nếu muốn thử ngay. Xoá dữ liệu mẫu sau trong **Cài đặt**.

**Muốn xem nhanh mà không điền DNA?**

```bash
npm run demo -- spa   # hoặc: bds, edu, retail, b2b, dental, fnb, auto, insurance, interior
```

Lệnh này tạo workspace demo đã có dữ liệu. Đăng nhập bằng `demo@dnacrm.local` / `demo12345` (chỉ dùng trên máy của bạn).

**Quên mật khẩu chủ workspace:**

```bash
npm run reset-password -- email@cuaban.vn MatKhauMoi123
```

Nhân viên quên mật khẩu thì chủ workspace đặt lại trong **Cài đặt → Thành viên**.

**Chạy bản chính thức (nhanh hơn bản dev):**

```bash
npm run build
npm start
```

**Hoặc chạy bằng Docker** (không cần cài Node.js):

```bash
docker compose up -d
```

Thêm `--profile stt` để có chép lời tiếng Việt miễn phí, `--profile tunnel` để có địa chỉ https công khai cho webhook. Chi tiết, cách chuyển Postgres, sao lưu và kiểm thử: [docs/VAN-HANH.md](docs/VAN-HANH.md).

**Kiểm tra mọi thứ chạy đúng:**

```bash
npm test
```

```bash
npm run smoke
```

`npm test` chạy kiểm thử tự động; `npm run smoke` mở thử tất cả trang và API chính (cần đang chạy `npm run dev`).

---

## Bật AI (tuỳ chọn)

1. Tạo API key tại [console.anthropic.com](https://console.anthropic.com).
2. Mở file `.env`, điền:
   ```
   ANTHROPIC_API_KEY="sk-ant-..."
   CLAUDE_MODEL="claude-opus-5-5"
   ```
   Muốn tiết kiệm chi phí thì đổi `CLAUDE_MODEL` thành `claude-sonnet-5-5` hoặc `claude-haiku-5-5`.
3. Khởi động lại `npm run dev`. Trang **AI Agent** sẽ báo "Đã kết nối Claude".

Những tính năng dùng AI:
- **DNA Architect** tinh chỉnh template theo đúng quy trình bán của bạn.
- **Trợ lý CRM** hiểu mọi câu hỏi và dùng công cụ để đọc, ghi dữ liệu thật.
- **Sales Coach** soạn tin nhắn theo từng khách.
- **Automation Builder** hiểu mô tả tự do.

Đầu ra của AI luôn được kiểm tra theo schema. Nếu AI lỗi hoặc từ chối, hệ thống tự quay về template nên không bao giờ hỏng cấu hình.

---

## Kết nối nguồn khách, tổng đài, chép lời

### 1. Cho nền tảng gọi được vào máy bạn
Facebook, Zalo, Shopee... cần gửi dữ liệu tới một địa chỉ **https công khai**. Nếu CRM đã chạy trên tên miền (xem phần dưới) thì bỏ qua bước này. Nếu đang chạy trên máy cá nhân, mở một đường hầm miễn phí:

```bash
npx cloudflared tunnel --url http://localhost:3210
```

Lệnh in ra địa chỉ dạng `https://xxx.trycloudflare.com`. Mở CRM bằng địa chỉ đó thì các URL webhook trong trang **Nguồn khách** sẽ dùng được ngay. Địa chỉ đổi mỗi lần chạy lại, nên khi dùng thật hãy đưa CRM lên server có tên miền.

### 2. Kết nối từng nguồn
Vào **Nguồn khách** → bấm vào nguồn → làm theo hướng dẫn trong khung bên phải:
1. Chép **URL webhook** dán vào nền tảng.
2. Điền **khoá bí mật** (App Secret, google_key, Partner Key...). Khi đã điền, CRM từ chối mọi yêu cầu sai chữ ký.
3. Bấm **Gửi thử một lead** để kiểm tra luồng, xem kết quả ở **Nhật ký nhận lead**.

Nguồn chưa có sẵn (Pancake, Ladipage, Google Sheets, CRM khác...): dùng **Website, Landing page, n8n/Make** và gửi JSON có `name`, `phone`, `email`, `note`, `utm_source`, `utm_campaign`.

### 3. Tổng đài
Khai báo URL webhook **Tổng đài** làm Event URL / webhook kết thúc cuộc gọi. CRM nhận các trường `call_id`, `from`, `to`, `direction`, `duration`, `recording_url`, `agent` (và nhiều tên tương đương). Cuộc gọi tự gắn vào khách theo SĐT và xuất hiện ở **Telesales → Cuộc gọi**.

### 4. Chép lời ghi âm tiếng Việt (để AI chấm điểm)
Chọn một trong hai, điền vào `.env` rồi khởi động lại:
- **Miễn phí, chạy trên máy bạn**: cài [speaches](https://github.com/speaches-ai/speaches) (faster-whisper, có API chuẩn OpenAI) bằng Docker theo hướng dẫn của dự án, rồi đặt `TRANSCRIBE_BASE_URL="http://localhost:8000"`. Máy có GPU sẽ nhanh hơn nhiều. Có thể thay bằng `whisper.cpp` server, hoặc bất kỳ dịch vụ nào có endpoint `/v1/audio/transcriptions`.
- **Dịch vụ trả phí**: điền `FPT_AI_API_KEY` để dùng FPT.AI Speech to Text.

Không cấu hình gì thì vẫn lưu được ghi âm; dán bản chép lời bằng tay để được chấm điểm.

Máy chủ chép lời có tách người nói (ví dụ whisperX) thì CRM dùng luôn nhãn người nói; không có thì Claude (hoặc luật) tự gán câu nào của nhân viên, câu nào của khách.

### 5. Gọi điện ngay trên trình duyệt
**Telesales → Tổng đài**: điền địa chỉ WebSocket (`wss://...`) của tổng đài, tên miền SIP, số máy nhánh và mật khẩu. Thông tin này nhà cung cấp tổng đài cấp khi bạn bật WebRTC. Mật khẩu máy nhánh được dùng ở trình duyệt của nhân viên, nên mỗi nhân viên nên có máy nhánh riêng.

### 6. Hộp thư Zalo OA và Messenger
- **Zalo OA**: ở trang quản lý webhook của ứng dụng Zalo, bật thêm các sự kiện tin nhắn (`user_send_text`, `user_send_image`...) cho cùng URL webhook Zalo trong **Nguồn khách**.
- **Messenger**: trong ứng dụng Facebook, đăng ký thêm `messages`, `messaging_postbacks`, `message_echoes` cho Trang; điền Page token trong **Nguồn khách → Facebook** để trả lời được.

### 7. Chi phí quảng cáo và kênh gửi tin
- **Marketing → Kết nối tài khoản quảng cáo**: Facebook (access token + ID tài khoản quảng cáo), Google Ads (developer token, OAuth client, refresh token, customer ID). Trong trang có hướng dẫn lấy từng khoá.
- **Marketing → Kênh gửi tin**: mẫu ZNS mặc định, SMS (eSMS / SpeedSMS / API tuỳ biến), email SMTP. Có nút **Gửi thử**.

---

## Đưa lên mạng cho cả đội dùng

Mặc định dữ liệu lưu trong file SQLite `prisma/dev.db`. Cách này hợp khi chạy trên một máy, hoặc một máy chủ trong văn phòng mà cả đội truy cập qua mạng nội bộ.

Để chạy trên internet (ví dụ Vercel):
1. Tạo database Postgres miễn phí trên [Neon](https://neon.tech) hoặc [Supabase](https://supabase.com).
2. Trong `prisma/schema.prisma`, đổi `provider = "sqlite"` thành `provider = "postgresql"`.
3. Đặt biến môi trường:
   - `DATABASE_URL`: chuỗi kết nối Postgres;
   - `SESSION_SECRET`: chuỗi ngẫu nhiên dài, tạo bằng `openssl rand -base64 32` (bắt buộc, thiếu thì ứng dụng báo lỗi);
   - `ANTHROPIC_API_KEY`: nếu dùng AI.
4. Chạy `npx prisma db push`, rồi deploy (trên Vercel: Import repo → thêm biến môi trường → Deploy).

Khi đã có tên miền, link **Form thu lead** và các **URL webhook** trong Nguồn khách sẽ dùng được từ bên ngoài.

> **Ghi âm cuộc gọi** lưu ở thư mục `uploads/` cạnh mã nguồn. Trên Vercel ổ đĩa không lưu lâu dài, nên nếu dùng Telesales có ghi âm, hãy chạy trên VPS / máy chủ có ổ đĩa (hoặc tự đổi `saveRecording` trong `src/lib/calls.ts` sang S3/R2).

---

## Câu hỏi thường gặp

**Dữ liệu của tôi có bị gửi đi đâu không?**
Không. Mọi dữ liệu nằm trong database của bạn. Chỉ khi bật AI, nội dung liên quan đến yêu cầu (ví dụ thông tin một khách khi nhờ Sales Coach) mới được gửi tới Claude API để xử lý.

**Thêm ngành mới thế nào?**
Thêm một mục trong `INDUSTRIES` và `DNA_HINTS` ở `src/lib/dna.ts`, cùng một template trong `src/lib/config/templates.ts`. TypeScript sẽ báo lỗi nếu bạn quên một trong hai.

**Đang dùng bản cũ, cập nhật lên bản mới thế nào?**
Sao lưu trước (`npm run backup`), rồi chạy `git pull`, `npm install`, `npx prisma db push`. Các bảng mới được thêm vào, dữ liệu cũ giữ nguyên.

**Việc chạy nền (gửi tin chăm sóc, nhắc việc, đồng bộ quảng cáo, sao lưu) có cần cài cron không?**
Không. Các việc này tự chạy mỗi phút khi CRM đang chạy bằng `npm start`, `npm run dev` hoặc Docker. Muốn tắt thì đặt `CRM_JOBS=off`. Trên Vercel (không có tiến trình chạy liên tục), hãy chạy CRM trên VPS hoặc Docker.

**Ghi âm cuộc gọi có hợp pháp không?**
Hãy thông báo cho khách rằng cuộc gọi được ghi âm để nâng cao chất lượng dịch vụ, và chỉ dùng ghi âm cho mục đích đó. Ghi âm là dữ liệu cá nhân: giới hạn người được nghe và xoá khi không còn cần.

**Cổng 3210 bị trùng?**
Sửa số cổng trong `package.json` ở hai lệnh `dev` và `start`.

---

## Cấu trúc mã nguồn

```
src/lib/dna.ts                 DNA schema, 10 ngành, gợi ý điền sẵn
src/lib/config/schema.ts       WorkspaceConfig (Zod), trái tim của hệ thống tuỳ biến
src/lib/config/templates.ts    10 template ngành (tầng 1, không cần AI)
src/lib/ai.ts                  Claude tinh chỉnh cấu hình (tầng 2) + kiểm tra đầu ra
src/lib/records.ts             Bản ghi, Lead Qualifier
src/lib/automation.ts          Bộ chạy tự động hoá: sự kiện, điều kiện, 10 hành động
src/lib/calls.ts               Telesales: phiếu chấm, chép lời, tách giọng, Call Analyst, vòng phản hồi
src/lib/objections.ts          Thư viện xử lý từ chối cho trợ lý khi gọi
src/lib/sources/               Hub nguồn khách: chuẩn hoá lead, chống trùng, 12 bộ đọc webhook
src/lib/inbox.ts, messenger.ts Hộp thư Zalo OA + Messenger, AI soạn trả lời
src/lib/marketing/             Chi phí quảng cáo, ROAS, gửi tin, kịch bản chăm sóc
src/lib/widgets.ts             Tính dữ liệu widget dashboard
src/lib/formula.ts             Bộ tính cột công thức (không dùng eval)
src/lib/predict.ts             Dự báo khả năng chốt (hồi quy logistic)
src/lib/permissions.ts         Vai trò, quyền, phạm vi dữ liệu
src/lib/audit.ts, notify.ts    Nhật ký thao tác, thông báo, nhắc việc
src/lib/backup.ts, xlsx.ts     Sao lưu/khôi phục, nhập xuất Excel
src/lib/jobs.ts                Việc chạy nền (src/instrumentation.ts khởi động)
src/components/board/          Board, Kanban, Gantt, Lịch, bảng ảo, panel chi tiết, tài liệu
src/components/Softphone.tsx   Gọi điện trên trình duyệt (JsSIP)
src/components/ui/             Thành phần dùng chung: Drawer, Tabs, Badge, EmptyState...
src/app/api/                   API cho mọi module; hooks/[key]/[nguồn] là webhook
scripts/                       demo, reset-password, backup, restore, use-db, smoke
tests/, src/**/*.test.ts       Kiểm thử (vitest)
Dockerfile, docker-compose.yml Chạy bằng Docker
DESIGN.md                      Nguyên tắc giao diện
```

**Công nghệ:** Next.js 15 · React 19 · TypeScript · Tailwind CSS · Prisma (SQLite / Postgres) · Zod · Claude API · JsSIP · dnd-kit · TanStack Virtual · Tiptap · Recharts · formula.js · ExcelJS · Nodemailer · Vitest. Tất cả thư viện đều giấy phép MIT (hoặc tương đương), dùng thương mại thoải mái.
