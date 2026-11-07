# Triển khai DNA CRM chạy thật (VPS + tên miền + HTTPS)

Tài liệu từng bước để đưa CRM lên một VPS Ubuntu, có tên miền riêng, HTTPS, Postgres, sao lưu ra ngoài máy chủ và kết nối Facebook / Zalo / ngân hàng / vận chuyển. Các thao tác vận hành hằng ngày (chép lời, đường hầm, chi tiết sao lưu) xem thêm `docs/VAN-HANH.md`.

> Ký hiệu: `crm.congty.vn` là tên miền ví dụ, thay bằng tên miền của bạn. Lệnh `docker compose ...` chạy trong thư mục dự án trên VPS.

---

## 0. Cần chuẩn bị

| Thứ | Gợi ý |
|---|---|
| VPS | Ubuntu 22.04 / 24.04, tối thiểu 2 vCPU, 4 GB RAM, 40 GB SSD (thêm 4 GB RAM nếu bật chép lời ghi âm) |
| Tên miền | Một tên miền con, vd. `crm.congty.vn`, tạo bản ghi **A** trỏ về IP của VPS |
| Kho lưu trữ ngoài | Cloudflare R2 / AWS S3 / Backblaze B2 / MinIO — để chứa bản sao lưu (mục 6) |
| Tuỳ chọn | Khoá Claude (`ANTHROPIC_API_KEY`), tài khoản Facebook Developer, Zalo OA, Casso / SePay, GHN |

---

## 1. Cài Docker trên VPS

```bash
ssh root@<IP-VPS>
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh          # cài Docker Engine + plugin compose
adduser crm && usermod -aG docker crm           # tạo user riêng, không chạy bằng root
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
su - crm
```

Kiểm tra: `docker compose version` phải in ra phiên bản v2.

---

## 2. Lấy mã nguồn và tạo file `.env`

```bash
git clone <địa-chỉ-repo> dna-crm && cd dna-crm
cp docker/postgres.env.example .env             # bắt đầu từ cấu hình Postgres
nano .env
```

Nội dung `.env` tối thiểu khi chạy thật (docker-compose đọc file này):

```bash
# --- Database: Postgres chạy kèm trong Docker ---
COMPOSE_PROFILES=postgres,https
DB_PROVIDER=postgresql
POSTGRES_PASSWORD=<mật-khẩu-dài-ngẫu-nhiên>
CRM_DATABASE_URL=postgresql://crm:<mật-khẩu-dài-ngẫu-nhiên>@postgres:5432/crm?schema=public

# --- Bảo mật & địa chỉ ---
CRM_SESSION_SECRET=<kết quả của: openssl rand -base64 32>
APP_URL=https://crm.congty.vn
CRM_DOMAIN=crm.congty.vn
# Chỉ mở cổng 3210 cho chính VPS (người dùng vào qua Caddy cổng 443)
CRM_PORT=127.0.0.1:3210

# --- Tuỳ chọn ---
ANTHROPIC_API_KEY=sk-ant-...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@congty.vn
MESSAGING_DRY_RUN=
ERROR_WEBHOOK_URL=
```

Giải thích các biến:

