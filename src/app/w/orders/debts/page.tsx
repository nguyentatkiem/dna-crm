import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { dmy, money, overdue, remaining } from "@/lib/sales/shared";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { DueBadge } from "@/components/sales/Status";

/** Công nợ phải thu theo khách: khách có nợ quá hạn lên đầu, rồi theo số nợ giảm dần. */
export default async function DebtsPage() {
  const { scope } = await salesPage();
  if (!scope.perm.debtView) redirect("/w/orders");
  const orders = await db.order.findMany({ where: scoped(scope.where, { status: { not: "cancelled" } }), orderBy: { createdAt: "asc" }, take: 5000 });
  const open = orders.filter((o) => remaining(o) > 0);
  type G = { key: string; name: string; phone: string; contactId: string | null; debt: number; overdue: number; oldestDue: Date | null; orders: typeof open };
  const groups = new Map<string, G>();
  for (const o of open) {
    const key = o.contactId || `name:${o.customerName.trim().toLowerCase()}|${o.customerPhone}`;
    const g = groups.get(key) ?? { key, name: o.customerName, phone: o.customerPhone, contactId: o.contactId, debt: 0, overdue: 0, oldestDue: null, orders: [] };
    g.debt += remaining(o);
    if (overdue(o)) g.overdue += remaining(o);
    if (o.dueAt && (!g.oldestDue || o.dueAt < g.oldestDue)) g.oldestDue = o.dueAt;
    g.orders.push(o);
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => (b.overdue > 0 ? 1 : 0) - (a.overdue > 0 ? 1 : 0) || b.overdue - a.overdue || b.debt - a.debt);
  const total = rows.reduce((s, g) => s + g.debt, 0);
  const totalOver = rows.reduce((s, g) => s + g.overdue, 0);

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/orders" className="text-[13px] text-ink-2 hover:underline">
        ← Đơn hàng
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Công nợ phải thu</h1>
      <p className="mt-1 text-ink-2">Tổng hợp theo khách từ các đơn còn nợ (không tính đơn huỷ).</p>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-xl">
        <div className="card min-w-0 p-3">
          <p className="label truncate">Còn phải thu</p>
          <p className="mt-0.5 truncate text-[17px] font-semibold tnum">{money(total)}</p>
        </div>
        <div className="card min-w-0 p-3">
          <p className="label truncate">Quá hạn</p>
          <p className={`mt-0.5 truncate text-[17px] font-semibold tnum ${totalOver ? "text-danger" : ""}`}>{money(totalOver)}</p>
        </div>
        <div className="card min-w-0 p-3">
          <p className="label truncate">Khách nợ</p>
          <p className="mt-0.5 text-[17px] font-semibold tnum">{rows.length}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-4">
          <EmptyState icon="wallet" title="Không còn công nợ" desc="Mọi đơn hàng đã thu đủ tiền." />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((g) => (
            <section key={g.key} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {g.contactId ? (
                      <Link href={`/w/b/contacts?open=${g.contactId}`} className="hover:underline">
                        {g.name}
                      </Link>
                    ) : (
                      g.name
                    )}
                  </p>
                  <p className="text-[13px] text-ink-2 tnum">{g.phone || "–"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[17px] font-semibold text-danger tnum">{money(g.debt)}</p>
                  {g.overdue > 0 && <p className="text-[12.5px] text-danger">Quá hạn {money(g.overdue)}</p>}
                </div>
              </div>
              <ul className="mt-2 grid divide-y divide-line-soft border-t border-line-soft">
                {g.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13.5px]">
                    <Link href={`/w/orders/${o.id}`} className="font-medium tnum hover:underline">
                      {o.number}
                    </Link>
                    <span className="text-ink-2 tnum">
                      {money(o.paid)} / {money(o.total)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {o.dueAt ? <span className="text-[12.5px] text-ink-2 tnum">Hạn {dmy(o.dueAt)}</span> : <span className="text-[12.5px] text-ink-2">Chưa đặt hạn</span>}
                      <DueBadge at={o.dueAt} />
                      <span className="font-medium tnum">{money(remaining(o))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-4 flex items-center gap-1 text-[12.5px] text-ink-2">
        <Icon name="bell" size={13} /> Đơn quá hạn còn nợ được nhắc tự động mỗi ngày cho người tạo đơn và quản lý.
      </p>
    </div>
  );
}
