import { Skeleton } from "@/components/ui/Skeleton";

/** Hiện ngay khi bấm chuyển trang, để không có cảm giác đứng màn hình trong lúc máy chủ chuẩn bị dữ liệu. */
export default function Loading() {
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8" role="status" aria-label="Đang tải trang">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="card mt-6 p-4">
        <Skeleton lines={8} />
      </div>
    </div>
  );
}
