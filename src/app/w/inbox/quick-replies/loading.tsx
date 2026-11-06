import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="canvas px-4 pt-5 sm:px-8" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-7 w-96 max-w-full" />
      <div className="mt-6 grid gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
