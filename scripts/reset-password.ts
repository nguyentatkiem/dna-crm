// Đặt lại mật khẩu khi chủ workspace quên mật khẩu.
// Cách dùng: npm run reset-password -- email@cuaban.vn MatKhauMoi123
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const [email, password] = process.argv.slice(2);
const db = new PrismaClient();

async function main() {
  if (!email || !password || password.length < 8) {
    console.log("Cách dùng: npm run reset-password -- email@cuaban.vn MatKhauMoi (ít nhất 8 ký tự)");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.log(`Không có tài khoản ${email}.`);
    process.exit(1);
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`Đã đặt lại mật khẩu cho ${user.name} (${user.email}).`);
}

main().finally(() => db.$disconnect());
