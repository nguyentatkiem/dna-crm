// Chuẩn bị lần đầu: tạo .env từ .env.example và sinh SESSION_SECRET ngẫu nhiên nếu còn giá trị mẫu.
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const PLACEHOLDER = "doi-chuoi-nay-thanh-chuoi-bi-mat-dai-it-nhat-32-ky-tu";

if (!fs.existsSync(".env")) {
  fs.copyFileSync(".env.example", ".env");
  console.log("Đã tạo file .env từ .env.example");
}
const env = fs.readFileSync(".env", "utf8");
if (env.includes(PLACEHOLDER) || !/SESSION_SECRET=".+"/.test(env)) {
  const secret = randomBytes(32).toString("base64url");
  const next = /SESSION_SECRET=/.test(env) ? env.replace(/SESSION_SECRET=.*/, `SESSION_SECRET="${secret}"`) : `${env}\nSESSION_SECRET="${secret}"\n`;
  fs.writeFileSync(".env", next);
  console.log("Đã sinh SESSION_SECRET ngẫu nhiên trong .env");
}
