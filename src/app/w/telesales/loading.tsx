import { HeaderSk, PageSkeleton, StatsSk, TableSk, TabsSk } from "@/components/ui/PageSkeleton";

/** Khung Telesales: số liệu cuộc gọi và danh sách cần gọi. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải telesales">
      <HeaderSk actions={2} />
      <TabsSk n={3} />
      <StatsSk n={4} />
      <TableSk rows={10} />
    </PageSkeleton>
  );
}
