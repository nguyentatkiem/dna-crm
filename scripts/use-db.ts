// Đổi loại cơ sở dữ liệu trong prisma/schema.prisma: SQLite (mặc định, một file) ↔ Postgres (Supabase, Neon, VPS...).
// Cách dùng:
//   npm run db:postgres     → provider = "postgresql"
//   npm run db:sqlite       → provider = "sqlite"
//   npx tsx scripts/use-db.ts postgresql --schema đường/dẫn/schema.prisma   (thử trên bản sao)
// Script chỉ sửa đúng dòng provider trong khối datasource, không đụng chỗ khác.
import fs from "node:fs";
import path from "node:path";

const arg = (process.argv[2] ?? "").toLowerCase();
const target = arg === "postgres" || arg === "postgresql" || arg === "pg" ? "postgresql" : arg === "sqlite" ? "sqlite" : "";
if (!target) {
  console.log("Cách dùng: npx tsx scripts/use-db.ts postgres|sqlite [--schema prisma/schema.prisma]");
  process.exit(1);
}
const i = process.argv.indexOf("--schema");
const file = path.resolve(i > 0 ? process.argv[i + 1] : "prisma/schema.prisma");
const src = fs.readFileSync(file, "utf8");

const block = src.match(/datasource\s+\w+\s*\{[^}]*\}/);
if (!block) {
  console.error(`Không tìm thấy khối datasource trong ${file}`);
  process.exit(1);
}
const cur = block[0].match(/^\s*provider\s*=\s*"([^"]+)"/m)?.[1];
if (!cur) {
  console.error("Không tìm thấy dòng provider trong khối datasource");
  process.exit(1);
}
if (cur === target) console.log(`Schema đã dùng ${target}, không cần đổi.`);
else {
  const nextBlock = block[0].replace(/^(\s*provider\s*=\s*)"[^"]+"/m, `$1"${target}"`);
  fs.writeFileSync(file, src.replace(block[0], nextBlock));
  console.log(`✓ Đã đổi provider: ${cur} → ${target} (${path.relative(process.cwd(), file) || file})`);
}

if (target === "postgresql") {
  console.log(`
Bước tiếp theo:
  1. Đặt DATABASE_URL trong .env, ví dụ:
       DATABASE_URL="postgresql://crm:matkhau@localhost:5432/crm?schema=public"
     Supabase: Project Settings → Database → Connection string (URI). Dùng cổng 5432 (session)
     cho prisma db push; nếu dùng pooler 6543 thì thêm ?pgbouncer=true.
  2. Tạo bảng:            npx prisma db push
  3. (Tuỳ chọn) chuyển dữ liệu cũ: chạy "npm run backup" TRƯỚC khi đổi, rồi sau khi db push:
       npm run restore -- backups/<file>.json.gz --all --yes
  4. Khởi động lại:        npm run dev  (hoặc npm run build && npm start)
Lưu ý: tìm kiếm chữ trên Postgres phân biệt hoa thường — xem docs/VAN-HANH.md mục "Chuyển sang Postgres".`);
} else {
  console.log(`
Bước tiếp theo:
  1. Đặt DATABASE_URL="file:./dev.db" trong .env
  2. npx prisma db push
  3. Khởi động lại: npm run dev`);
}
