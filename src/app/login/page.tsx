import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if ((await db.user.count()) === 0) redirect("/register");
  return (
    <AuthShell title="Chào mừng trở lại" subtitle="Đăng nhập để tiếp tục làm việc với CRM của bạn.">
      <LoginForm note="Nhân viên mới: dùng link mời do chủ workspace gửi. Quên mật khẩu: chủ workspace đặt lại trong Cài đặt → Thành viên." />
    </AuthShell>
  );
}
