import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getQuickTopics, setQuickTopics } from "@/lib/inbox-list";
import { allowed } from "@/lib/permissions";
import { fold, keyFromName, parseQuickImport } from "@/lib/quick-replies";

const Body = z.object({ text: z.string().max(2_000_000), mode: z.enum(["append", "replace"]).catch("append") });

/**
 * Nhập mẫu từ JSON hoặc CSV (cột phim_tat, chu_de, noi_dung, anh). Chủ đề theo tên, chưa có thì tự tạo.
 * mode "append": phím tắt đã có thì cập nhật nội dung; "replace": xoá hết mẫu cũ rồi nhập.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "quick_reply_manage"))) return fail("Bạn chưa có quyền nhập mẫu", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Tệp quá lớn hoặc không hợp lệ");
  let rows;
  try {
    rows = parseQuickImport(p.data.text);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Không đọc được tệp");
  }
  if (!rows.length) return fail("Không thấy mẫu nào trong tệp (cần cột nội dung)");
  const wid = a.ctx.workspace.id;
  const topics = await getQuickTopics(wid);
  const topicKey = (name: string) => {
    if (!name) return "";
    const hit = topics.find((t) => t.key === name || fold(t.name) === fold(name));
    if (hit) return hit.key;
    const t = { key: keyFromName(name, topics.map((x) => x.key)), name: name.slice(0, 40), color: "gray" };
    topics.push(t);
    return t.key;
  };
  if (p.data.mode === "replace") await db.quickReply.deleteMany({ where: { workspaceId: wid } });
  const existing = await db.quickReply.findMany({ where: { workspaceId: wid }, select: { id: true, shortcut: true, sort: true } });
  let sort = existing.reduce((m, r) => Math.max(m, r.sort), 0);
  let created = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.shortcut && seen.has(r.shortcut)) continue;
    if (r.shortcut) seen.add(r.shortcut);
    const data = { topic: topicKey(r.topic), content: r.content, attachmentsJson: JSON.stringify(r.attachments) };
    const hit = r.shortcut ? existing.find((x) => x.shortcut === r.shortcut) : undefined;
    if (hit) {
      await db.quickReply.update({ where: { id: hit.id }, data });
      updated++;
    } else {
      await db.quickReply.create({ data: { workspaceId: wid, shortcut: r.shortcut, ...data, sort: ++sort, createdBy: a.ctx.user.name } });
      created++;
    }
  }
  await setQuickTopics(wid, topics);
  await audit({ workspaceId: wid, user: a.ctx.user }, "import", "quick_reply", "", `Nhập mẫu trả lời nhanh: ${created} mới, ${updated} cập nhật`);
  return ok({ created, updated });
}
