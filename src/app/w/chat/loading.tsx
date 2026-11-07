export default function Loading() {
  return (
    <div className="flex h-full bg-surface md:rounded-tl-lg" aria-busy="true" aria-label="Đang tải chat">
      <div className="w-full space-y-2 border-r border-line-soft p-3 md:w-[300px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
      <div className="hidden flex-1 md:block" />
    </div>
  );
}
