import { HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung danh sách Khảo sát. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải khảo sát">
      <HeaderSk actions={1} />
      <StatsSk n={3} />
      <TableSk rows={6} />
    </PageSkeleton>
  );
}
