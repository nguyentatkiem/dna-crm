import { requireApp } from "@/lib/auth";
import { SegmentsClient } from "./SegmentsClient";

export default async function SegmentsPage() {
  const { config, user } = await requireApp();
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Nhóm khách</h1>
      <p className="mt-1 text-ink-2">Lưu bộ lọc thành nhóm khách động: thành viên tự cập nhật theo dữ liệu, dùng để chăm sóc và gửi tin hàng loạt.</p>
      <SegmentsClient objects={config.objects} team={config.team} me={user.name} />
    </div>
  );
}
