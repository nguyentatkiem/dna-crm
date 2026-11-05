# DNA CRM

**CRM đa ngành tự may đo theo DNA doanh nghiệp, kèm đội AI Agent.** Mã nguồn mở để bạn tải về và tự chạy cho doanh nghiệp của mình.

Bạn trả lời 6 nhóm câu hỏi về doanh nghiệp (ngành, sản phẩm, khách hàng, quy trình bán, đội ngũ, mục tiêu). **DNA Architect** sẽ dựng một CRM riêng cho bạn gồm:
- tên gọi đúng ngành (Khách / Bệnh nhân / Học viên / Chủ nhà...);
- các giai đoạn bán hàng, cột dữ liệu và dashboard KPI;
- công thức tự động hoá và các AI Agent phù hợp.

Giao diện theo phong cách Work OS (board chia nhóm màu, ô trạng thái tô màu, Kanban, lịch), quen thuộc với người đã dùng các công cụ quản lý công việc hiện đại.

Đi kèm hai module bán hàng thực chiến:
- **Telesales**: hàng gọi ưu tiên, ghi nhận cuộc gọi và ghi âm, **AI chấm điểm từng cuộc gọi** theo phiếu chấm, quản lý chấm lại, **vòng phản hồi** tự rút bài học để cập nhật phiếu chấm và kịch bản.
- **Hub nguồn khách**: lead từ **Facebook, Google, TikTok Ads**, **Zalo OA**, sàn **Shopee, Lazada, TikTok Shop**, web bán hàng **Haravan, Sapo, Shopify, WooCommerce**, website/landing page và **tổng đài** đổ về một chỗ, tự chống trùng, gắn kênh và chiến dịch.

![Board giai đoạn bán hàng](docs/screenshots/06-board-giai-doan.png)

---

## Mục lục

- [Tính năng](#tính-năng)
- [Hình ảnh giao diện](#hình-ảnh-giao-diện)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Bật AI (tuỳ chọn)](#bật-ai-tuỳ-chọn)
- [Kết nối nguồn khách, tổng đài, chép lời](#kết-nối-nguồn-khách-tổng-đài-chép-lời)
- [Đưa lên mạng cho cả đội dùng](#đưa-lên-mạng-cho-cả-đội-dùng)
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
- **3 chế độ xem**: Bảng chính · Kanban kéo thả · Lịch tháng.
- Tìm kiếm, lọc theo người phụ trách, sắp xếp (mới nhất, tên, giá trị, điểm AI).
- **Panel chi tiết**: tab Cập nhật (như một dòng thời gian), Thông tin và Việc cần làm.

### Dữ liệu vào và ra
- **Nhập từ Excel / Google Sheets**: chọn file CSV hoặc dán thẳng bảng đã sao chép. Hệ thống tự ghép cột và tự bỏ qua khách trùng số điện thoại.
- **Xuất Excel (CSV)** ở mọi bảng, mở bằng Excel vẫn đúng tiếng Việt.
- **Form thu lead công khai**: một link để gắn vào fanpage hoặc bio, hoặc mã nhúng cho website. Khách điền xong sẽ tự vào bảng, được chấm điểm và chạy tự động hoá. Form có bẫy chống bot.

### Telesales: gọi, ghi âm, chấm điểm, vòng phản hồi
- **Hàng gọi ưu tiên** tự sắp: hẹn gọi lại đến hạn → lead chưa gọi (điểm cao trước) → gọi lỡ cần thử lại (tối đa 3 lần). Khách đã từ chối, sai số, đã chốt tự rời hàng.
- **Bàn gọi**: bấm Gọi (mở ứng dụng gọi trên điện thoại hoặc softphone), bấm giờ, kịch bản gọi ngay bên cạnh, chọn kết quả (8 loại), ghi chú, hẹn gọi lại (tự tạo việc), tải file ghi âm hoặc dán bản chép lời.
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

### Tự động hoá
- Công thức dạng câu: **"Khi giai đoạn đổi thành Đặt cọc, thì tạo việc Gửi hợp đồng hạn sau 1 ngày"**.
- Kích hoạt khi có mục mới hoặc khi đổi trạng thái. Hành động có thể là tạo việc có hạn, gửi thông báo, hoặc chia người phụ trách xoay vòng.
- **Tạo công thức bằng lời**: gõ mô tả, Automation Builder tự dựng công thức.
- Bật/tắt từng công thức và đếm số lần đã chạy.

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
| Care & Retention, Data Analyst, Data Hygiene, Sales Chat 24/7, Content & Campaign, Document Agent, Manager Agent | | Sắp ra mắt |

Mỗi agent có công tắc bật/tắt và **mức tự chủ** (Chỉ gợi ý / Làm rồi báo / Tự làm), kèm nhật ký hoạt động.

> **Không có API key vẫn dùng được.** Khi chưa cấu hình Claude, các agent chạy bằng template ngành và luật có sẵn. Thêm key để agent hiểu mọi câu hỏi và viết nội dung tự nhiên hơn.

### Làm việc theo đội
- Người đăng ký đầu tiên là **chủ workspace**.
- Mời nhân viên bằng **link mời dùng một lần**, hết hạn sau 7 ngày.
- Chủ workspace có thể đặt lại mật khẩu hoặc xoá thành viên.
- **Việc của tôi**: gom việc theo Quá hạn / Hôm nay / Tuần này / Sau đó.
- **Chuông thông báo**: việc đến hạn và hoạt động mới của agent.

### Khác
- Giao diện sáng và tối tự theo máy, dùng được trên điện thoại.
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

**Đang dùng bản cũ, cập nhật lên bản có Telesales thế nào?**
Chạy `git pull`, `npm install`, `npx prisma db push`. Các bảng mới được thêm vào, dữ liệu cũ giữ nguyên.

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
src/lib/records.ts             Bản ghi, Lead Qualifier, bộ chạy tự động hoá
src/lib/calls.ts               Telesales: phiếu chấm, chép lời, Call Analyst, vòng phản hồi
src/lib/sources/               Hub nguồn khách: chuẩn hoá lead, chống trùng, 12 bộ đọc webhook
src/lib/zalo.ts                Gửi tin Zalo OA, làm mới token
src/components/board/          Board, ô dữ liệu, Kanban, Lịch, panel chi tiết, nhập Excel
src/app/api/                   API: auth, dna, config, records, tasks, automations, agents,
                               copilot, members, notifications, public lead form,
                               calls (telesales), sources, hooks/[key]/[nguồn] (webhook)
scripts/                       demo.ts, reset-password.ts
DESIGN.md                      Nguyên tắc giao diện
```

**Công nghệ:** Next.js 15 · React 19 · TypeScript · Tailwind CSS · Prisma (SQLite / Postgres) · Zod · Claude API.
