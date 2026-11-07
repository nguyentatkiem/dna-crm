// Đặt lại mật khẩu khi chủ workspace quên mật khẩu (mở khoá tạm và đăng xuất mọi thiết bị của người đó).
// Cách dùng: npm run reset-password -- email@cuaban.vn MatKhauMoi123
//            npm run reset-password -- email@cuaban.vn MatKhauMoi123 --tat-2fa   (mất cả điện thoại lẫn mã khôi phục)
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const off2fa = args.includes("--tat-2fa");
const [email, password] = args.filter((a) => !a.startsWith("--"));
const db = new PrismaClient();

async function main() {
  if (!email || !password || password.length < 8) {
    console.log("Cách dùng: npm run reset-password -- email@cuaban.vn MatKhauMoi (ít nhất 8 ký tự) [--tat-2fa]");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.log(`Không có tài khoản ${email}.`);
    process.exit(1);
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), failedLogins: 0, lockedUntil: null, ...(off2fa ? { totpEnabled: false, totpSecret: "", recoveryJson: "[]" } : {}) },
  });
  const r = await db.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  console.log(`Đã đặt lại mật khẩu cho ${user.name} (${user.email}), đăng xuất ${r.count} phiên${off2fa ? ", tắt xác thực 2 lớp" : ""}.`);
}

main().finally(() => db.$disconnect());
