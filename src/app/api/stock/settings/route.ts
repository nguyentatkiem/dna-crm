import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { allow, getAccess } from "@/lib/permissions";
import { saveStockPref, stockPref } from "@/lib/stock/server";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await stockPref(a.ctx.workspace.id));
}

const Body = z.object({ allowNegative: z.boolean(), lowStockAlert: z.boolean() });

export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await getAccess(a.ctx.user.id, a.ctx.workspace.id), "stock_manage")) return fail("Bạn chưa có quyền “Nhập, xuất, kiểm kho”", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Cấu hình kho không hợp lệ");
  const v = await saveStockPref(a.ctx.workspace.id, p.data);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "stock.settings", "stock", "", `Cấu hình kho: ${v.allowNegative ? "cho" : "không cho"} bán âm kho, ${v.lowStockAlert ? "bật" : "tắt"} cảnh báo sắp hết`);
  return ok(v);
}
