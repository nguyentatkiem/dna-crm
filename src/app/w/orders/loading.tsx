import { HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung Đơn hàng. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải đơn hàng">
      <HeaderSk actions={1} />
      <StatsSk n={4} />
      <TableSk rows={10} />
    </PageSkeleton>
  );
}
