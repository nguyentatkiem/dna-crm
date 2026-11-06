import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { can, getRole } from "@/lib/permissions";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { Icon } from "@/components/Icon";
import { CompanyForm } from "./CompanyForm";

export default async function CompanyPage() {
  const { user, workspace, config } = await requireApp();
  if (!can(await getRole(user.id, workspace.id), "see_all")) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="lock" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Chỉ chủ và quản lý sửa được thông tin doanh nghiệp</p>
        <Link href="/w/settings" className="btn-outline mt-4">
          Về Cài đặt
        </Link>
      </div>
    );
  }
  const company = await getPref<Company>(workspace.id, "company", COMPANY_DEFAULT);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="text-[13px] text-ink-2 hover:underline">
        ← Cài đặt
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Thông tin doanh nghiệp</h1>
      <p className="mt-1 text-ink-2">In trên đầu báo giá, đơn hàng và trang báo giá gửi khách.</p>
      <CompanyForm initial={{ ...company, name: company.name || config.businessName || workspace.name }} />
    </div>
  );
}
