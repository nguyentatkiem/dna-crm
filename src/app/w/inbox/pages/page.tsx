import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { accessOf, allow } from "@/lib/permissions";
import { PagesClient } from "./PagesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trang Facebook · DNA CRM" };

export default async function InboxPagesPage() {
  const { user, workspace } = await requireApp();
  const acc = await accessOf({ user, workspace });
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <Link href="/w/inbox" className="hover:underline">
          ← Hộp thư
        </Link>
        <Link href="/w/inbox/posts" className="hover:underline">
          Bài viết →
        </Link>
      </div>
      <h1 className="mt-1 text-[26px] font-semibold">Trang Facebook</h1>
      <p className="mt-1 max-w-3xl text-ink-2">
        Kết nối fanpage để tin nhắn và bình luận về chung Hộp thư. Cài tự ẩn bình luận có SĐT, tự thích, chữ ký cuối tin, và tạo link m.me có mã nguồn để biết khách đến từ đâu.
      </p>
      <PagesClient canConnect={allow(acc, "integrations_manage")} canSettings={allow(acc, "integrations_manage") || allow(acc, "inbox_settings")} canInbox={allow(acc, "inbox_settings")} />
    </div>
  );
}
