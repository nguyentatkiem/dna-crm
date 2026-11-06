import Link from "next/link";
import { Icon } from "@/components/Icon";

const ITEMS = [
  { href: "/w/perf", label: "Đánh giá nhân viên", icon: "award", key: "review" },
  { href: "/w/perf/commission", label: "Hoa hồng", icon: "wallet", key: "commission" },
  { href: "/w/kpi", label: "Chỉ tiêu KPI", icon: "target", key: "kpi" },
] as const;

/** Thanh chuyển trang trong mục Quản lý hiệu suất. */
export function PerfNav({ active }: { active: "review" | "commission" }) {
  return (
    <nav aria-label="Quản lý hiệu suất" className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-line-soft">
      {ITEMS.map((i) => {
        const on = i.key === active;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13.5px] ${on ? "border-primary font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            <Icon name={i.icon} size={15} /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
