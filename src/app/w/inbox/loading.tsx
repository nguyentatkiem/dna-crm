import { Skeleton } from "@/components/ui/Skeleton";

/** Khung Hộp thư: danh sách hội thoại | khung chat | hồ sơ khách, đúng bố cục 3 cột để không nhảy khi dữ liệu về. */
export default function Loading() {
  return (
    <div className="flex h-full min-h-[520px] flex-col bg-surface md:rounded-tl-lg" role="status" aria-label="Đang tải hộp thư" aria-busy="true">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <div className="grid content-start gap-3 border-line-soft p-4 md:border-r">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 flex-none rounded-full" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden flex-col gap-3 p-4 md:flex">
          <Skeleton className="h-10 w-1/2" />
          <div className="grid flex-1 content-end gap-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-16 w-3/5" />
          </div>
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="hidden content-start gap-3 border-l border-line-soft p-4 xl:grid">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton lines={6} />
        </div>
      </div>
    </div>
  );
}
