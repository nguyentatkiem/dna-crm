# Vận hành DNA CRM

Tài liệu cho học viên tự triển khai: chạy bằng Docker, bật chép lời ghi âm, mở đường hầm nhận webhook, chuyển sang Postgres/Supabase, sao lưu – khôi phục, cập nhật phiên bản và chạy kiểm thử.

> Lệnh nào bắt đầu bằng `docker compose` thì chạy trong thư mục dự án (nơi có file `docker-compose.yml`).

---

## 1. Chạy bằng Docker (3 lệnh)

Cần cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) hoặc Docker Engine (Linux, VPS).

```bash
git clone <địa-chỉ-repo> dna-crm && cd dna-crm
echo 'CRM_DEMO=1' >> .env          # tuỳ chọn: tạo sẵn tài khoản demo + dữ liệu mẫu
docker compose up -d --build
```

Mở <http://localhost:3210>. Có `CRM_DEMO=1` thì đăng nhập `demo@dnacrm.local` / `demo12345`, không thì CRM mở trang tạo tài khoản chủ doanh nghiệp ở lần chạy đầu.

Lần đầu build mất 3–5 phút. Những gì container tự làm khi khởi động:

| Việc | Chi tiết |
|---|---|
| Khoá phiên đăng nhập | Không đặt `CRM_SESSION_SECRET` thì tự sinh một lần, lưu ở `/app/data/.secret` (trong volume, không mất khi build lại). |
| Database | SQLite tại `/app/data/crm.db`. Tự tạo / cập nhật bảng bằng `prisma db push`. Nếu thay đổi có thể làm mất dữ liệu, container dừng lại và báo lỗi để bạn sao lưu trước. |
| Việc nền | Kịch bản chăm sóc, nhắc việc, dự báo chốt, kéo chi phí quảng cáo, **sao lưu hằng ngày** — chạy ngay trong container, không cần cron. |

Dữ liệu nằm trong 3 volume Docker, xoá container hay build lại vẫn còn:

| Volume | Trong container | Chứa |
|---|---|---|
| `crm-data` | `/app/data` | database SQLite, khoá phiên |
| `crm-uploads` | `/app/uploads` | file ghi âm cuộc gọi |
| `crm-backups` | `/app/backups` | bản sao lưu |

Lệnh hay dùng:

```bash
docker compose logs -f crm          # xem nhật ký (Ctrl+C để thoát)
docker compose restart crm          # khởi động lại
docker compose down                 # tắt (dữ liệu vẫn giữ)
docker compose exec crm npm run demo -- bds   # tạo lại workspace demo ngành bất động sản
docker compose exec crm npm run reset-password -- email@cua.ban MatKhauMoi123
```

Các biến tuỳ chỉnh (đặt trong file `.env` cạnh `docker-compose.yml`):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `CRM_PORT` | `3210` | Cổng mở ra ngoài máy |
| `CRM_SESSION_SECRET` | tự sinh | Khoá ký phiên đăng nhập (≥ 32 ký tự) |
| `ANTHROPIC_API_KEY` | trống | Có key thì AI Agent dùng Claude, không có vẫn chạy bằng luật |
| `CRM_DEMO` | `0` | `1` = tạo tài khoản demo ở lần chạy đầu |
| `CRM_TRANSCRIBE_URL` | trống | Máy chủ chép lời (xem mục 2) |
| `BACKUP_KEEP` | `14` | Số bản sao lưu toàn hệ thống giữ lại |
| `DB_PROVIDER`, `CRM_DATABASE_URL` | SQLite | Dùng Postgres (xem mục 4) |

> Các biến trong Docker có tiền tố `CRM_` để không lẫn với `DATABASE_URL`, `SESSION_SECRET` dùng khi chạy `npm run dev` trên máy.

**Đưa lên VPS có tên miền:** chạy như trên, rồi đặt Nginx / Caddy làm reverse proxy HTTPS trỏ về `localhost:3210`. Ví dụ Caddy (tự lấy chứng chỉ SSL):

```
crm.tencuaban.vn {
  reverse_proxy localhost:3210
}
```

---

## 2. Bật chép lời ghi âm (speaches + faster-whisper)

Chép lời tiếng Việt chạy ngay trên máy bạn, không gửi ghi âm ra ngoài, không tốn phí.

1. Thêm vào `.env`:

   ```
   CRM_TRANSCRIBE_URL=http://speaches:8000
   # Máy yếu / không có GPU: dùng model nhỏ hơn cho nhanh (độ chính xác thấp hơn large-v3)
   # CRM_TRANSCRIBE_MODEL=Systran/faster-whisper-medium
   ```

2. Chạy kèm profile `stt`:

   ```bash
   docker compose --profile stt up -d
   ```

