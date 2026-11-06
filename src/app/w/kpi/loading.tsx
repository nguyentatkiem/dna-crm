import { HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung KPI: thẻ mục tiêu và bảng tiến độ. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải KPI">
      <HeaderSk actions={1} />
      <StatsSk n={4} />
      <TableSk rows={8} />
    </PageSkeleton>
  );
}
