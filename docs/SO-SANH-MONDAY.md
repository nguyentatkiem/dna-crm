# So sánh tính năng: monday.com và DNA CRM

Bảng này lập bằng cách **dùng thử monday.com** (tài khoản miễn phí, bảng mẫu "Social Media Planner") rồi đối chiếu với DNA CRM. Mọi tính năng trong DNA CRM đều tự viết; repo **không chứa mã, icon, font hay hình ảnh nào của monday**.

Ký hiệu: ✅ đã có · 🟡 có một phần · ❌ chưa có · ➖ cố ý không làm (không hợp với CRM bán hàng cho doanh nghiệp nhỏ, hoặc cần hạ tầng riêng).

Cập nhật lần cuối: 06-11-2026.

## 1. Loại cột (Column Center)

| monday | DNA CRM | Ghi chú |
|---|---|---|
| Status, Label, Priority | ✅ | Trạng thái + cột lựa chọn có màu |
| Text, Long text | ✅ | |
| People | ✅ | Người phụ trách (một người) |
| Numbers | ✅ | Số và Tiền (VNĐ) |
| Date | ✅ | |
| Formula | ✅ | Gần 400 hàm |
| Rating | ✅ | |
| Phone, Email | ✅ | |
| Checkbox | ✅ | Thêm trong bản này |
| Link | ✅ | Thêm trong bản này |
| Tags / Dropdown nhiều lựa chọn | ✅ | Thêm trong bản này (cột "Thẻ") |
| Progress tracking | ✅ | Thêm trong bản này (cột "Tiến độ" 0–100%) |
| Creation log, Last updated | ✅ | Ngày tạo trong lọc, cột Cập nhật |
| monday Doc | ✅ | Tài liệu gắn từng mục |
| Files | 🟡 | Đính kèm qua Tài liệu; chưa có cột tệp riêng |
| Timeline (bắt đầu–kết thúc) | 🟡 | Gantt dùng hai cột ngày |
| Connect boards, Mirror | 🟡 | Giao dịch liên kết khách qua `_lien_he`; chưa có cột liên kết tuỳ ý |
| Item ID, Auto number | ❌ | |
| Button, Dependency, Week, Hour, Time tracking, World clock, Country, Location, Color picker, Vote | ➖ | Ít dùng trong CRM bán hàng |
| Cột AI (Translate, Summarize, Assign labels, Prioritize) | 🟡 | Có Điểm AI, dự báo chốt, AI soạn tin; chưa có cột AI tuỳ ý |

## 2. Chế độ xem bảng

| monday | DNA CRM |
|---|---|
| Table | ✅ |
| Kanban | ✅ |
| Calendar | ✅ |
| Gantt / Timeline | ✅ |
| Chart | ✅ |
| Doc | ✅ (trang Tài liệu) |
| Form | ✅ (form nhúng web trong Cài đặt) |
| Dashboard | ✅ (trang Dashboard) |
| File gallery | ❌ |

## 3. Thao tác trên bảng

| monday | DNA CRM |
|---|---|
| Tìm, lọc theo người, lọc nâng cao | ✅ |
| Sắp xếp, nhóm theo cột | ✅ |
| Ẩn cột | ✅ |
| Menu tiêu đề cột (sắp xếp, lọc, nhóm, ẩn) | ✅ |
| Thanh tỉ lệ màu dưới cột | ✅ |
| Hàng tổng cho cột số | ✅ |
| Menu chuột phải trên dòng: mở, mở tab mới, sao chép link, nhân bản, chuyển nhóm, xoá | ✅ Thêm trong bản này |
| Menu nhóm: thu gọn nhóm / tất cả, chọn cả nhóm, xuất nhóm ra Excel | ✅ Thêm trong bản này |
| Độ cao dòng | ✅ Thêm trong bản này |
| Tô màu theo điều kiện (Conditional coloring) | ✅ Thêm trong bản này |
| Nhật ký hoạt động của cả bảng | ✅ Thêm trong bản này |
| Chọn nhiều dòng, sửa hàng loạt | ✅ |
| Nhập Excel/CSV, xuất Excel | ✅ |
| Subitem (mục con) | ❌ |
| Thùng rác (xoá có hoàn tác, khôi phục trong 30 ngày) | ✅ Thêm trong bản này |
| Đổi tên, đổi màu nhóm ngay trên bảng | 🟡 Đổi trong Cài đặt → trường dữ liệu |
| Ghim cột | 🟡 Cột tên luôn ghim trái |
| Giá trị mặc định cho mục mới | ❌ |

## 4. Khung chi tiết một mục

| monday | DNA CRM |
|---|---|
| Updates (cập nhật, bình luận) | ✅ |
| Files | 🟡 qua Tài liệu |
| Activity Log | ✅ tab Lịch sử |
| AI viết cập nhật | ✅ Sales Coach |
| @nhắc tên (có thông báo cho người được nhắc) | ✅ Thêm trong bản này |
| Emoji, định dạng chữ trong cập nhật | ❌ |
| Mở bằng link riêng | ✅ `?open=<id>` |

## 5. Tự động hoá

| monday | DNA CRM |
|---|---|
| Trình tạo "Khi… thì…" | ✅ |
| Thư viện mẫu theo nhóm | ✅ |
| Lịch sử chạy, tình trạng | ✅ |
| Bật/tắt, nhân bản, sửa | ✅ |
| Tích hợp Gmail, Outlook, Google Calendar, Slack | 🟡 Webhook (n8n, Make) + Zalo/ZNS/SMS/email riêng |
| AI tạo luật từ câu mô tả | ✅ |

## 6. Không gian làm việc

| monday | DNA CRM |
|---|---|
| Trang chủ workspace | ✅ |
| My Work | ✅ Việc của tôi |
| Thông báo, hộp thư | ✅ Thông báo + Hộp thư Zalo/Messenger |
| Tìm mọi thứ (Ctrl+K) | ✅ |
| Phân quyền, mời thành viên | ✅ |
| AI agent trong workspace | ✅ Đội AI Agent |
| Template center | 🟡 Mẫu theo 10 ngành khi tạo DNA |
| Nhiều workspace, yêu thích | ❌ |
| Notetaker (ghi chú cuộc họp) | 🟡 Ghi âm + chép lời cuộc gọi trong Telesales |

## 7. Việc nên làm tiếp (ưu tiên)

1. Cột Tệp đính kèm và chế độ xem File gallery.
2. Mục con (subitem) cho giao dịch nhiều hạng mục.
3. Cột liên kết bảng tuỳ ý (Connect boards / Mirror).
4. Lưu luật tô màu và độ cao dòng lên máy chủ để cả đội dùng chung (hiện lưu trên từng máy).
5. Mã mục tự tăng (Item ID / Auto number).
