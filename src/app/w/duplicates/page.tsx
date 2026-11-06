import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { can, getRole } from "@/lib/permissions";
import { Icon } from "@/components/Icon";
import { DuplicatesClient } from "./DuplicatesClient";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const { user, workspace } = await requireApp();
  if (!can(await getRole(user.id, workspace.id), "delete")) {
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <div className="card mx-auto mt-10 grid max-w-md place-items-center gap-3 p-8 text-center">
          <Icon name="lock" size={28} className="text-ink-2" />
          <h1 className="text-[18px] font-semibold">Chỉ chủ hoặc quản lý dùng được trang này</h1>
          <p className="text-[14px] text-ink-2">Gộp hồ sơ trùng sẽ chuyển đơn hàng, phiếu hỗ trợ, cuộc gọi… sang một hồ sơ và đưa các bản còn lại vào thùng rác.</p>
          <Link href="/w" className="btn-outline">
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="flex items-center gap-2 text-[26px] font-semibold">
        <Icon name="copy" size={24} className="text-primary" /> Hồ sơ trùng lặp
      </h1>
      <p className="mt-1 max-w-3xl text-ink-2">Tìm khách bị nhập nhiều lần (cùng số điện thoại, cùng email, hoặc cùng tên và đuôi số). Gộp lại để có một chân dung đầy đủ: mọi đơn hàng, cuộc gọi, tin nhắn, phiếu hỗ trợ về một hồ sơ.</p>
      <DuplicatesClient />
    </div>
  );
}
