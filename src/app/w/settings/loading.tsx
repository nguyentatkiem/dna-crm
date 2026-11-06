import { HeaderSk, PageSkeleton, TableSk, TabsSk } from "@/components/ui/PageSkeleton";

/** Khung trang Cài đặt. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải cài đặt">
      <HeaderSk actions={2} />
      <TabsSk n={5} />
      <TableSk rows={8} />
    </PageSkeleton>
  );
}
