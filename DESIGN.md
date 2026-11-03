# Ngôn ngữ giao diện (học từ phong cách "Work OS" của monday.com)

Mục tiêu: học **cách tổ chức và cảm giác sử dụng** của monday.com, không sao chép logo, tên hay hình ảnh thương hiệu. Sản phẩm có nhận diện riêng: **DNA CRM**.

## 1. Khung ứng dụng

| Thành phần | Cách monday làm | Áp dụng trong DNA CRM |
|---|---|---|
| Nền ứng dụng | Nền xám-xanh nhạt, nội dung đặt trong một "tấm" trắng bo góc nổi lên | `--bg` (#eceff8) + `.canvas` trắng, bo 8px góc trên trái |
| Thanh trên | Mảnh, cùng màu nền, icon thông báo / hộp thư / tìm kiếm / avatar bên phải | `Topbar`: tên workspace, tìm kiếm, nút Trợ lý AI, avatar |
| Sidebar trái | Sáng, mục "Home / My work", rồi danh sách workspace và board | `Sidebar`: Trang chủ, Việc của tôi, nhóm "Bảng" (sinh từ DNA), "Hệ thống" |
| Font | Figtree cho chữ, Poppins cho tiêu đề | Giữ cặp Figtree + Poppins (Google Fonts, có tiếng Việt) |
| Màu chính | Xanh dương #0073ea, hover #0060b9, chọn #cce5ff | `--primary`, `--primary-hover`, `--primary-selected` |

## 2. Board (trái tim của giao diện)

- **Tiêu đề board** lớn, có mô tả ngắn bên dưới. Hàng **tab view** (Bảng chính, Kanban...) có gạch chân khi đang chọn.
- **Thanh công cụ**: nút chính "Thêm mục mới" màu xanh, rồi Tìm kiếm, Người phụ trách, Lọc, Sắp xếp dạng nút trong suốt.
- **Group**: mỗi giai đoạn hoặc trạng thái là một group có **màu riêng**. Tiêu đề group in màu, có mũi tên thu gọn và số mục. Bảng của group có **dải màu 6px bên trái**.
- **Hàng** cao 36px, các ô ngăn bằng đường kẻ mảnh. Ô tên mục ở bên trái, hover thì hiện nút mở chi tiết.
- **Ô Status tô màu kín cả ô**, chữ trắng căn giữa. Bấm vào thì mở bảng chọn các nhãn màu.
- **Ô người**: avatar tròn có chữ viết tắt. **Ô số/tiền** căn phải, chữ số dạng tabular.
- **Hàng "+ Thêm mục"** ở cuối mỗi group để gõ nhanh.
- **Hàng tổng kết** dưới group: thanh "pin" thể hiện tỉ lệ status, tổng tiền.

## 3. Item panel (bấm vào một mục)

- Panel trượt từ phải, có tiêu đề là tên mục, tab **Cập nhật / Thông tin / Nhật ký**.
- Ô soạn "Viết cập nhật..." ở trên cùng, các cập nhật hiển thị dạng thẻ có avatar và thời gian.
- DNA CRM bổ sung khối **AI Sales Coach** ngay trong panel.

## 4. Kanban

- Mỗi cột là một status, tiêu đề cột tô màu status, thẻ trắng, kéo thả để đổi status.

## 5. Automation center

- Công thức dạng **câu tiếng Việt**: "Khi **trạng thái** đổi thành **Đặt cọc**, thì **tạo việc** ...". Phần biến số in đậm, gạch chân.
- Mỗi công thức là một thẻ có công tắc bật/tắt và số lần đã chạy.

## 6. Dashboard và Việc của tôi

- Dashboard là lưới **widget** bo góc: số lớn, biểu đồ cột, pin status, danh sách.
- "Việc của tôi" nhóm theo thời gian: **Quá hạn / Hôm nay / Tuần này / Sau đó / Không có hạn**.

## 7. Bảng màu status (dùng chung cho mọi ngành)

| Tên | Mã | Dùng cho |
|---|---|---|
| green | #00c875 | Hoàn tất, thắng, thân thiết |
| orange | #fdab3d | Đang làm, đang tư vấn |
| red | #df2f4a | Kẹt, huỷ, mất |
| blue | #579bfc | Mới |
| purple | #a25ddc | VIP, đặc biệt |
| darkblue | #0086c0 | Giai đoạn giữa |
| grass | #9cd326 | Gần chốt |
| sky | #66ccff | Chờ xác nhận |
| berry | #bb3354 | Hoàn trả |
| gray | #c4c4c4 | Chưa có / ngừng |

## 8. Giọng văn

Ngắn, thân thiện, động từ rõ ràng: "Thêm mục mới", "Đã lưu", "Viết cập nhật...". Không dùng emoji làm nhãn.
