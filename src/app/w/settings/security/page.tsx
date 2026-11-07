import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { SecurityPanel } from "./SecurityPanel";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const { user } = await requireApp();
  const sp = await searchParams;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <nav className="mb-2 text-[13px] text-ink-2">
        <Link href="/w/settings" className="hover:text-primary hover:underline">
          Cài đặt
        </Link>{" "}
        / Bảo mật tài khoản
      </nav>
      <h1 className="text-[26px] font-semibold">Bảo mật tài khoản</h1>
      <p className="mt-1 max-w-2xl text-ink-2">
        Xác thực 2 lớp, các thiết bị đang đăng nhập và mật khẩu của <b className="text-ink">{user.email}</b>.
      </p>
      {sp.required === "1" && !user.totpEnabled && (
        <p role="alert" className="mt-4 max-w-3xl rounded-lg bg-warning-soft px-4 py-3 text-[14px] text-ink">
          <b>Chủ workspace yêu cầu bật xác thực 2 lớp</b> cho vai trò của bạn. Hãy bật ở mục bên dưới để tiếp tục dùng CRM.
        </p>
      )}
      <SecurityPanel email={user.email} />
    </div>
  );
}
