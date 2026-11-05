import Link from "next/link";
import { Icon } from "../Icon";

/** Trạng thái rỗng có hướng dẫn: icon, tiêu đề, mô tả và nút hành động. Dùng được ở server và client. */
export function EmptyState({
  icon = "inbox",
  title,
  desc,
  action,
  compact,
  className = "",
  children,
}: {
  icon?: string;
  title: string;
  desc?: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "gap-1.5 py-6" : "gap-2 py-10"} ${className}`}>
      <span className={`grid place-items-center rounded-2xl bg-surface-2 text-ink-2 ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <p className={`font-medium ${compact ? "text-[14px]" : "text-[15px]"}`}>{title}</p>
      {desc && <p className="max-w-sm text-[13px] text-ink-2">{desc}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className="btn-outline mt-1">
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="btn-outline mt-1">
            {action.label}
          </button>
        ))}
      {children}
    </div>
  );
}