| Biến (trong `.env` của Docker) | Bắt buộc | Ý nghĩa |
|---|---|---|
| `CRM_SESSION_SECRET` | Nên đặt | Khoá ký phiên đăng nhập và mã hoá bí mật 2 lớp (≥ 32 ký tự). Để trống thì container tự sinh và lưu ở volume `crm-data`. **Đổi khoá = mọi người phải đăng nhập lại và phải bật lại xác thực 2 lớp.** Khi chạy không Docker, biến tên là `SESSION_SECRET`. |
| `APP_URL` | Có | Địa chỉ HTTPS công khai. Dùng cho link báo giá, khảo sát, ngừng nhận tin, theo dõi email, webhook. |
| `CRM_DATABASE_URL` + `DB_PROVIDER` | Có (Postgres) | Chuỗi kết nối Postgres. Ảnh Docker được build riêng cho Postgres khi `DB_PROVIDER=postgresql`. Khi chạy không Docker, biến tên là `DATABASE_URL`. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Không | Thông báo đẩy lên điện thoại. Tạo khoá: `npx web-push generate-vapid-keys`. |
| `ANTHROPIC_API_KEY` | Không | AI Agent, gợi ý trả lời, chatbot dùng Claude. Không có vẫn chạy bằng luật / mẫu. |
| `MESSAGING_DRY_RUN` | — | **Để trống khi chạy thật.** `1` = tin nhắn, SMS, email, bình luận Facebook chỉ ghi nhật ký, không gửi. |
| `ERROR_WEBHOOK_URL` | Không | Mỗi lỗi máy chủ **mới** được POST JSON tới đây (Slack/Discord qua n8n, Make...). |
| `CRM_DOMAIN` | Có (Caddy) | Tên miền Caddy xin chứng chỉ HTTPS. |
| `BACKUP_KEEP` | Không | Số bản sao lưu toàn hệ thống giữ trên VPS (mặc định 14). |

---

## 3. Tên miền + HTTPS

### Cách A — Caddy chạy trong Docker (đơn giản nhất)

Đã bật bằng `COMPOSE_PROFILES=postgres,https` ở trên. Caddy tự xin và gia hạn chứng chỉ Let's Encrypt cho `CRM_DOMAIN`, chuyển tiếp vào CRM.

```bash
docker compose up -d --build
docker compose logs -f caddy       # chờ dòng "certificate obtained successfully"
```

Mở `https://crm.congty.vn` → trang tạo tài khoản chủ doanh nghiệp (lần đầu).

### Cách B — Caddy cài thẳng trên VPS

Bỏ `https` khỏi `COMPOSE_PROFILES`, cài Caddy: `sudo apt install -y caddy`, rồi sửa `/etc/caddy/Caddyfile`:

```
crm.congty.vn {
    encode gzip
    reverse_proxy 127.0.0.1:3210
    request_body {
        max_size 200MB      # tải file ghi âm / bản sao lưu lớn
    }
}
```

```bash
sudo systemctl reload caddy
```

> Caddy tự gửi `X-Forwarded-For` nên CRM thấy đúng IP người đăng nhập (dùng cho giới hạn số lần thử và danh sách thiết bị). Đừng mở cổng 3210 ra internet: đặt `CRM_PORT=127.0.0.1:3210`.

---

## 4. Chạy lần đầu và tạo tài khoản

```bash
docker compose up -d --build
docker compose ps                  # crm, postgres (và caddy) ở trạng thái running / healthy
docker compose logs -f crm         # chờ "Khởi động DNA CRM ở cổng 3210"
```

Container tự tạo bảng (`prisma db push`), tự chạy việc nền (sao lưu hằng ngày, nhắc việc, kịch bản chăm sóc...) — không cần cron.

Sau khi đăng ký tài khoản chủ:

1. **Cài đặt → Bảo mật tài khoản** (`/w/settings/security`): bật **xác thực 2 lớp** cho tài khoản chủ, lưu 10 mã khôi phục. Nên chọn chính sách **“Bắt buộc với Chủ và Quản lý”**.
2. **Cài đặt → Kiểm tra kết nối** (`/w/settings/health`): xem mục 9.

---

## 5. Chuyển dữ liệu đang chạy SQLite sang Postgres

Nếu bạn đã dùng CRM trên máy tính (SQLite) và muốn chuyển lên VPS Postgres:

**Trên máy cũ:**

```bash
npm run backup                         # → backups/YYYY-MM-DD_HHmm.json.gz (toàn hệ thống)
# Docker: docker compose exec crm npm run backup && docker compose cp crm:/app/backups ./backups-tu-docker
```

