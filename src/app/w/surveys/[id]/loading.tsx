import { ChartSk, HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung báo cáo một khảo sát: NPS, biểu đồ, câu trả lời. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải báo cáo khảo sát">
      <HeaderSk actions={2} />
      <StatsSk n={4} />
      <ChartSk h={200} />
      <TableSk rows={6} />
    </PageSkeleton>
  );
}
