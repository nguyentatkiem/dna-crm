import { ChartSk, HeaderSk, PageSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Đang tải cài đặt hộp thư">
      <HeaderSk />
      <ChartSk h={180} />
      <ChartSk h={220} />
    </PageSkeleton>
  );
}
