import { ChartSk, HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Đang tải thống kê hộp thư">
      <HeaderSk actions={2} />
      <StatsSk n={4} />
      <ChartSk />
      <TableSk />
    </PageSkeleton>
  );
}
