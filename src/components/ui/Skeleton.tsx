/** Khung xương khi đang tải. `lines` để vẽ nhiều dòng chữ. */
export function Skeleton({ className = "h-4 w-full", lines }: { className?: string; lines?: number }) {
  if (lines) {
    return (
      <div className="grid gap-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="skeleton block h-3.5" style={{ width: `${i === lines - 1 ? 60 : 100 - ((i * 13) % 25)}%` }} />
        ))}
      </div>
    );
  }
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}
