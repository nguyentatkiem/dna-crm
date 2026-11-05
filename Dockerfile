# DNA CRM — ảnh Docker chạy production.
# Dựng:   docker compose up -d --build        (xem docs/VAN-HANH.md)
# Postgres: docker compose build --build-arg DB_PROVIDER=postgresql
#
# Ghi chú: không dùng output "standalone" của Next.js vì trong container còn cần
# Prisma CLI (tạo/cập nhật bảng khi khởi động) và tsx (npm run backup / restore / demo).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma cần openssl; ca-certificates để gọi API ngoài (Claude, Zalo, Facebook...).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- 1. Cài thư viện (tận dụng cache khi chỉ sửa code) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- 2. Build ----
FROM base AS build
ARG DB_PROVIDER=sqlite
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Đổi provider trong schema theo DB_PROVIDER (sqlite | postgresql), sinh Prisma Client rồi build Next.js.
RUN npx tsx scripts/use-db.ts "$DB_PROVIDER" \
  && npx prisma generate \
  && SESSION_SECRET=build-only-secret-khong-dung-khi-chay-0123456789 CRM_JOBS=off npm run build \
  && rm -rf .next/cache

# ---- 3. Chạy ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3210 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Ho_Chi_Minh \
    DATABASE_URL=file:/app/data/crm.db \
    BACKUP_DIR=/app/backups
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.mjs /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/docs ./docs
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/crm-entrypoint
# Thư mục dữ liệu: SQLite + khoá phiên (/app/data), ghi âm (/app/uploads), sao lưu (/app/backups).
RUN chmod +x /usr/local/bin/crm-entrypoint \
  && rm -f prisma/*.db prisma/*.db-journal \
  && mkdir -p /app/data /app/uploads /app/backups \
  && chown -R node:node /app/data /app/uploads /app/backups
USER node
VOLUME ["/app/data", "/app/uploads", "/app/backups"]
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3210/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["crm-entrypoint"]
CMD ["node_modules/.bin/next", "start", "-p", "3210", "-H", "0.0.0.0"]
