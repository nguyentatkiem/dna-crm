import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { accessOf, allow } from "@/lib/permissions";
import { Icon } from "@/components/Icon";
import { TeamTutorial } from "./TeamTutorial";

export const dynamic = "force-dynamic";

/** Tiến độ làm quen của từng thành viên (chủ, người quản lý thành viên hoặc xem hiệu suất đội). */
export default async function TutorialSettingsPage() {
  const ctx = await requireApp();
  const acc = await accessOf(ctx);
  const can = acc.isOwner || allow(acc, "members_manage") || allow(acc, "perf_view_team");
  if (!can) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="lock" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Chỉ chủ và quản lý xem được tiến độ làm quen của đội</p>
        <Link href="/w/settings" className="btn-outline mt-4">
          Về Cài đặt
        </Link>
      </div>
    );
  }
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="text-[13px] text-ink-2 hover:underline">
        ← Cài đặt
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Hướng dẫn người mới</h1>
      <p className="mt-1 max-w-3xl text-ink-2">Xem ai đã làm quen xong, ai còn dở danh sách “Bắt đầu với DNA CRM” và nhắc họ hoàn thành. Danh sách tự đánh dấu theo dữ liệu thật của từng người.</p>
      <TeamTutorial />
    </div>
  );
}
