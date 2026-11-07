// Khung trang in nội bộ (báo giá / đơn hàng / hợp đồng): thanh công cụ không in + vùng A4 dựng bằng mẫu.
import Link from "next/link";
import { PrintButton } from "@/components/sales/PrintButton";
import { PRINT_CSS } from "@/components/sales/print";
import type { Block, BlockType, PrintCompany, PrintData } from "./blocks";
import { PrintDoc, TEMPLATE_PRINT_CSS } from "./render";
import type { TemplateLite } from "./server";
import { TemplatePicker } from "./TemplatePicker";

export function PrintPage({ back, data, company, layout, templates, current, hide, canEditTemplates, docType }: { back: { href: string; label: string }; data: PrintData; company: PrintCompany; layout: Block[]; templates: TemplateLite[]; current: string; hide?: BlockType[]; canEditTemplates?: boolean; docType: string }) {
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <style>{PRINT_CSS + TEMPLATE_PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <Link href={back.href} className="text-[13px] text-ink-2 hover:underline">
          ← {back.label}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <TemplatePicker templates={templates} current={current} />
          {canEditTemplates && (
            <Link href={`/w/settings/print-templates?type=${docType}`} className="btn-ghost h-8 text-[13px]">
              Sửa mẫu
            </Link>
          )}
          <PrintButton />
        </div>
      </div>
      <div className="print-area mx-auto max-w-[210mm] rounded-lg border border-line-soft bg-surface p-5 sm:p-10">
        <PrintDoc layout={layout} data={data} company={company} hide={hide} />
      </div>
    </div>
  );
}
