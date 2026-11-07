import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { accessOf, allow } from "@/lib/permissions";
import { runChecks } from "@/lib/health";
import { Icon } from "@/components/Icon";
import { HealthBoard } from "./HealthBoard";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const ctx = await requireApp();
  const acc = await accessOf(ctx);
  if (!allow(acc, "health_view")) {
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <div className="card mx-auto mt-10 grid max-w-md place-items-center gap-3 p-8 text-center">
          <Icon name="lock" size={28} className="text-ink-2" />
          <h1 className="text-[18px] font-semibold">Bạn chưa có quyền xem trang này</h1>
          <p className="text-[14px] text-ink-2">Trang Kiểm tra kết nối dành cho chủ workspace và quản lý.</p>
          <Link href="/w/settings" className="btn-outline">
            Về Cài đặt
          </Link>
        </div>
      </div>
    );
  }
  const checks = await runChecks(ctx.workspace.id);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <nav className="mb-2 text-[13px] text-ink-2">
        <Link href="/w/settings" className="hover:text-primary hover:underline">
          Cài đặt
        </Link>{" "}
        / Kiểm tra kết nối
      </nav>
      <h1 className="text-[26px] font-semibold">Kiểm tra kết nối</h1>
      <p className="mt-1 max-w-2xl text-ink-2">Tình trạng máy chủ, sao lưu và các kết nối Facebook, Zalo, gửi tin, AI... Bấm “Thử ngay” để gọi thử thật tới dịch vụ.</p>
      <HealthBoard initial={checks} isOwner={acc.isOwner} />
    </div>
  );
}
