import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { accountDTO } from "@/lib/channels/accounts";
import { syncShop } from "@/lib/channels/orders";

/** Đồng bộ đơn ngay (ngoài job 10 phút). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const acc = await accessOf(a.ctx);
  if (!allow(acc, "integrations_manage")) return fail("Bạn không có quyền đồng bộ đơn sàn", 403);
  const row = await db.channelAccount.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!row) return fail("Không tìm thấy tài khoản", 404);
  if (row.platform !== "shopee" && row.platform !== "tiktok") return fail("Chỉ shop Shopee / TikTok Shop mới đồng bộ đơn");
  if (row.accountId.startsWith("pending_")) return fail("Shop chưa uỷ quyền xong. Bấm “Kết nối qua sàn” trước.", 409);
  const result = await syncShop(row);
  const fresh = await db.channelAccount.findUnique({ where: { id: row.id } });
  return ok({ result, item: fresh ? accountDTO(fresh) : null }, result.ok ? 200 : 502);
}
