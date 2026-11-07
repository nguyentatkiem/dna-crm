// Máy chủ RIÊNG cho kiểm thử E2E (Playwright gọi qua webServer.command).
// - Sao chép mã nguồn sang e2e/.data/app (thư mục .next riêng: không đụng .next của server dev :3210).
// - Tạo database SQLite MỚI e2e/.data/e2e.db (không chép gì từ prisma/dev.db), prisma db push, npm run demo, thêm tài khoản nhân viên.
// - next dev --turbopack -p 3333 (mặc định), hoặc next build + next start nếu E2E_BUILD=1.
// Không đọc .env của dự án: mọi biến môi trường được đặt tường minh bên dưới.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { E2E_ENV, E2E_PORT, DATA_DIR, APP_DIR, ROOT } from "./env";

const here = path.join(ROOT, "e2e");
const t0 = Date.now();
const log = (m: string) => console.log(`[e2e-server +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

fs.mkdirSync(DATA_DIR, { recursive: true });

// 1) Bản sao mã nguồn (rsync chỉ chép file đổi; giữ .next/cache để build lần sau nhanh hơn).
const COPY = ["src", "public", "prisma/schema.prisma", "scripts", "next.config.mjs", "tsconfig.json", "tailwind.config.ts", "postcss.config.mjs", "next-env.d.ts", "package.json"];
fs.mkdirSync(path.join(APP_DIR, "prisma"), { recursive: true });
for (const item of COPY) {
  const src = path.join(ROOT, item);
  const dst = path.join(APP_DIR, item);
  if (fs.statSync(src).isDirectory()) execFileSync("rsync", ["-a", "--delete", `${src}/`, `${dst}/`]);
  else fs.copyFileSync(src, dst);
}
// node_modules: bản sao APFS (cp -c, gần như tức thì, không tốn dung lượng). Symlink làm Turbopack/webpack
// coi package nằm ngoài thư mục dự án. Chép lại khi package-lock.json đổi.
const nm = path.join(APP_DIR, "node_modules");
const lockSrc = fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8");
const lockDst = path.join(APP_DIR, "package-lock.json");
if (!fs.existsSync(nm) || !fs.existsSync(lockDst) || fs.readFileSync(lockDst, "utf8") !== lockSrc) {
  fs.rmSync(nm, { recursive: true, force: true });
  try {
    execFileSync("cp", ["-cR", path.join(ROOT, "node_modules"), nm]);
  } catch {
    execFileSync("cp", ["-R", path.join(ROOT, "node_modules"), nm]);
  }
  fs.writeFileSync(lockDst, lockSrc);
}
log("đã chép mã nguồn sang " + path.relative(ROOT, APP_DIR));

// 2) Database mới tinh.
const dbFile = path.join(DATA_DIR, "e2e.db");
for (const f of [dbFile, dbFile + "-journal", dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
for (const d of ["uploads", "backups"]) fs.rmSync(path.join(APP_DIR, d), { recursive: true, force: true });
const env = { ...process.env, ...E2E_ENV };
const bin = (n: string) => path.join(APP_DIR, "node_modules", ".bin", n);
const run = (cmd: string, args: string[], extra: Record<string, string> = {}) => execFileSync(cmd, args, { cwd: APP_DIR, env: { ...env, ...extra }, stdio: "inherit" });

// Prisma client sinh vào node_modules của bản sao (không đụng node_modules của server dev).
run(bin("prisma"), ["db", "push", "--accept-data-loss", "--schema", "prisma/schema.prisma"]);
log("prisma db push xong");
run(bin("tsx"), ["scripts/demo.ts", process.env.E2E_INDUSTRY || "spa"]);
log("đã tạo dữ liệu demo");
run(bin("tsx"), [path.join(here, "seed-users.ts")]);
log("đã tạo tài khoản kiểm thử");

// 3) Chạy app. Mặc định next dev --turbopack (thư mục .next riêng trong bản sao).
// E2E_BUILD=1: next build + next start (ổn định hơn) — hiện build hỏng, xem README phần E2E.
const dev = process.env.E2E_BUILD !== "1";
if (!dev) {
  const b = Date.now();
  run(bin("next"), ["build"], { NODE_ENV: "production" });
  log(`next build xong sau ${((Date.now() - b) / 1000).toFixed(0)}s`);
}
const args = dev ? ["dev", "--turbopack", "-p", String(E2E_PORT)] : ["start", "-p", String(E2E_PORT)];
const child = spawn(bin("next"), args, { cwd: APP_DIR, env: { ...env, NODE_ENV: dev ? "development" : "production" }, stdio: "inherit" });
const stop = () => child.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => process.exit(code ?? 0));
