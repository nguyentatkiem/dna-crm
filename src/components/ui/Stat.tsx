import Link from "next/link";
import { Icon } from "../Icon";

/** Ô chỉ số: nhãn, số lớn, gợi ý, % thay đổi và chỗ cho biểu đồ mini (children). */
export function Stat({
  label,
  value,
  hint,
  delta,
  icon,
  tone = "#0073ea",
  href,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: number | null;
  icon?: string;
  tone?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && (
          <span className="grid h-7 w-7 flex-none place-items-center rounded-md" style={{ background: `${tone}1f`, color: tone }}>
            <Icon name={icon} size={15} />
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{label}</p>
        {delta != null && Number.isFinite(delta) && (
          <span className={delta > 0 ? "badge-success" : delta < 0 ? "badge-danger" : "badge"}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(Math.round(delta))}%
          </span>
        )}
      </div>
      <p className="mt-2 truncate font-title text-[26px] font-semibold leading-tight tnum">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{hint}</p>}
      {children && <div className="mt-2">{children}</div>}
    </>
  );
  const cls = "card block min-w-0 p-4";
  return href ? (
    <Link href={href} className={`${cls} card-hover`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