Chép file `.json.gz` mới nhất và thư mục `uploads/` (file ghi âm) lên VPS (`scp`).

**Trên VPS** (đã chạy xong mục 4, **chưa** cần tạo tài khoản):

```bash
docker compose cp ./2026-11-05_0930.json.gz crm:/app/backups/
docker compose exec crm npm run restore -- /app/backups/2026-11-05_0930.json.gz --all --yes
docker compose cp ./uploads/. crm:/app/uploads/
docker compose restart crm
```

`--all --yes` ghi đè toàn bộ (tài khoản, mật khẩu, mọi workspace) bằng bản sao lưu, và tự sao lưu dữ liệu hiện tại trước khi ghi đè.

**Không dùng Docker** (Postgres có sẵn / Supabase):

```bash
npm run backup                          # 1. sao lưu SQLite
npm run db:postgres                     # 2. đổi provider trong prisma/schema.prisma
# 3. sửa .env: DATABASE_URL="postgresql://user:matkhau@host:5432/crm?schema=public"
npx prisma db push                      # 4. tạo bảng
npm run restore -- backups/<file>.json.gz --all --yes   # 5. chuyển dữ liệu
npm run build && npm start              # 6. chạy (cổng 3210)
```

Quay lại SQLite: `npm run db:sqlite`, đặt `DATABASE_URL="file:./dev.db"`, `npx prisma db push`.

---

## 6. Sao lưu ra ngoài máy chủ (offsite)

Bản sao lưu tự động nằm trên chính VPS (volume `crm-backups`). VPS hỏng ổ / bị xoá là mất cả hai. Hãy đẩy thêm một bản ra kho S3-compatible:

1. Tạo bucket riêng (vd. `crm-backup`) và khoá truy cập **chỉ có quyền trên bucket đó**:
   - **Cloudflare R2**: R2 → Create bucket → Manage R2 API Tokens → *Object Read & Write*, chọn bucket. Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`.
   - **AWS S3**: tạo bucket ở `ap-southeast-1`, IAM user với quyền `s3:PutObject`, `s3:ListBucket`, `s3:DeleteObject`. Endpoint `https://s3.ap-southeast-1.amazonaws.com`.
   - **Backblaze B2**: Buckets → Create → Application Keys → key cho bucket. Endpoint ghi ở trang bucket, vd. `https://s3.us-west-004.backblazeb2.com`, region `us-west-004`.
   - **MinIO** tự cài: endpoint là địa chỉ MinIO, region `us-east-1`.
2. Trong CRM: **Cài đặt → Sao lưu → Sao lưu ra ngoài máy chủ**: điền endpoint, bucket, region, Access Key ID, Secret Access Key, thư mục (vd. `dna-crm/`), số bản giữ.
3. Bấm **Thử kết nối** (CRM ghi rồi xoá một file nhỏ). Ổn thì bật công tắc và **Lưu**, rồi bấm **Đẩy bản mới nhất ngay**.

Từ đó, mỗi bản sao lưu tự động hằng ngày của workspace được đẩy lên `<bucket>/<thư mục>/<workspaceId>/YYYY-MM-DD_HHmm.json.gz`, bản cũ hơn số bản giữ bị xoá trên kho. Lỗi đẩy hiện ở trang **Kiểm tra kết nối** và Nhật ký thao tác. Khoá bí mật chỉ lưu trên máy chủ, không bao giờ hiện lại trên trình duyệt.

Khôi phục từ kho ngoài: tải file `.json.gz` về từ bucket → **Cài đặt → Sao lưu → Tải lên** → **Khôi phục**.

> Bản dump gốc của Postgres (dự phòng thêm): `docker compose exec postgres pg_dump -U crm crm | gzip > crm-$(date +%F).sql.gz`

---

## 7. Địa chỉ webhook cho các dịch vụ

`<hookKey>` là mã webhook riêng của workspace, xem ở **Nguồn khách** (`/w/sources`) — trang đó hiện sẵn địa chỉ đầy đủ để sao chép. Tất cả phải là HTTPS (`APP_URL`).

