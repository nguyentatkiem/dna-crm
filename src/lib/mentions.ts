import { db } from "./db";
import { notify } from "./notify";

/**
 * Tìm các tên được @nhắc trong đoạn chữ. Tên có thể có dấu cách ("@Minh Đức"), nên so khớp theo danh sách tên
 * đã biết, ưu tiên tên dài trước để "@Minh Đức" không bị bắt nhầm thành "@Minh".
 */
export function findMentions(text: string, names: string[]): string[] {
  const out: string[] = [];
  let rest = text;
  for (const n of [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu");
    if (re.test(rest)) {
      out.push(n);
      rest = rest.replace(new RegExp(re.source, "giu"), "$1");
    }
  }
  return out;
}

/** Gửi thông báo cho thành viên được @nhắc (bỏ qua chính người viết). Trả về tên những người đã được báo. */
export async function notifyMentions(workspaceId: string, author: { id: string; name: string }, text: string, at: { title: string; href: string }) {
  if (!text.includes("@")) return [];
  const members = await db.membership.findMany({ where: { workspaceId }, select: { userId: true, user: { select: { name: true } } } });
  const names = findMentions(
    text,
    members.map((m) => m.user.name),
  );
  const snippet = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  const done: string[] = [];
  for (const n of names) {
    const m = members.find((x) => x.user.name.toLowerCase() === n.toLowerCase());
    if (!m || m.userId === author.id) continue;
    await notify(workspaceId, { userId: m.userId, kind: "mention", text: `${author.name} nhắc bạn trong “${at.title}”: ${snippet}`, href: at.href });
    done.push(m.user.name);
  }
  return done;
}
