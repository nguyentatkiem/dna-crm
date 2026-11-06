import type { Metadata } from "next";
import { db } from "@/lib/db";
import { CsatForm } from "./CsatForm";

export const metadata: Metadata = { title: "Đánh giá hỗ trợ", robots: { index: false } };

export default async function CsatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await db.ticket.findUnique({ where: { csatToken: token }, select: { number: true, subject: true, status: true, csat: true, workspace: { select: { name: true } } } });
  const valid = t && (t.status === "resolved" || t.status === "closed");
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[460px] rounded-xl bg-surface p-6 shadow-card sm:p-8">
        {!valid ? (
          <>
            <h1 className="text-[22px] font-semibold">Liên kết không còn hiệu lực</h1>
            <p className="mt-2 text-[14px] text-ink-2">Liên kết khảo sát này không tồn tại hoặc yêu cầu chưa được xử lý xong.</p>
          </>
        ) : (
          <>
            <p className="label">{t.workspace.name}</p>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight">Bạn hài lòng với hỗ trợ của chúng tôi chứ?</h1>
            <p className="mt-1 break-words text-[14px] text-ink-2">
              Yêu cầu {t.number}: {t.subject}
            </p>
            <CsatForm token={token} done={t.csat != null} />
          </>
        )}
      </div>
    </main>
  );
}
