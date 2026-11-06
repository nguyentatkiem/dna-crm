import { ChartSk, HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung hồ sơ hiệu suất một người. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải hồ sơ hiệu suất">
      <HeaderSk actions={1} />
      <StatsSk n={4} />
      <ChartSk h={200} />
      <TableSk rows={6} />
    </PageSkeleton>
  );
}
