// Quy tắc báo tin (server-only vì dùng lại findMentions của lib/mentions).
import { findMentions } from "../mentions";

/** Thành viên CỦA HỘI THOẠI được @nhắc (không báo người ngoài nhóm, không báo chính người viết). */
export function mentionTargets(text: string, members: { id: string; name: string }[], authorId: string): { id: string; name: string }[] {
  if (!text.includes("@")) return [];
  const names = findMentions(text, members.map((m) => m.name));
  const out: { id: string; name: string }[] = [];
  for (const n of names) {
    const m = members.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (m && m.id !== authorId && !out.some((o) => o.id === m.id)) out.push(m);
  }
  // "@all" / "@tatca" báo mọi người trong nhóm.
  if (/(^|\s)@(all|tatca|tất cả)(?![\p{L}\p{N}_])/iu.test(text)) for (const m of members) if (m.id !== authorId && !out.some((o) => o.id === m.id)) out.push(m);
  return out;
}