3. Tải model lần đầu (khoảng 1,5–3 GB, chỉ tải một lần, lưu ở volume `stt-models`):

   ```bash
   curl -X POST http://localhost:8000/v1/models/Systran/faster-whisper-large-v3
   ```

4. Vào **Telesales** → mở một cuộc gọi có ghi âm → **Chép lời**. Trên CPU, 1 phút ghi âm mất khoảng 1–3 phút xử lý với large-v3.

Muốn luôn bật chép lời mà không gõ `--profile stt` mỗi lần: thêm `COMPOSE_PROFILES=stt` vào `.env` (nhiều profile thì ngăn cách bằng dấu phẩy, ví dụ `COMPOSE_PROFILES=stt,tunnel`).

Không dùng Docker? Chạy speaches riêng rồi đặt `TRANSCRIBE_BASE_URL=http://localhost:8000` trong `.env`. Hoặc dùng FPT.AI: đặt `FPT_AI_API_KEY`.

---

## 3. Mở đường hầm nhận webhook (Facebook, Zalo, Shopify...)

Các nền tảng chỉ gửi webhook tới địa chỉ HTTPS công khai. Khi CRM chạy trên máy cá nhân, dùng đường hầm Cloudflare miễn phí:

```bash
docker compose --profile tunnel up -d
docker compose logs cloudflared | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```

Được địa chỉ dạng `https://abc-xyz.trycloudflare.com`. Vào **Nguồn khách** trong CRM, mỗi nguồn có URL webhook; thay phần `http://localhost:3210` bằng địa chỉ trên rồi dán vào trang cấu hình của Facebook / Zalo / Shopify...

Lưu ý:

- Địa chỉ `trycloudflare.com` **đổi mỗi lần khởi động lại** đường hầm. Dùng để thử. Chạy thật thì đưa CRM lên VPS có tên miền, hoặc tạo *Named Tunnel* trong Cloudflare Zero Trust và thay dòng `command` của service `cloudflared` thành `tunnel --no-autoupdate run --token <token-của-bạn>`.
- Không dùng Docker: cài `cloudflared` rồi chạy `cloudflared tunnel --url http://localhost:3210`.

---

## 4. Chuyển sang Postgres / Supabase

SQLite đủ cho một cửa hàng, vài nhân viên. Nên chuyển Postgres khi: nhiều người cùng sửa dữ liệu, hơn khoảng 50.000 mục, hoặc muốn dùng database có sẵn (Supabase, Neon, VPS).

**Trước khi chuyển, luôn sao lưu toàn hệ thống** (`npm run backup` hoặc `docker compose exec crm npm run backup`). Bản sao lưu JSON khôi phục được sang Postgres.

### 4.1. Postgres chạy kèm trong Docker

1. Chép các dòng trong `docker/postgres.env.example` vào `.env` và đổi mật khẩu:

   ```
   COMPOSE_PROFILES=postgres
   DB_PROVIDER=postgresql
   POSTGRES_PASSWORD=mat-khau-manh
   CRM_DATABASE_URL=postgresql://crm:mat-khau-manh@postgres:5432/crm?schema=public
   ```

2. Build lại (ảnh được build riêng cho Postgres):

   ```bash
   docker compose up -d --build
   ```

3. Chuyển dữ liệu cũ (nếu có): chép bản sao lưu vào container rồi khôi phục toàn hệ thống:

   ```bash
   docker compose cp ./2026-11-05_0930.json.gz crm:/app/backups/
   docker compose exec crm npm run restore -- /app/backups/2026-11-05_0930.json.gz --all --yes
   ```

### 4.2. Supabase (hoặc Postgres có sẵn), không dùng Docker

```bash
npm run backup                  # 1. sao lưu dữ liệu SQLite hiện tại
npm run db:postgres             # 2. đổi provider trong prisma/schema.prisma
# 3. Sửa .env: DATABASE_URL="postgresql://postgres.[ref]:[mật-khẩu]@aws-0-[vùng].pooler.supabase.com:5432/postgres"
#    (Supabase → Project Settings → Database → Connection string → URI, cổng 5432 / session mode)
npx prisma db push              # 4. tạo bảng
npm run restore -- backups/<file>.json.gz --all --yes   # 5. (tuỳ chọn) chuyển dữ liệu cũ
npm run dev                     # 6. hoặc npm run build && npm start
```

Muốn quay lại SQLite: `npm run db:sqlite`, đặt `DATABASE_URL="file:./dev.db"`, `npx prisma db push`.

Với Docker + Supabase: đặt `DB_PROVIDER=postgresql` và `CRM_DATABASE_URL=<chuỗi Supabase>` trong `.env` (không cần `COMPOSE_PROFILES=postgres`), rồi `docker compose up -d --build`.

### 4.3. Khác biệt SQLite ↔ Postgres cần biết

