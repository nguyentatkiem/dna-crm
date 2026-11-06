import { HeaderSk, PageSkeleton, StatsSk } from "@/components/ui/PageSkeleton";

/** Khung danh sách Dashboard. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải dashboard">
      <HeaderSk actions={1} />
      <StatsSk n={3} />
    </PageSkeleton>
  );
}
