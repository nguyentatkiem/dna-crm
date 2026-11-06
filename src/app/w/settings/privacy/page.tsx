import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { allow, getAccess } from "@/lib/permissions";
import { getPrivacy, maskEmail, maskPhone } from "@/lib/privacy";
import { Icon } from "@/components/Icon";
import { PrivacyPanel } from "./PrivacyPanel";

export const dynamic = "force-dynamic";

const SAMPLE = { name: "Nguyễn Thị An", phone: "0912345678", email: "an.nguyen@email.vn" };

export default async function PrivacyPage() {
  const { user, workspace } = await requireApp();
  if (!allow(await getAccess(user.id, workspace.id), "settings_manage")) {
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <div className="card mx-auto mt-10 grid max-w-md place-items-center gap-3 p-8 text-center">
          <Icon name="lock" size={28} className="text-ink-2" />
          <h1 className="text-[18px] font-semibold">Chỉ chủ workspace xem được trang này</h1>
          <p className="text-[14px] text-ink-2">Cài đặt bảo mật dữ liệu quyết định ai thấy số điện thoại, email và được xuất bao nhiêu dữ liệu.</p>
          <Link href="/w/settings" className="btn-outline">
            Về Cài đặt
          </Link>
        </div>
      </div>
    );
  }
  const prefs = await getPrivacy(workspace.id);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <nav className="mb-2 text-[13px] text-ink-2">
        <Link href="/w/settings" className="hover:text-primary hover:underline">
          Cài đặt
        </Link>{" "}
        / Bảo mật dữ liệu
      </nav>
      <h1 className="flex items-center gap-2 text-[26px] font-semibold">
        <Icon name="shield" size={24} className="text-primary" /> Bảo mật dữ liệu
      </h1>
      <p className="mt-1 max-w-2xl text-ink-2">Che thông tin liên hệ của khách với nhân viên và giới hạn lượng dữ liệu được xuất ra file, để hạn chế việc mang khách đi khi nghỉ việc. Chủ và quản lý luôn thấy đầy đủ.</p>
      <PrivacyPanel initial={prefs} sample={{ ...SAMPLE, maskedPhone: maskPhone(SAMPLE.phone), maskedEmail: maskEmail(SAMPLE.email) }} />
    </div>
  );
}
