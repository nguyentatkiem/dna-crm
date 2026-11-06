import { ChartSk, HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung Tổng quan hiệu suất: số liệu, xu hướng theo tuần, bảng xếp hạng. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải tổng quan hiệu suất">
      <HeaderSk actions={2} />
      <StatsSk n={4} />
      <ChartSk h={240} />
      <TableSk rows={10} />
    </PageSkeleton>
  );
}
