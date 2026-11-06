import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { FbError, fetchPageInfo, isDryRun } from "@/lib/fb/graph";
import { pageDTO } from "@/lib/fb/admin";

/** Danh sách trang đã kết nối (token đã che). Ai vào được Hộp thư cũng xem được để lọc theo trang. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const acc = await accessOf(a.ctx);
  const pages = await db.fbPage.findMany({ where: { workspaceId: a.ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  const counts = await db.conversation.groupBy({ by: ["pageId", "kind"], where: { workspaceId: a.ctx.workspace.id, pageId: { in: pages.map((p) => p.pageId) } }, _count: { _all: true } });
  const posts = await db.fbPost.groupBy({ by: ["pageId"], where: { workspaceId: a.ctx.workspace.id }, _count: { _all: true } });
  return ok({
    items: pages.map((p) => ({
      ...pageDTO(p),
      inboxCount: counts.find((c) => c.pageId === p.pageId && c.kind === "inbox")?._count._all ?? 0,
      commentCount: counts.find((c) => c.pageId === p.pageId && c.kind === "comment")?._count._all ?? 0,
      postCount: posts.find((c) => c.pageId === p.pageId)?._count._all ?? 0,
    })),
    canConnect: allow(acc, "integrations_manage"),
    canSettings: allow(acc, "integrations_manage") || allow(acc, "inbox_settings"),
  });
}

const Body = z.object({
  pageId: z.string().trim().regex(/^\d{5,25}$/, "Page ID là dãy số (xem ở Giới thiệu → Minh bạch trang)"),
  token: z.string().trim().min(10, "Page Access Token quá ngắn").max(1000),
  name: z.string().trim().max(120).optional(),
  platform: z.enum(["facebook", "instagram"]).default("facebook"),
});

/**
 * Kết nối trang: kiểm tra token bằng Graph GET /{page-id}?fields=name,picture.
 * Không gọi được Facebook (mất mạng) thì vẫn lưu, kèm cảnh báo; token sai (Facebook báo lỗi) thì từ chối.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return fail("Bạn không có quyền kết nối trang", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { pageId, token, platform } = p.data;
  let name = p.data.name ?? "";
  let avatar = "";
  let warning = "";
  try {
    const info = await fetchPageInfo(pageId, token);
    if (info.simulated) warning = "Đang chạy thử (token mẫu hoặc MESSAGING_DRY_RUN=1): chưa kiểm tra với Facebook.";
    name = info.name || name;
    avatar = info.avatar;
  } catch (e) {
    const msg = e instanceof FbError ? e.message : String(e);
    // FbError có mã = Facebook đã trả lời (token/ID sai) → từ chối. Không mã = lỗi mạng → lưu kèm cảnh báo.
    if (e instanceof FbError && e.code) return fail(`Facebook không chấp nhận token: ${msg}`);
    warning = `Chưa kiểm tra được với Facebook (${msg}). Đã lưu, CRM sẽ dùng token khi có mạng.`;
  }
  const exists = await db.fbPage.findUnique({ where: { workspaceId_pageId: { workspaceId: a.ctx.workspace.id, pageId } } });
  const page = await db.fbPage.upsert({
    where: { workspaceId_pageId: { workspaceId: a.ctx.workspace.id, pageId } },
    create: { workspaceId: a.ctx.workspace.id, pageId, platform, token, name: name || `Trang ${pageId}`, avatar, active: true },
    update: { token, platform, ...(name ? { name } : {}), ...(avatar ? { avatar } : {}), active: true },
  });
  // Hội thoại cũ của trang này (trước khi kết nối) dùng tên trang làm nhãn — không cần sửa gì thêm.
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, exists ? "update" : "create", "fbPage", page.id, `${exists ? "Cập nhật token" : "Kết nối"} trang ${page.name}${isDryRun(token) ? " (chạy thử)" : ""}`);
  return ok({ item: pageDTO(page), warning });
}
