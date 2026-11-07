import Link from "next/link";
import { getAccess } from "@/lib/permissions";
import { cachedChecks } from "@/lib/health";
import { Icon } from "@/components/Icon";

/**
 * Thẻ cảnh báo cho trang chủ /w: chỉ chủ workspace thấy, chỉ hiện khi có kiểm tra ở trạng thái "Lỗi".
 * Không gọi mạng (dùng kết quả kiểm tra nhanh, nhớ 5 phút). Dùng: <HealthBanner workspaceId={workspace.id} userId={user.id} />
 */
export async function HealthBanner({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const acc = await getAccess(userId, workspaceId);
  if (!acc.isOwner) return null;
  const errors = (await cachedChecks(workspaceId).catch(() => [])).filter((c) => c.status === "error");
  if (!errors.length) return null;
  return (
    <section role="alert" className="card flex flex-wrap items-start gap-3 border-danger/40 bg-danger-soft p-4">
      <Icon name="flag" size={20} className="mt-0.5 flex-none text-danger" />
      <div className="min-w-0 flex-1">
        <b className="block text-[14.5px]">Có {errors.length} vấn đề cần xử lý để CRM chạy ổn định</b>
        <ul className="mt-1 grid gap-0.5 text-[13px] text-ink-2">
          {errors.slice(0, 3).map((c) => (
            <li key={c.key} className="truncate">
              <b className="text-ink">{c.label}:</b> {c.detail}
            </li>
          ))}
          {errors.length > 3 && <li>và {errors.length - 3} vấn đề khác</li>}
        </ul>
      </div>
      <Link href="/w/settings/health" className="btn-primary h-9 flex-none">
        Xem & sửa
      </Link>
    </section>
  );
}
