import { Skeleton } from "@/components/ui/Skeleton";
import { HeaderSk, PageSkeleton } from "@/components/ui/PageSkeleton";

/** Khung Bảng tin: ô viết bài và vài bài đăng. */
export default function Loading() {
  return (
    <PageSkeleton label="Đang tải bảng tin">
      <HeaderSk />
      <div className="mx-auto mt-6 grid max-w-3xl gap-4">
        <div className="card p-4">
          <Skeleton className="h-20 w-full" />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="mt-3">
              <Skeleton lines={3} />
            </div>
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
