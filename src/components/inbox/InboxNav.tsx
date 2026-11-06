"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { Perms } from "./shared";

/** Điều hướng phụ trong Hộp thư. Mục cần quyền thì ẩn với người không có quyền. */
export function InboxNav({ perms, className = "" }: { perms: Pick<Perms, "stats" | "settings">; className?: string }) {
  const path = usePathname();
  const items: { href: string; label: string; icon: string; show: boolean }[] = [
    { href: "/w/inbox", label: "Hội thoại", icon: "chat", show: true },
    { href: "/w/inbox/posts", label: "Bài viết", icon: "feed", show: true },
    { href: "/w/inbox/quick-replies", label: "Trả lời nhanh", icon: "bolt", show: true },
    { href: "/w/inbox/stats", label: "Thống kê", icon: "chart", show: perms.stats },
    { href: "/w/inbox/pages", label: "Trang", icon: "page", show: perms.settings },
    { href: "/w/inbox/settings", label: "Cài đặt", icon: "settings", show: perms.settings },
  ];
  return (
    <nav className={`-mx-1 mt-1.5 flex gap-0.5 overflow-x-auto pb-0.5 ${className}`} aria-label="Mục hộp thư">
      {items
        .filter((i) => i.show)
        .map((i) => {
          const on = i.href === "/w/inbox" ? path === "/w/inbox" : path?.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`flex h-7 flex-none items-center gap-1 rounded px-2 text-[12.5px] ${on ? "bg-primary-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"}`}>
              <Icon name={i.icon} size={13} /> {i.label}
            </Link>
          );
        })}
    </nav>
  );
}
