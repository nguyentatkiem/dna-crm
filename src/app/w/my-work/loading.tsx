import { HeaderSk, PageSkeleton, TableSk, TabsSk } from "@/components/ui/PageSkeleton";

/** Khung Việc của tôi. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải việc của tôi">
      <HeaderSk actions={1} />
      <TabsSk n={3} />
      <TableSk rows={10} />
    </PageSkeleton>
  );
}
