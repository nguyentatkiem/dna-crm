import { ChartSk, HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung Phễu chuyển đổi. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải phễu">
      <HeaderSk actions={0} />
      <StatsSk n={4} />
      <ChartSk h={280} />
      <TableSk rows={6} />
    </PageSkeleton>
  );
}