| Dịch vụ | Địa chỉ webhook | Ghi chú |
|---|---|---|
| Facebook (Lead Ads, Messenger, bình luận fanpage) | `https://crm.congty.vn/api/hooks/<hookKey>/facebook` | Meta for Developers → App → Webhooks → *Page*. Verify token = giá trị bạn đặt ở Nguồn khách → Facebook. Đăng ký các trường `leadgen`, `messages`, `feed`. |
| Instagram | `https://crm.congty.vn/api/hooks/<hookKey>/instagram` | Webhooks → *Instagram* |
| WhatsApp | `https://crm.congty.vn/api/hooks/<hookKey>/whatsapp` | WhatsApp → Configuration |
| Zalo OA | `https://crm.congty.vn/api/hooks/<hookKey>/zalo` | Zalo Developers → ứng dụng → Webhook. Tên miền phải được xác thực trên Zalo. |
| Casso (đối soát ngân hàng) | `https://crm.congty.vn/api/hooks/bank/casso/<hookKey>` | Casso → Tích hợp → Webhook V2, khoá bảo mật đặt giống ở CRM |
| SePay | `https://crm.congty.vn/api/hooks/bank/sepay/<hookKey>` | SePay → Webhooks, kiểu xác thực *API Key* |
| GHN (trạng thái vận đơn) | `https://crm.congty.vn/api/hooks/ship/ghn/<hookKey>?token=<token>` | GHN → Cài đặt → Webhook. `token` lấy ở trang cấu hình vận chuyển của CRM. GHTK / ViettelPost: thay `ghn` bằng `ghtk` / `vtp`. |
| Shopify, Haravan, Sapo, WooCommerce, Shopee, Lazada, TikTok... | xem Nguồn khách | Mỗi nguồn có hướng dẫn riêng ngay trên trang |

Mở thử địa chỉ bằng trình duyệt (GET) để chắc VPS nhận được — đa số trả `{ ok: true, hint: ... }`.

---

## 8. Cập nhật phiên bản

```bash
cd ~/dna-crm
docker compose exec crm npm run backup         # 1. luôn sao lưu trước
git pull                                       # 2. lấy mã mới
docker compose up -d --build                   # 3. build lại, container tự cập nhật bảng
docker compose logs -f crm                     # 4. chờ "Khởi động DNA CRM"
```

Nếu container dừng với thông báo thay đổi có thể mất dữ liệu: đọc kỹ, sao lưu, rồi chạy một lần
`docker compose run --rm crm node_modules/.bin/prisma db push --accept-data-loss` và `docker compose up -d`.

Không dùng Docker: `npm run backup && git pull && npm ci && npx prisma db push && npm run build && npm start`.

Sau mỗi lần cập nhật, mở **Kiểm tra kết nối** → **Kiểm tra tất cả**.

---

## 9. Danh sách kiểm tra trước khi dùng thật

Mở **Cài đặt → Kiểm tra kết nối** (`/w/settings/health`, chủ và quản lý xem được), bấm **Kiểm tra tất cả**. Mọi dòng nhóm **Hệ thống** nên ở trạng thái **Ổn**:

