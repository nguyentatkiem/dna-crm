import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const firstRun = (await db.user.count()) === 0;
  const inv = invite ? await db.invite.findUnique({ where: { token: invite }, include: { workspace: true } }) : null;
  const validInvite = inv && !inv.usedAt && inv.expiresAt > new Date();
  if (!firstRun && !validInvite) redirect("/login");

  return (
    <AuthShell
      title={validInvite ? `Tham gia ${inv.workspace.name}` : "Tạo tài khoản chủ doanh nghiệp"}
      subtitle={validInvite ? "Bạn được mời vào CRM của đội. Tạo tài khoản để bắt đầu." : "Đây là lần chạy đầu tiên. Tài khoản này sẽ là chủ workspace, sau đó bạn điền DNA doanh nghiệp."}
    >
      <AuthForm
        endpoint="/api/auth/register"
        submit={validInvite ? "Tham gia" : "Tạo tài khoản và điền DNA"}
        hidden={validInvite ? { invite: inv.token } : undefined}
        fields={[
          { name: "name", label: "Họ tên", placeholder: "Nguyễn Văn A" },
          { name: "email", label: "Email", type: "email", placeholder: "ban@doanhnghiep.vn" },
          { name: "password", label: "Mật khẩu", type: "password", placeholder: "Ít nhất 8 ký tự" },
        ]}
        footer={{ text: "Đã có tài khoản?", href: "/login", link: "Đăng nhập" }}
      />
    </AuthShell>
  );
}
