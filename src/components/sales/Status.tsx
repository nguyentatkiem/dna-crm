// Nhãn trạng thái chứng từ. Dùng được ở server và client.
import { Badge } from "@/components/ui/Badge";
import { CONTRACT_STATUS, ORDER_STATUS, QUOTE_STATUS, daysLeft, quoteStatusOf, type ContractStatus, type OrderStatus } from "@/lib/sales/shared";

export function QuoteBadge({ q }: { q: { status: string; validUntil: string | Date | null } }) {
  const st = QUOTE_STATUS[quoteStatusOf(q)] ?? QUOTE_STATUS.draft;
  return <Badge tone={st.tone}>{st.label}</Badge>;
}

export function OrderBadge({ status }: { status: string }) {
  const st = ORDER_STATUS[status as OrderStatus] ?? ORDER_STATUS.new;
  return <Badge tone={st.tone}>{st.label}</Badge>;
}

export function ContractBadge({ status }: { status: string }) {
  const st = CONTRACT_STATUS[status as ContractStatus] ?? CONTRACT_STATUS.draft;
  return <Badge tone={st.tone}>{st.label}</Badge>;
}

/** "Còn 5 ngày" / "Quá hạn 2 ngày" cho hạn hiệu lực, hạn thanh toán, ngày hết hợp đồng. */
export function DueBadge({ at, warnDays = 3, done }: { at: string | Date | null; warnDays?: number; done?: boolean }) {
  const d = daysLeft(at);
  if (d === null || done) return null;
  if (d < 0) return <Badge tone="danger">Quá hạn {-d} ngày</Badge>;
  if (d === 0) return <Badge tone="warning">Hết hạn hôm nay</Badge>;
  if (d <= warnDays) return <Badge tone="warning">Còn {d} ngày</Badge>;
  return <Badge>Còn {d} ngày</Badge>;
}
