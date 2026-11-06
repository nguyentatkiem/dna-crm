import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { allow, getAccess } from "@/lib/permissions";
import { scoringRules } from "@/lib/c360/behavior";
import { Icon } from "@/components/Icon";
import { ScoringPanel } from "./ScoringPanel";

export const dynamic = "force-dynamic";

export default async function ScoringPage() {
  const { user, workspace } = await requireApp();
  const canEdit = allow(await getAccess(user.id, workspace.id), "settings_manage");
  const rules = await scoringRules(workspace.id);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <nav className="mb-2 text-[13px] text-ink-2">
        <Link href="/w/settings" className="hover:text-primary hover:underline">
          Cài đặt
        </Link>{" "}
        / Chấm điểm khách
      </nav>
      <h1 className="flex items-center gap-2 text-[26px] font-semibold">
        <Icon name="target" size={24} className="text-primary" /> Chấm điểm khách theo hành vi
      </h1>
      <p className="mt-1 max-w-3xl text-ink-2">Điểm khách (0–100) = một phần điểm hồ sơ (độ đầy đủ, nguồn) + điểm cho từng hành vi trong thời gian gần đây − điểm trừ khi khách im lặng lâu. Hệ thống tự tính lại mỗi giờ; khi điểm đổi từ 10 trở lên sẽ ghi vào hoạt động của khách và kích hoạt tự động hoá “Điểm vượt ngưỡng”.</p>
      <ScoringPanel initial={rules} canEdit={canEdit} />
    </div>
  );
}
