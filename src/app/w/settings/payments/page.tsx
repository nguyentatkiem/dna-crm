import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { payPerm } from "@/lib/pay/access";
import { BANKS } from "@/lib/pay/banks";
import { Icon } from "@/components/Icon";
import { PaymentsSettings } from "./PaymentsSettings";

export const metadata = { title: "Thanh toán & giao hàng" };

export default async function PaymentsSettingsPage() {
  const ctx = await requireApp();
  if (!(await payPerm(ctx)).settings) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="lock" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Cần quyền “Cài đặt nâng cao” hoặc “Đối soát chuyển khoản”</p>
        <Link href="/w/settings" className="btn-outline mt-4">
          Về Cài đặt
        </Link>
      </div>
    );
  }
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="text-[13px] text-ink-2 hover:underline">
        ← Cài đặt
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Thanh toán & giao hàng</h1>
      <p className="mt-1 text-ink-2">Mã VietQR cho đơn, tự đối soát chuyển khoản (Casso, SePay), hoá đơn điện tử và hãng vận chuyển.</p>
      <PaymentsSettings banks={BANKS} />
    </div>
  );
}
