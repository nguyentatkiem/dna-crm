import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { can, getRole } from "@/lib/permissions";
import { Icon } from "@/components/Icon";
import { TRASH_DAYS, listTrash } from "@/lib/trash";
import { TrashList } from "./TrashList";

export default async function TrashPage({ searchParams }: { searchParams: Promise<{ object?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const { object } = await searchParams;
  if (!can(await getRole(user.id, workspace.id), "delete")) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="lock" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Chỉ chủ và quản lý xem được thùng rác</p>
        <Link href="/w" className="btn-outline mt-4">
          Về trang chủ
        </Link>
      </div>
    );
  }
  const rows = await listTrash(workspace.id);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Thùng rác</h1>
      <p className="mt-1 text-ink-2">Mục đã xoá nằm ở đây {TRASH_DAYS} ngày rồi tự xoá hẳn. Khôi phục để mục trở lại bảng cùng toàn bộ cập nhật, việc và tài liệu.</p>
      <TrashList
        days={TRASH_DAYS}
        initialObject={object ?? ""}
        boards={config.objects.map((o) => ({ key: o.key, label: o.label, item: o.itemLabel, amountLabel: o.amountLabel, statuses: o.statuses }))}
        initial={rows.map((r) => ({ ...r, deletedAt: r.deletedAt?.toISOString() ?? "", createdAt: r.createdAt.toISOString() }))}
      />
    </div>
  );
}
