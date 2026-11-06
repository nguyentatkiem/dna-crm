// Kiểu dữ liệu Hộp thư dùng chung giữa API và giao diện (không import gì phía server).

export type InboxAttachment = { type: string; url?: string; name?: string; lat?: number; lng?: number };

export type InboxItem = {
  id: string;
  channel: string;
  kind: "inbox" | "comment";
  pageId: string;
  pageName: string;
  postId: string;
  name: string;
  avatar: string;
  lastText: string;
  lastAt: string;
  createdAt: string;
  unread: number;
  assignee: string;
  status: string;
  recordId: string | null;
  recordTitle: string;
  tags: string[];
  phones: string[];
  lastInAt: string | null;
  lastOutAt: string | null;
  readAt: string | null;
  orderMarked: boolean;
  privateReplied: boolean;
  source: string;
  sourceRef: string;
  sentiment: string;
};

export type InboxCounts = { all: number; inbox: number; comment: number; unread: number; unreplied: number };
export type InboxList = { items: InboxItem[]; counts: InboxCounts; unreadTotal: number; hasMore: boolean };

export type InboxMessage = {
  id: string;
  direction: "in" | "out" | "note";
  kind: string;
  text: string;
  attachments: InboxAttachment[];
  author: string;
  status: string;
  error: string;
  at: string;
  commentId: string;
  parentId: string;
  hidden: boolean;
  liked: boolean;
};

export type InboxPost = { postId: string; pageId: string; message: string; image: string; permalink: string; kind: string; live: boolean; postedAt: string; commentsCount: number };

export type InboxRecord = {
  id: string;
  title: string;
  phone: string;
  phoneKey: string;
  email: string;
  emailKey: string;
  address: string;
  addressKey: string;
  score: number;
  status: string;
  statusLabel: string;
  statusColor: string;
  source: string;
  owner: string;
};

export type InboxActivity = { id: string; kind: string; body: string; author: string; at: string };

export type InboxDetail = {
  conversation: InboxItem;
  messages: InboxMessage[];
  post: InboxPost | null;
  record: InboxRecord | null;
  activities: InboxActivity[];
};

export type InboxPage = { pageId: string; name: string; avatar: string; platform: string; active: boolean };
