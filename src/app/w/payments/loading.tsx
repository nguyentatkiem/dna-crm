import { HeaderSk, PageSkeleton, StatsSk, TableSk } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Đang tải đối soát">
      <HeaderSk actions={1} />
      <StatsSk n={3} />
      <TableSk rows={8} />
    </PageSkeleton>
  );
}
