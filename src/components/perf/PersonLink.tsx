import Link from "next/link";

export const personHref = (name: string, qs = "") => `/w/perf/people/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;

/** Tên người dạng link sang Hồ sơ hiệu suất (dùng ở Tổng quan, Đánh giá, Hoa hồng, KPI). */
export function PersonLink({ name, qs = "", className = "" }: { name: string; qs?: string; className?: string }) {
  return (
    <Link href={personHref(name, qs)} className={`hover:text-primary hover:underline ${className}`} title={`Xem hồ sơ hiệu suất của ${name}`}>
      {name}
    </Link>
  );
}
