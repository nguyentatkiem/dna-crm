import { ChartSk, HeaderSk, PageSkeleton, StatsSk, TableSk, TabsSk } from "@/components/ui/PageSkeleton";

/** Khung Marketing: tab, số liệu quảng cáo, biểu đồ chi phí, bảng chiến dịch. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải marketing">
      <HeaderSk actions={2} />
      <TabsSk n={4} />
      <StatsSk n={4} />
      <ChartSk h={260} />
      <TableSk rows={8} />
    </PageSkeleton>
  );
}
