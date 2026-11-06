import { HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

/** Khung trang Hiệu suất cá nhân khi đang tính số liệu. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải hiệu suất">
      <HeaderSk actions={1} />
      <StatsSk n={4} />
      <TableSk rows={6} />
    </PageSkeleton>
  );
}