- [ ] **Cơ sở dữ liệu**: PostgreSQL, phản hồi nhanh
- [ ] **Cấu trúc dữ liệu**: khớp với phiên bản ứng dụng (nếu báo thiếu cột: `docker compose restart crm` hoặc `npx prisma db push`)
- [ ] **Khoá ký phiên đăng nhập**: không phải giá trị mẫu
- [ ] **APP_URL**: bắt đầu bằng `https://`
- [ ] **Sao lưu tự động**: có bản trong 24 giờ qua
- [ ] **Sao lưu ra ngoài máy chủ**: đã cấu hình, lần đẩy gần nhất thành công
- [ ] **Dung lượng ổ đĩa**: còn trống trên 2 GB
- [ ] **Việc chạy nền**: lượt gần nhất vài phút trước
- [ ] **Lỗi máy chủ 24 giờ qua**: không có lỗi mới (xem chi tiết ở mục Nhật ký lỗi cuối trang)
- [ ] Không có dòng **Chế độ chạy thử gửi tin** (nghĩa là `MESSAGING_DRY_RUN` đã tắt)
- [ ] **Kênh chat**: mỗi fanpage bấm **Thử ngay** → token còn hiệu lực; Zalo OA kết nối được
- [ ] **Gửi tin**: Email SMTP bấm **Thử ngay** → đăng nhập SMTP thành công
- [ ] **Thông báo đẩy**: đã có khoá VAPID
- [ ] **AI**: bấm **Thử ngay** → gọi Claude thành công
- [ ] **Bảo mật**: chủ đã bật xác thực 2 lớp, chính sách bắt buộc 2 lớp cho Chủ và Quản lý

Khi có vấn đề ở trạng thái **Lỗi**, chủ workspace thấy thẻ cảnh báo ở trang chủ và nhận thông báo khi có lỗi máy chủ mới.

---

## 10. Bảo mật đăng nhập

- **Khoá tạm**: sai mật khẩu (hoặc mã 2 lớp) 5 lần liên tiếp → tài khoản bị khoá 15 phút, người dùng nhận thông báo. Chủ workspace mở khoá ngay bằng **Thành viên → Đăng xuất mọi nơi** (đồng thời mở khoá) hoặc **Đặt lại mật khẩu**.
- **Giới hạn theo IP**: tối đa 30 lần đăng nhập sai / 15 phút từ một IP.
- **Phiên đăng nhập**: mỗi lần đăng nhập là một phiên, xem và đăng xuất từng thiết bị ở **Bảo mật tài khoản**. Đổi mật khẩu tự đăng xuất mọi thiết bị khác. Chủ có thể đăng xuất một thành viên khỏi mọi nơi (mất điện thoại, nghỉ việc).
- **Mất điện thoại có ứng dụng xác thực**: đăng nhập bằng một mã khôi phục, rồi vào Bảo mật tài khoản tắt và bật lại 2 lớp với điện thoại mới. Mất cả mã khôi phục: người quản trị máy chủ chạy
  `docker compose exec crm npm run reset-password -- email@cua.ban MatKhauMoi123 --tat-2fa` (đặt mật khẩu mới, tắt 2 lớp, mở khoá, đăng xuất mọi thiết bị của người đó).
- Mọi lần đăng nhập, đăng nhập sai, khoá tạm, bật/tắt 2 lớp được ghi ở **Cài đặt → Nhật ký thao tác**.

---

## 11. Xử lý sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Caddy không lấy được chứng chỉ | Kiểm tra bản ghi A trỏ đúng IP, cổng 80 và 443 mở (`ufw status`), `docker compose logs caddy` |
| Đăng nhập xong bị đá ra ngay | Đang mở bằng `http://` trong khi bản chạy thật dùng cookie `Secure`: mở bằng `https://` |
| Mọi người bị đăng xuất sau khi cập nhật | Bình thường nếu đổi `CRM_SESSION_SECRET` hoặc lần đầu lên bản có quản lý phiên (phiên cũ hết hạn sau 24 giờ) |
| Facebook báo không xác minh được webhook | `APP_URL` phải là HTTPS, verify token khớp, thử mở địa chỉ webhook bằng trình duyệt |
| Trang Kiểm tra kết nối báo "Cấu trúc dữ liệu" lỗi | Container chưa cập nhật bảng: `docker compose restart crm`, xem `docker compose logs crm` |
| Ổ đĩa đầy | Giảm `BACKUP_KEEP`, xoá bớt bản cũ trong volume `crm-backups` sau khi đã có bản ở kho ngoài, `docker system prune` |
