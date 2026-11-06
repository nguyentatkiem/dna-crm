import type { Metadata } from "next";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = { title: "Mất kết nối · DNA CRM" };
// Trang tĩnh để service worker lưu sẵn và hiện khi không có mạng.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-bg px-4 text-ink">
      <div className="card w-full max-w-sm p-8 text-center shadow-panel">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-[26px] font-bold text-white" style={{ background: "linear-gradient(135deg,#0073ea,#a25ddc)" }} aria-hidden>
          D
        </span>
        <h1 className="mt-4 text-[20px] font-semibold">Bạn đang ngoại tuyến</h1>
        <p className="mt-2 text-[14px] text-ink-2">Không kết nối được tới máy chủ DNA CRM. Kiểm tra Wi‑Fi hoặc 4G rồi thử lại. Những trang đã mở gần đây vẫn xem được.</p>
        <RetryButton />
      </div>
    </main>
  );
}
