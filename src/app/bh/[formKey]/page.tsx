import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LookupForm } from "./LookupForm";

export const metadata: Metadata = { title: "Tra cứu bảo hành", robots: { index: false } };

export default async function WarrantyLookupPage({ params }: { params: Promise<{ formKey: string }> }) {
  const { formKey } = await params;
  const ws = await db.workspace.findUnique({ where: { formKey }, select: { name: true } });
  if (!ws) notFound();
  return (
    <main className="grid min-h-screen place-items-start bg-bg px-4 py-10 sm:place-items-center">
      <div className="mx-auto w-full max-w-[520px] rounded-xl bg-surface p-6 shadow-card sm:p-8">
        <p className="label">{ws.name}</p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight">Tra cứu bảo hành</h1>
        <p className="mt-1 text-[14px] text-ink-2">Nhập số điện thoại bạn dùng khi mua hàng để xem các sản phẩm đang được bảo hành.</p>
        <LookupForm formKey={formKey} />
      </div>
    </main>
  );
}
