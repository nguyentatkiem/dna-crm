# DNA CRM

**CRM đa ngành tự may đo theo DNA doanh nghiệp, kèm đội AI Agent.** Mã nguồn mở để bạn tải về và tự chạy cho doanh nghiệp của mình.

Bạn trả lời 6 nhóm câu hỏi về doanh nghiệp (ngành, sản phẩm, khách hàng, quy trình bán, đội ngũ, mục tiêu). **DNA Architect** sẽ dựng một CRM riêng cho bạn gồm:
- tên gọi đúng ngành (Khách / Bệnh nhân / Học viên / Chủ nhà...);
- các giai đoạn bán hàng, cột dữ liệu và dashboard KPI;
- công thức tự động hoá và các AI Agent phù hợp.

Giao diện theo phong cách Work OS (board chia nhóm màu, ô trạng thái tô màu, Kanban, lịch), quen thuộc với người đã dùng các công cụ quản lý công việc hiện đại.

![Board giai đoạn bán hàng](docs/screenshots/06-board-giai-doan.png)

---

## Mục lục

- [Tính năng](#tính-năng)
- [Hình ảnh giao diện](#hình-ảnh-giao-diện)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [Bật AI (tuỳ chọn)](#bật-ai-tuỳ-chọn)
- [Đưa lên mạng cho cả đội dùng](#đưa-lên-mạng-cho-cả-đội-dùng)
- [Câu hỏi thường gặp](#câu-hỏi-thường-gặp)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)

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
| Care & Retention, Data Analyst, Data Hygiene, Sales Chat 24/7, Call Analyst, Content & Campaign, Document Agent, Manager Agent | | Sắp ra mắt |

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

---

## Cài đặt và chạy

**Cần có:** [Node.js 20 trở lên](https://nodejs.org) (chọn bản LTS). Chạy được trên Windows, macOS và Linux.

```bash
# 1. Tải mã nguồn
git clone https://github.com/<tài-khoản>/dna-crm.git
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

Khi đã có tên miền, link **Form thu lead** trong Cài đặt sẽ dùng được từ bên ngoài.

---

## Câu hỏi thường gặp

**Dữ liệu của tôi có bị gửi đi đâu không?**
Không. Mọi dữ liệu nằm trong database của bạn. Chỉ khi bật AI, nội dung liên quan đến yêu cầu (ví dụ thông tin một khách khi nhờ Sales Coach) mới được gửi tới Claude API để xử lý.

**Thêm ngành mới thế nào?**
Thêm một mục trong `INDUSTRIES` và `DNA_HINTS` ở `src/lib/dna.ts`, cùng một template trong `src/lib/config/templates.ts`. TypeScript sẽ báo lỗi nếu bạn quên một trong hai.

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
src/components/board/          Board, ô dữ liệu, Kanban, Lịch, panel chi tiết, nhập Excel
src/app/api/                   API: auth, dna, config, records, tasks, automations, agents,
                               copilot, members, notifications, public lead form
scripts/                       demo.ts, reset-password.ts
DESIGN.md                      Nguyên tắc giao diện
```

**Công nghệ:** Next.js 15 · React 19 · TypeScript · Tailwind CSS · Prisma (SQLite / Postgres) · Zod · Claude API.
