import { Skeleton } from "./Skeleton";

/**
 * Khung xương dùng cho loading.tsx từng trang: hiện ngay khi bấm chuyển trang, giữ đúng bố cục
 * (tiêu đề, hàng số liệu, biểu đồ, bảng) để khi dữ liệu về không bị nhảy.
 */
export function PageSkeleton({ label = "Đang tải trang", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8" role="status" aria-label={label} aria-busy="true">
      {children}
    </div>
  );
}

export function HeaderSk({ actions = 0, sub = true }: { actions?: number; sub?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Skeleton className="h-8 w-56 max-w-full" />
        {sub && <Skeleton className="mt-3 h-4 w-[28rem] max-w-[80vw]" />}
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>
      )}
    </div>
  );
}

export function StatsSk({ n = 4 }: { n?: number }) {
  return (
    <div className={`mt-6 grid gap-4 sm:grid-cols-2 ${n >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ChartSk({ h = 260 }: { h?: number }) {
  return (
    <div className="card mt-5 p-4">
      <Skeleton className="h-5 w-48" />
      <div className="skeleton mt-3 w-full" style={{ height: h }} aria-hidden="true" />
    </div>
  );
}

export function TableSk({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card mt-5 overflow-hidden p-4">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 grid gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export function TabsSk({ n = 4 }: { n?: number }) {
  return (
    <div className="mt-5 flex gap-2">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-8 w-24" />
      ))}
    </div>
  );
}
