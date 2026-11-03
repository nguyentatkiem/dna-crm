import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage() {
  if ((await db.user.count()) === 0) redirect("/register");
  return (
    <AuthShell title="Chào mừng trở lại" subtitle="Đăng nhập để tiếp tục làm việc với CRM của bạn.">
      <AuthForm
        endpoint="/api/auth/login"
        submit="Đăng nhập"
        fields={[
          { name: "email", label: "Email", type: "email", placeholder: "ban@doanhnghiep.vn" },
          { name: "password", label: "Mật khẩu", type: "password" },
        ]}
        note="Nhân viên mới: dùng link mời do chủ workspace gửi. Quên mật khẩu: chủ workspace đặt lại trong Cài đặt → Thành viên."
      />
    </AuthShell>
  );
}
