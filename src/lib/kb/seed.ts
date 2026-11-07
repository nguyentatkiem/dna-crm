// Dữ liệu mẫu kho kiến thức. Gọi lại nhiều lần không tạo trùng (so theo tiêu đề của mục source "seed").
import { db, parseJson } from "../db";
import { genericFaq, SPA_FAQ, SPA_POLICIES } from "./seed-data";
import { invalidateKb, syncProducts } from "./store";

export async function seedKb(workspaceId: string): Promise<{ created: number }> {
  const dnaRow = await db.dna.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  const dna = parseJson<{ industry?: string; businessName?: string }>(dnaRow?.dataJson, {});
  const spa = !dna.industry || dna.industry === "spa";
  const faq = spa ? SPA_FAQ : genericFaq(dna.businessName ?? "");
  const docs = spa ? SPA_POLICIES : [];
  const have = await db.kbDoc.findMany({ where: { workspaceId, source: "seed" }, select: { id: true, title: true, content: true, createdAt: true, updatedAt: true } });
  const existing = new Set(have.map((d) => d.title));
  // Mục mẫu chưa ai sửa (updatedAt ≈ createdAt) được cập nhật theo bản mẫu mới; mục đã sửa giữ nguyên.
  const fresh = new Map<string, string>([...faq.map((f) => [f.q, f.a] as [string, string]), ...docs.map((d) => [d.title, d.content] as [string, string])]);
  for (const d of have) {
    const next = fresh.get(d.title);
    if (next && next !== d.content && d.updatedAt.getTime() - d.createdAt.getTime() < 2000) await db.kbDoc.update({ where: { id: d.id }, data: { content: next, createdAt: new Date(), updatedAt: new Date() } });
  }
  const rows = [
    ...faq.map((f) => ({ workspaceId, kind: "faq", title: f.q, content: f.a, tagsJson: JSON.stringify(f.tags), source: "seed", createdBy: "Dữ liệu mẫu" })),
    ...docs.map((d) => ({ workspaceId, kind: d.kind, title: d.title, content: d.content, tagsJson: JSON.stringify(d.tags), source: "seed", createdBy: "Dữ liệu mẫu" })),
  ].filter((r) => !existing.has(r.title));
  if (rows.length) await db.kbDoc.createMany({ data: rows });
  await syncProducts(workspaceId).catch(() => undefined);
  invalidateKb(workspaceId);
  return { created: rows.length };
}
