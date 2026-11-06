import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counter";
import { docScope, linkedTo, resolveLinks, scoped } from "@/lib/sales/access";
import { ContractInput, firstError } from "@/lib/sales/schemas";
import { CONTRACT_STATUSES, fold } from "@/lib/sales/shared";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const s = await docScope(a.ctx);
  const status = sp.get("status") ?? "";
  const record = sp.get("record") ?? "";
  const q = fold(sp.get("q")?.trim() ?? "");
  const extra = { ...(record ? linkedTo(record) : {}), ...(CONTRACT_STATUSES.includes(status as never) ? { status } : {}) };
  const rows = await db.contract.findMany({ where: scoped(s.where, extra), take: 1000 });
  const items = (q ? rows.filter((c) => fold(`${c.number} ${c.title} ${c.customerName}`).includes(q)) : rows).sort(byExpiry);
  return ok({ items });
}

/** Sắp hết hạn lên đầu: hiệu lực có endAt gần nhất → hiệu lực không hạn → nháp → hết hạn/huỷ. */
function byExpiry(a: { status: string; endAt: Date | null; createdAt: Date }, b: { status: string; endAt: Date | null; createdAt: Date }) {
  const rank = (c: typeof a) => (c.status === "active" ? (c.endAt ? 0 : 1) : c.status === "draft" ? 2 : 3);
  return rank(a) - rank(b) || (a.endAt?.getTime() ?? 0) - (b.endAt?.getTime() ?? 0) || b.createdAt.getTime() - a.createdAt.getTime();
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const s = await docScope(a.ctx);
  if (!s.perm.contract) return fail("Bạn chưa có quyền tạo hợp đồng", 403);
  const p = ContractInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const wid = a.ctx.workspace.id;
  const order = d.orderId ? await db.order.findFirst({ where: scoped(s.where, { id: d.orderId }) }) : null;
  const number = await nextNumber(wid, "HD");
  const c = await db.contract.create({
    data: {
      workspaceId: wid,
      number,
      ...(await resolveLinks(a.ctx, { contactId: d.contactId ?? order?.contactId, recordId: d.recordId ?? order?.recordId })),
      orderId: order?.id ?? null,
      title: d.title,
      customerName: d.customerName || order?.customerName || "",
      value: d.value || order?.total || 0,
      status: d.status,
      signedAt: d.signedAt ?? null,
      startAt: d.startAt ?? null,
      endAt: d.endAt ?? null,
      remindDays: d.remindDays,
      fileUrl: d.fileUrl,
      note: d.note,
      createdBy: a.ctx.user.name,
    },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "contract.create", "contract", c.id, `Tạo hợp đồng ${number} “${c.title}”`);
  return ok(c, 201);
}