Đã rà toàn bộ mã nguồn. Các cột `*Json` lưu dạng chuỗi nên chạy được cả hai. Những điểm khác:

| Chỗ | Trên SQLite | Trên Postgres | Ảnh hưởng |
|---|---|---|---|
| Tìm theo chữ bằng `contains`: `src/lib/inbox.ts` (tìm hội thoại), `src/lib/docs.ts` (tìm tài liệu), `src/app/api/inbox/[id]/link/route.ts` (tìm khách để gắn), `src/lib/marketing/sequences.ts` (tìm lead theo tên chiến dịch) | Không phân biệt hoa thường với chữ không dấu (`LIKE`) | **Phân biệt hoa thường** | Gõ "lan" không ra "Lan". Cách sửa: thêm `mode: "insensitive"` khi chạy Postgres — nhưng SQLite không nhận `mode`, nên phải thêm có điều kiện, ví dụ `{ contains: q, ...(isPg ? { mode: "insensitive" } : {}) }` |
| Tìm theo `contains` với số điện thoại, mã đơn, ngày, khoá JSON (`ingest.ts`, `api/search`, `automation.ts`, `marketing/ads.ts`) | Chạy | Chạy như nhau | Không ảnh hưởng (chỉ có số / ký tự cố định) |
| Sắp xếp theo chữ (`orderBy` tên người dùng ở Nhật ký) | So từng byte | Theo bảng chữ của database (collation) | Thứ tự tên tiếng Việt có thể khác, không lỗi |
| `$executeRaw` cập nhật `winProb` (`src/lib/predict.ts`) | Chạy | Chạy (tên bảng / cột có ngoặc kép, đúng chữ hoa) | Không ảnh hưởng |
| `groupBy` (`w/layout.tsx`, `automation.ts`, `sequences.ts`, nhật ký) | Chạy | Chạy | Không ảnh hưởng |
| Sao lưu file `.db` bằng `VACUUM INTO` (`src/lib/backup.ts`) | Có | Tự bỏ qua, chỉ có bản JSON | Muốn bản dump gốc của Postgres: `docker compose exec postgres pg_dump -U crm crm > crm.sql` |
| Ghi đồng thời | Một người ghi tại một thời điểm; khôi phục lớn sẽ khoá ghi vài giây | Nhiều người ghi cùng lúc | Postgres chịu tải tốt hơn |

---

## 5. Sao lưu và khôi phục

### 5.1. Trên giao diện (chủ workspace)

**Cài đặt → Sao lưu** (`/w/settings/backup`):

- **Sao lưu ngay**: tạo file `YYYY-MM-DD_HHmm.json.gz` chứa toàn bộ dữ liệu của workspace (khách, giao dịch, cuộc gọi, hội thoại, kịch bản chăm sóc, chi phí quảng cáo, dashboard, tài liệu, nhật ký, cấu hình...).
- **Tải về**: lưu file về máy / Google Drive. Nên làm mỗi tuần.
- **Tải lên**: đưa một file sao lưu (từ máy khác) lên để khôi phục.
- **Khôi phục**: xác nhận 2 bước, phải gõ đúng tên workspace. CRM **tự sao lưu dữ liệu hiện tại ngay trước khi khôi phục**, nên luôn quay lại được. Tài khoản và thành viên không bị thay đổi.
- **Sao lưu tự động**: bật mặc định, mỗi ngày một bản, giữ 14 bản gần nhất (đổi được).

Mọi thao tác (sao lưu, tải về, tải lên, khôi phục, đổi cài đặt) được ghi vào Nhật ký thao tác.

> File ghi âm cuộc gọi **không** nằm trong bản sao lưu (có thể rất nặng). Khi chuyển máy, chép cả thư mục `uploads/` (Docker: volume `crm-uploads`).

### 5.2. Bằng dòng lệnh (toàn hệ thống)

```bash
npm run backup                         # toàn hệ thống → backups/YYYY-MM-DD_HHmm.json.gz (+ .db khi dùng SQLite)
npm run backup -- <workspaceId>        # một workspace → backups/<workspaceId>/...
npm run backup -- --list               # xem id các workspace và các bản đã có

npm run restore -- backups/2026-11-05_0930.json.gz <workspaceId>       # khôi phục một workspace
npm run restore -- backups/2026-11-05_0930.json.gz --all --yes         # GHI ĐÈ toàn hệ thống
```

Khi CRM đang chạy, mỗi ngày còn có một bản toàn hệ thống trong `backups/` (tắt bằng `BACKUP_SYSTEM=0`, số bản giữ: `BACKUP_KEEP`). Với SQLite có thêm file `.db` — đây là bản sao nguyên vẹn của database, cách khôi phục nhanh nhất là tắt CRM rồi chép đè file này thành `prisma/dev.db` (Docker: `/app/data/crm.db`).

### 5.3. Trong Docker

