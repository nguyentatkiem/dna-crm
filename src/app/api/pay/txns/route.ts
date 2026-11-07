// Giao dịch ngân hàng: danh sách (lọc trạng thái), ghép tay, bỏ qua / khôi phục, giả lập (chỉ chạy khô / dev).
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { payPerm } from "@/lib/pay/access";
import { manualMatch, receiveTxns, setIgnored, txnNote } from "@/lib/pay/reconcile";
import { fold } from "@/lib/sales/shared";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).reconcile) return fail("Bạn chưa có quyền đối soát chuyển khoản", 403);
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") ?? "";
  const q = fold(sp.get("q")?.trim() ?? "");
  const wid = a.ctx.workspace.id;
  const rows = await db.bankTxn.findMany({ where: { workspaceId: wid, ...(["matched", "unmatched", "ignored"].includes(status) ? { status } : {}) }, orderBy: { at: "desc" }, take: 500 });
  const items = rows.filter((t) => !q || fold(`${t.content} ${t.externalId} ${t.amount}`).includes(q));
  const ids = [...new Set(items.map((t) => t.orderId).filter((x): x is string => !!x))];
  const orders = ids.length ? await db.order.findMany({ where: { workspaceId: wid, id: { in: ids } }, select: { id: true, number: true, customerName: true } }) : [];
  const om = new Map(orders.map((o) => [o.id, o]));
  const counts = await db.bankTxn.groupBy({ by: ["status"], where: { workspaceId: wid }, _count: true });
  return ok({
    items: items.map((t) => ({ id: t.id, provider: t.provider, externalId: t.externalId, amount: t.amount, content: t.content, accountNo: t.accountNo, at: t.at, status: t.status, orderId: t.orderId, order: t.orderId ? (om.get(t.orderId) ?? null) : null, note: txnNote(t) })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("match"), txnId: z.string().min(1), orderId: z.string().min(1), amount: z.coerce.number().positive().optional() }),
  z.object({ action: z.literal("ignore"), txnId: z.string().min(1) }),
  z.object({ action: z.literal("restore"), txnId: z.string().min(1) }),
  z.object({ action: z.literal("simulate"), amount: z.coerce.number().positive().max(1e11), content: z.string().max(300) }),
]);

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).reconcile) return fail("Bạn chưa có quyền đối soát chuyển khoản", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  const wid = a.ctx.workspace.id;
  if (d.action === "match") {
    const r = await manualMatch(wid, d.txnId, d.orderId, a.ctx.user, d.amount);
    return "error" in r ? fail(r.error, 409) : ok(r);
  }
  if (d.action === "ignore" || d.action === "restore") {
    const r = await setIgnored(wid, d.txnId, d.action === "ignore", a.ctx.user);
    return "error" in r ? fail(r.error ?? "Không thực hiện được", 409) : ok(r);
  }
  // Giả lập một giao dịch đến (chỉ khi chạy khô hoặc môi trường dev) để thử luồng tự đối soát không cần ngân hàng thật.
  if (process.env.PAY_DRY_RUN !== "1" && process.env.NODE_ENV === "production") return fail("Chỉ giả lập được khi PAY_DRY_RUN=1", 403);
  const [r] = await receiveTxns(wid, [{ provider: "manual", externalId: `SIM-${Date.now().toString(36).toUpperCase()}`, amount: Math.round(d.amount), content: d.content, accountNo: "", at: new Date(), raw: { simulated: true, by: a.ctx.user.name } }]);
  return ok(r, 201);
}
