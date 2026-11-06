import { HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung Phiếu hỗ trợ. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải phiếu hỗ trợ">
      <HeaderSk actions={1} />
      <StatsSk n={4} />
      <TableSk rows={10} />
    </PageSkeleton>
  );
}
