import { Skeleton } from "@/components/ui/Skeleton";
import { HeaderSk, PageSkeleton } from "@/components/ui/PageSkeleton";

/** Khung một Dashboard: lưới widget có sẵn chiều cao, widget tự điền khi số liệu về. */
export default function Loading() {
  const spans = ["sm:col-span-3", "sm:col-span-3", "sm:col-span-3", "sm:col-span-3", "sm:col-span-6", "sm:col-span-6", "sm:col-span-4", "sm:col-span-4", "sm:col-span-4"];
  return (
    <PageSkeleton label="Đang tải dashboard">
      <HeaderSk actions={2} sub={false} />
      <div className="mt-5 grid gap-4 sm:grid-cols-12">
        {spans.map((s, i) => (
          <div key={i} className={`card p-4 ${s}`}>
            <Skeleton className="h-4 w-32" />
            <div className={`skeleton mt-3 w-full ${i < 4 ? "h-14" : "h-48"}`} aria-hidden="true" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
