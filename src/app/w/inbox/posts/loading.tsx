import { ChartSk, HeaderSk, PageSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Đang tải bài viết">
      <HeaderSk />
      <ChartSk h={160} />
      <ChartSk h={160} />
    </PageSkeleton>
  );
}
