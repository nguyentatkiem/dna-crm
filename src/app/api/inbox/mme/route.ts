import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { cleanRef, mmeLinks, mmeUrl, newCode, saveMmeLinks } from "@/lib/fb/admin";

/**
 * Link m.me có tham số ref để biết khách đến từ đâu (bài đăng, KOL, in tờ rơi, QR...).
 * Mỗi link có link rút gọn /api/inbox/mme/go/<code> đếm lượt bấm rồi chuyển sang m.me/<page>?ref=<ref>.
 * Số hội thoại = hội thoại có source "ref" và sourceRef = ref (Messenger gửi referral khi khách mở chat qua link).
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const links = await mmeLinks(wid);
  const grouped = await db.conversation.groupBy({ by: ["sourceRef"], where: { workspaceId: wid, source: "ref" }, _count: { _all: true } });
  const withRec = await db.conversation.groupBy({ by: ["sourceRef"], where: { workspaceId: wid, source: "ref", recordId: { not: null } }, _count: { _all: true } });
  const conv = new Map(grouped.map((g) => [g.sourceRef, g._count._all]));
  const rec = new Map(withRec.map((g) => [g.sourceRef, g._count._all]));
  const origin = new URL(req.url).origin;
  const known = new Set(links.map((l) => l.ref));
  const acc = await accessOf(a.ctx);
  return ok({
    items: links
      .slice()
      .reverse()
      .map((l) => ({ ...l, url: mmeUrl(l.pageId, l.ref), shortUrl: `${origin}/api/inbox/mme/go/${l.code}`, conversations: conv.get(l.ref) ?? 0, contacts: rec.get(l.ref) ?? 0 })),
    // Ref khách dùng mà chưa tạo trong CRM (link tự gõ / tạo ở nơi khác).
    others: grouped.filter((g) => g.sourceRef && !known.has(g.sourceRef)).map((g) => ({ ref: g.sourceRef, conversations: g._count._all, contacts: rec.get(g.sourceRef) ?? 0 })),
    canEdit: allow(acc, "inbox_settings"),
  });
}

const Body = z.object({ pageId: z.string().trim().min(1, "Chọn trang"), ref: z.string().trim().min(1, "Nhập mã ref").max(120), label: z.string().trim().max(120).optional() });

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "inbox_settings")) return fail("Bạn không có quyền tạo link", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const wid = a.ctx.workspace.id;
  const page = await db.fbPage.findUnique({ where: { workspaceId_pageId: { workspaceId: wid, pageId: p.data.pageId } } });
  if (!page) return fail("Trang chưa được kết nối", 404);
  const ref = cleanRef(p.data.ref);
  if (!ref) return fail("Mã ref chỉ gồm chữ không dấu, số, _ - .");
  const links = await mmeLinks(wid);
  if (links.some((l) => l.ref === ref && l.pageId === page.pageId)) return fail(`Đã có link với ref "${ref}"`);
  const link = { id: newCode(), code: newCode(), pageId: page.pageId, ref, label: p.data.label || ref, clicks: 0, createdAt: new Date().toISOString(), createdBy: a.ctx.user.name };
  await saveMmeLinks(wid, [...links, link]);
  await audit({ workspaceId: wid, user: a.ctx.user }, "create", "mme", link.id, `Tạo link m.me ref=${ref} cho trang ${page.name}`);
  const origin = new URL(req.url).origin;
  return ok({ item: { ...link, url: mmeUrl(link.pageId, ref), shortUrl: `${origin}/api/inbox/mme/go/${link.code}`, conversations: 0, contacts: 0 } });
}
