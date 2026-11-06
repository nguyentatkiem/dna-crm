import Link from "next/link";
import { Icon } from "@/components/Icon";

const ITEMS = [
  { href: "/w/perf/overview", label: "Tổng quan", icon: "chart", key: "overview" },
  { href: "/w/perf", label: "Đánh giá", icon: "award", key: "review" },
  { href: "/w/perf/commission", label: "Hoa hồng", icon: "wallet", key: "commission" },
  { href: "/w/kpi", label: "KPI", icon: "target", key: "kpi" },
] as const;

export type PerfTab = (typeof ITEMS)[number]["key"] | "people";

/** Thanh chuyển trang trong mục Quản lý hiệu suất. Trang hồ sơ cá nhân ("people") đánh dấu tab Tổng quan. */
export function PerfNav({ active }: { active: PerfTab }) {
  const on = active === "people" ? "overview" : active;
  return (
    <nav aria-label="Quản lý hiệu suất" className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-line-soft">
      {ITEMS.map((i) => {
        const cur = i.key === on;
        return (
          <Link key={i.href} href={i.href} aria-current={cur ? "page" : undefined} className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13.5px] ${cur ? "border-primary font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            <Icon name={i.icon} size={15} /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
