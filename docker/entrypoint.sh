#!/bin/sh
# Khởi động container DNA CRM: tạo khoá phiên nếu thiếu, cập nhật bảng database, rồi chạy app.
set -e
cd /app
mkdir -p /app/data /app/uploads /app/backups

# 1. SESSION_SECRET: không đặt thì tự sinh một lần và lưu trong volume dữ liệu (đổi máy vẫn giữ phiên đăng nhập).
if [ -z "$SESSION_SECRET" ]; then
  if [ ! -s /app/data/.secret ]; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > /app/data/.secret
    chmod 600 /app/data/.secret
    echo "[crm] Đã tạo SESSION_SECRET mới, lưu ở /app/data/.secret"
  fi
  SESSION_SECRET="$(cat /app/data/.secret)"
  export SESSION_SECRET
fi

# 2. Kiểm tra ảnh build đúng loại database.
PROVIDER="$(sed -n '/datasource/,/}/s/^[[:space:]]*provider[[:space:]]*=[[:space:]]*"\([a-z]*\)".*/\1/p' prisma/schema.prisma)"
case "$DATABASE_URL" in
  postgres*)
    if [ "$PROVIDER" != "postgresql" ]; then
      echo "[crm] LỖI: DATABASE_URL là Postgres nhưng ảnh được build cho $PROVIDER."
      echo "[crm] Build lại: DB_PROVIDER=postgresql docker compose up -d --build"
      exit 1
    fi ;;
  file:*)
    if [ "$PROVIDER" != "sqlite" ]; then
      echo "[crm] LỖI: DATABASE_URL là SQLite nhưng ảnh được build cho $PROVIDER. Build lại với DB_PROVIDER=sqlite."
      exit 1
    fi ;;
esac

# 3. Tạo / cập nhật bảng. Không dùng --accept-data-loss: thay đổi làm mất dữ liệu sẽ dừng lại để bạn sao lưu trước.
echo "[crm] Cập nhật cấu trúc database ($PROVIDER)..."
n=0
until node_modules/.bin/prisma db push --skip-generate; do
  n=$((n + 1))
  if [ "$n" -ge 10 ]; then
    echo "[crm] Không kết nối / cập nhật được database. Xem lỗi phía trên."
    exit 1
  fi
  echo "[crm] Database chưa sẵn sàng, thử lại sau 3 giây ($n/10)..."
  sleep 3
done

# 4. Tuỳ chọn: tạo tài khoản demo ở lần chạy đầu (CRM_DEMO=1).
if [ "$CRM_DEMO" = "1" ] && [ ! -f /app/data/.demo-created ]; then
  node_modules/.bin/tsx scripts/demo.ts "${CRM_DEMO_INDUSTRY:-spa}" && touch /app/data/.demo-created
fi

echo "[crm] Khởi động DNA CRM ở cổng ${PORT:-3210}"
exec "$@"
