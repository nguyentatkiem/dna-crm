import { HeaderSk, PageSkeleton, StatsSk } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Đang tải báo cáo">
      <HeaderSk actions={1} />
      <StatsSk n={3} />
    </PageSkeleton>
  );
}
