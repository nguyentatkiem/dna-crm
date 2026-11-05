import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { can, getRole } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { dbProvider, listBackups } from "@/lib/backup";
import { Icon } from "@/components/Icon";
import { BackupPanel } from "./BackupPanel";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const { user, workspace } = await requireApp();
  const owner = can(await getRole(user.id, workspace.id), "manage_settings");
  if (!owner) {
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <div className="card mx-auto mt-10 grid max-w-md place-items-center gap-3 p-8 text-center">
          <Icon name="lock" size={28} className="text-ink-2" />
          <h1 className="text-[18px] font-semibold">Chỉ chủ workspace xem được trang này</h1>
          <p className="text-[14px] text-ink-2">Sao lưu chứa toàn bộ dữ liệu khách hàng. Hãy nhờ chủ workspace thao tác.</p>
          <Link href="/w/settings" className="btn-outline">
            Về Cài đặt
          </Link>
        </div>
      </div>
    );
  }
  const s = getSettings(workspace).backup;
  const backups = await listBackups(workspace.id);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <nav className="mb-2 text-[13px] text-ink-2">
        <Link href="/w/settings" className="hover:text-primary hover:underline">
          Cài đặt
        </Link>{" "}
        / Sao lưu
      </nav>
      <h1 className="text-[26px] font-semibold">Sao lưu & khôi phục</h1>
      <p className="mt-1 max-w-2xl text-ink-2">
        Bản sao lưu chứa toàn bộ dữ liệu của <b className="text-ink">{workspace.name}</b>: khách, giao dịch, cuộc gọi, hội thoại, tài liệu, cấu hình. File ghi âm nằm riêng trong thư mục uploads, hãy sao chép thư mục đó khi chuyển máy.
      </p>
      <BackupPanel
        initial={backups}
        enabled={s?.enabled !== "0"}
        keep={Math.max(1, Math.min(365, Math.round(Number(s?.keep)) || 14))}
        workspaceName={workspace.name}
        provider={dbProvider()}
      />
    </div>
  );
}
