import { requireApp } from "@/lib/auth";
import { LoyaltyClient } from "./LoyaltyClient";

export default async function LoyaltyPage() {
  await requireApp();
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Tích điểm & hạng thành viên</h1>
      <p className="mt-1 text-ink-2">Khách tự được cộng điểm khi đơn hàng hoàn tất. Hạng xét theo tổng điểm đã tích, đổi quà không làm tụt hạng.</p>
      <LoyaltyClient />
    </div>
  );
}
