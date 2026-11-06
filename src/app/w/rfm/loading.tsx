import { ChartSk, HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung Phân tích RFM: các nhóm khách và bảng. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải phân tích RFM">
      <HeaderSk actions={0} />
      <StatsSk n={4} />
      <ChartSk h={220} />
      <TableSk rows={8} />
    </PageSkeleton>
  );
}
