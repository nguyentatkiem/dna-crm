import { requireApp } from "@/lib/auth";
import { DOC_TEMPLATES, listDocs } from "@/lib/docs";
import { DocsList } from "./DocsClient";

export default async function DocsPage() {
  const ctx = await requireApp();
  const docs = await listDocs(ctx);
  // Chỉ gửi đoạn đầu nội dung xuống trình duyệt; tìm kiếm sâu gọi API theo contentText.
  const light = docs.map((d) => ({ ...d, contentText: d.contentText.slice(0, 600) }));
  const boards = Object.fromEntries(ctx.config.objects.map((o) => [o.key, o.itemLabel]));
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Tài liệu</h1>
      <p className="mt-1 max-w-3xl text-ink-2">Kịch bản tư vấn, biên bản, báo giá, quy trình… soạn ngay trong CRM. Tài liệu gắn khách hiện cả trong panel chi tiết của khách.</p>
      <DocsList initial={light} templates={DOC_TEMPLATES.map(({ key, title, hint }) => ({ key, title, hint }))} boards={boards} />
    </div>
  );
}
