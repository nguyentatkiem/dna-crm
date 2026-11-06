import { Skeleton } from "@/components/ui/Skeleton";

/** Khung bảng khi đang mở một bảng. */
export default function Loading() {
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8" role="status" aria-label="Đang tải bảng">
      <Skeleton className="h-8 w-48" />
      <div className="mt-4 flex gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>
      <div className="mt-5 grid gap-2">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
