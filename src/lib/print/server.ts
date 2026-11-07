// Phía server của mẫu in: chọn mẫu theo loại chứng từ, thông tin công ty để in.
import { db } from "@/lib/db";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { builtinLayout, parseLayout, type Block, type DocType, type PrintCompany } from "./blocks";

export type TemplateLite = { id: string; name: string; isDefault: boolean };

/**
 * Mẫu dùng để in: ?t=id nếu thuộc workspace và đúng loại, không thì mẫu mặc định của loại,
 * không có thì mẫu gốc (builtin). Trả kèm danh sách mẫu cho ô chọn trên trang in.
 */
export async function templateFor(workspaceId: string, docType: DocType, templateId?: string | null): Promise<{ layout: Block[]; current: string; templates: TemplateLite[] }> {
  const rows = await db.printTemplate.findMany({ where: { workspaceId, docType }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  const templates = rows.map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault }));
  if (templateId === "builtin") return { layout: builtinLayout(docType), current: "builtin", templates };
  const row = (templateId && rows.find((r) => r.id === templateId)) || rows.find((r) => r.isDefault);
  if (!row) return { layout: builtinLayout(docType), current: "builtin", templates };
  return { layout: parseLayout(row.layoutJson, docType), current: row.id, templates };
}

/** Thông tin doanh nghiệp để in; tên trống thì lấy tên doanh nghiệp trong DNA / tên workspace. */
export async function printCompany(workspaceId: string, fallbackName = ""): Promise<PrintCompany & { quoteTerms: string }> {
  const c = await getPref<Company>(workspaceId, "company", COMPANY_DEFAULT);
  return { ...c, name: c.name || fallbackName };
}

/** Đặt một mẫu làm mặc định của loại (bỏ mặc định các mẫu khác cùng loại). */
export async function setDefaultTemplate(workspaceId: string, docType: DocType, id: string | null) {
  await db.printTemplate.updateMany({ where: { workspaceId, docType, isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
  if (id) await db.printTemplate.updateMany({ where: { workspaceId, id }, data: { isDefault: true } });
}
