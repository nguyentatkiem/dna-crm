"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/** Sự kiện trang Chat phát ra khi số chưa đọc đổi (để huy hiệu cập nhật ngay, không chờ lượt hỏi kế tiếp). */
export const TEAMCHAT_UNREAD_EVENT = "teamchat:unread";

/**
 * Nút Chat nội bộ trên thanh trên cùng, có huy hiệu số tin chưa đọc. Hỏi máy chủ mỗi 30 giây (dừng khi tab ẩn),
 * và nghe sự kiện TEAMCHAT_UNREAD_EVENT từ trang /w/chat.
 */
export function TeamChatButton() {
  const [n, setN] = useState(0);
  const path = usePathname();
  const seq = useRef(0);

  useEffect(() => {
    const load = () => {
      if (document.hidden) return;
      const my = ++seq.current;
      fetch("/api/teamchat/unread")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => my === seq.current && d && typeof d.total === "number" && setN(d.total))
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 30_000);
    const onEvt = (e: Event) => {
      seq.current++;
      setN(Number((e as CustomEvent<number>).detail) || 0);
    };
    document.addEventListener("visibilitychange", load);
    window.addEventListener(TEAMCHAT_UNREAD_EVENT, onEvt);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(TEAMCHAT_UNREAD_EVENT, onEvt);
    };
  }, []);

  const active = path?.startsWith("/w/chat");
  return (
    <Link href="/w/chat" className={`btn-ghost relative h-8 w-8 flex-none justify-center p-0 ${active ? "bg-hover" : ""}`} aria-label={`Chat nội bộ (${n} tin chưa đọc)`} title="Chat nội bộ">
      <Icon name="chat" size={18} />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#df2f4a] px-1 text-[10px] font-semibold text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