```bash
docker compose exec crm npm run backup                    # sao lưu toàn hệ thống
docker compose cp crm:/app/backups ./backups-tu-docker    # chép các bản sao lưu ra máy
docker compose cp ./file.json.gz crm:/app/backups/        # đưa file vào container
docker compose exec crm npm run restore -- /app/backups/file.json.gz --all --yes
```

### 5.4. Chuyển sang máy / VPS khác

1. Máy cũ: `npm run backup` (hoặc nút **Tải về** trên giao diện), chép thêm thư mục `uploads/`.
2. Máy mới: cài và chạy CRM (mục 1), chép `uploads/` vào.
3. Khôi phục toàn hệ thống bằng `npm run restore -- <file> --all --yes` (giữ nguyên tài khoản, mật khẩu, mọi workspace). Hoặc tạo tài khoản mới rồi **Tải lên** + **Khôi phục** trên giao diện để chỉ chuyển một workspace.

---

## 6. Cập nhật phiên bản

**Luôn sao lưu trước khi cập nhật.**

Docker:

```bash
docker compose exec crm npm run backup
git pull
docker compose up -d --build
docker compose logs -f crm      # chờ dòng "Khởi động DNA CRM"
```

Không dùng Docker:

```bash
npm run backup
git pull
npm ci
npx prisma db push
npm run build && npm start      # hoặc npm run dev khi đang thử
```

Nếu `prisma db push` báo thay đổi có thể mất dữ liệu: dừng lại, đọc kỹ thông báo, sao lưu, rồi mới chạy `npx prisma db push --accept-data-loss`.

---

## 7. Kiểm thử

```bash
npm test             # kiểm thử tự động (vitest): chuẩn hoá SĐT, đọc webhook + kiểm chữ ký các nguồn,
                     # chấm điểm cuộc gọi bằng luật, công thức, dự báo, Excel, sao lưu → khôi phục
npm run test:watch   # chạy lại khi sửa code
npm run typecheck    # kiểm tra kiểu TypeScript
npm run smoke        # kiểm tra khói: gọi các trang + API chính của server đang chạy, in bảng ✓/✗
```

`npm run smoke` cần server đang chạy và tài khoản demo (`npm run demo`). Kiểm tra server khác:

```bash
BASE_URL=https://crm.tencuaban.vn SMOKE_EMAIL=ban@email.vn SMOKE_PASSWORD=... npm run smoke
```

Kiểm thử sao lưu tạo một database SQLite tạm trong thư mục tạm của máy, không đụng dữ liệu thật.

---

## 8. Nhập / xuất Excel

- **Xuất**: nút **Xuất Excel** trên mỗi bảng tải file `.xlsx` thật: tiêu đề in đậm, cố định hàng đầu, có bộ lọc, cột tiền định dạng `₫`, cột ngày `dd/mm/yyyy`, cột công thức xuất giá trị đã tính. Chỉ xuất những mục bạn được xem. Thêm `&format=csv` vào đường dẫn để lấy CSV, `?object=all` để xuất mọi bảng (mỗi bảng một sheet). Cần quyền Chủ hoặc Quản lý.
- **Nhập**: nút **Nhập** → chọn `.xlsx` / `.csv` (hoặc dán từ Excel / Google Sheets) → xem trước 10 dòng, ghép cột → nhập. Khách trùng số điện thoại (0912…, +84912…, 84912… coi là một) được **gộp**: chỉ điền thêm trường đang trống, không ghi đè. Báo cáo số mục tạo mới / gộp / bỏ qua. Bấm **Tải file mẫu .xlsx** để có file đúng cột kèm hướng dẫn.

---

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `docker compose up` báo cổng 3210 đã dùng | Đặt `CRM_PORT=3300` trong `.env` |
| Container dừng với "DATABASE_URL là Postgres nhưng ảnh được build cho sqlite" | Đặt `DB_PROVIDER=postgresql` trong `.env` rồi `docker compose up -d --build` |
| "Database chưa sẵn sàng" lặp lại | Kiểm tra `CRM_DATABASE_URL`, mật khẩu, Postgres đã chạy (`docker compose ps`) |
| Đăng nhập xong bị đá ra | Đổi `CRM_SESSION_SECRET` sẽ đăng xuất mọi người — bình thường. Không đặt thì khoá nằm ở `/app/data/.secret` |
| Chép lời báo lỗi kết nối | Đã chạy `--profile stt` chưa, `CRM_TRANSCRIBE_URL=http://speaches:8000`, đã tải model (mục 2.3) |
| Webhook không về | Địa chỉ trycloudflare đổi sau khi khởi động lại — lấy địa chỉ mới, dán lại ở nền tảng |
| Quên mật khẩu | `npm run reset-password -- email MatKhauMoi` (Docker: thêm `docker compose exec crm` phía trước) |
