// Dữ liệu mã QR của một đơn (server): gán payCode nếu thiếu, tính số tiền còn lại, dựng payload VietQR.
import type { Order } from "@prisma/client";
import { remaining } from "@/lib/sales/shared";
import { bankByBin } from "./banks";
import { ensurePayCode } from "./reconcile";
import { bankConfigured, paySettings } from "./settings";
import { buildVietQR } from "./vietqr";

export type QrData = {
  configured: boolean;
  payload: string;
  bank: string;
  bankBin: string;
  accountNo: string;
  accountName: string;
  amount: number;
  payCode: string;
  orderNumber: string;
  paid: boolean;
  remaining: number;
};

export async function qrDataFor(order: Order, amountOverride?: number): Promise<QrData> {
  const s = await paySettings(order.workspaceId);
  const payCode = await ensurePayCode(order, s.payCodePrefix);
  const left = remaining(order);
  const amount = amountOverride && amountOverride > 0 ? Math.round(amountOverride) : left;
  const base = { bank: bankByBin(s.bankBin)?.short ?? s.bankBin, bankBin: s.bankBin, accountNo: s.accountNo, accountName: s.accountName, amount, payCode, orderNumber: order.number, paid: left <= 0 && order.status !== "cancelled", remaining: left };
  if (!bankConfigured(s)) return { ...base, configured: false, payload: "" };
  let payload = "";
  try {
    payload = buildVietQR({ bin: s.bankBin, accountNo: s.accountNo, accountName: s.accountName, amount, addInfo: payCode });
  } catch {
    return { ...base, configured: false, payload: "" };
  }
  return { ...base, configured: true, payload };
}
