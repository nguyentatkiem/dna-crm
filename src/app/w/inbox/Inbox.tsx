"use client";

// Hộp thư hợp nhất (Zalo OA, Messenger, bình luận fanpage). Giao diện tách thành các phần trong src/components/inbox/.
import { InboxApp, type InboxAppProps } from "@/components/inbox/InboxApp";

export function Inbox(props: InboxAppProps) {
  return <InboxApp {...props} />;
}
