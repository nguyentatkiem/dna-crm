import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { accessOf, allow } from "@/lib/permissions";
import { PostsClient } from "./PostsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài viết fanpage · DNA CRM" };

export default async function InboxPostsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { user, workspace } = await requireApp();
  const acc = await accessOf({ user, workspace });
  const { page } = await searchParams;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <Link href="/w/inbox" className="hover:underline">
          ← Hộp thư
        </Link>
        <Link href="/w/inbox/pages" className="hover:underline">
          Trang Facebook →
        </Link>
      </div>
      <h1 className="mt-1 text-[26px] font-semibold">Bài viết</h1>
      <p className="mt-1 max-w-3xl text-ink-2">Bài viết, video, livestream của các trang: bài nào nhiều bình luận, nhiều khách để SĐT. Cài tự ẩn, tự trả lời và nhắn riêng theo từng bài; gộp các phiên live để xem bình luận chung.</p>
      <PostsClient canSettings={allow(acc, "inbox_settings")} canModerate={allow(acc, "comment_moderate")} initialPage={page ?? ""} />
    </div>
  );
}
