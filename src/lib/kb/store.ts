// Kho kiến thức phía server: đọc KbDoc, chỉ mục BM25 trong bộ nhớ (cache theo workspace), đồng bộ sản phẩm.
import type { KbDoc } from "@prisma/client";
import { db, parseJson } from "../db";
import { INDUSTRIES } from "../dna";
import { getPref } from "../prefs";
import { buildIndex, search, type Hit, type Index } from "./bm25";
import type { ShopVoice } from "./prompt";
import { KB_KINDS, type KbDocDTO, type KbKindKey } from "./shared";

/** Model rẻ/nhanh cho bot và gợi ý (đặt CLAUDE_FAST_MODEL để đổi). */
export const FAST_MODEL = process.env.CLAUDE_FAST_MODEL || "claude-haiku-5-5";

export function kbDTO(d: KbDoc): KbDocDTO {
  return {
    id: d.id,
    kind: (KB_KINDS as readonly string[]).includes(d.kind) ? (d.kind as KbKindKey) : "doc",
    title: d.title,
    content: d.content,
    tags: parseJson<string[]>(d.tagsJson, []),
    source: d.source,
    active: d.active,
    uses: d.uses,
    updatedAt: d.updatedAt.toISOString(),
    createdBy: d.createdBy,
  };
}

/* ───────────── Cache chỉ mục ───────────── */

type Entry = { stamp: string; index: Index; at: number };
const g = globalThis as unknown as { kbIndex?: Map<string, Entry> };
const cache = () => (g.kbIndex ??= new Map());

/** Dấu phiên bản rẻ: số tài liệu đang bật + lần sửa gần nhất. Đổi KbDoc ở bất kỳ tiến trình nào cũng làm mới chỉ mục. */
async function stampOf(workspaceId: string) {
  const a = await db.kbDoc.aggregate({ where: { workspaceId, active: true }, _count: { _all: true }, _max: { updatedAt: true } });
  return `${a._count._all}:${a._max.updatedAt?.getTime() ?? 0}`;
}

/** Xoá cache của workspace (gọi sau khi thêm/sửa/xoá KbDoc; dấu phiên bản cũng tự phát hiện thay đổi). */
export function invalidateKb(workspaceId: string) {
  cache().delete(workspaceId);
}

export async function kbIndex(workspaceId: string): Promise<Index> {
  const stamp = await stampOf(workspaceId);
  const hit = cache().get(workspaceId);
  if (hit && hit.stamp === stamp) return hit.index;
  const rows = await db.kbDoc.findMany({ where: { workspaceId, active: true }, select: { id: true, kind: true, title: true, content: true, tagsJson: true }, take: 5000 });
  const index = buildIndex(rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, content: r.content, tags: parseJson<string[]>(r.tagsJson, []) })));
  if (cache().size > 200) cache().clear();
  cache().set(workspaceId, { stamp, index, at: Date.now() });
  return index;
}

export async function retrieve(workspaceId: string, query: string, k = 5): Promise<Hit[]> {
  if (!query.trim()) return [];
  return search(await kbIndex(workspaceId), query, k);
}

/** Tăng lượt dùng mà không đổi updatedAt (để không làm mới chỉ mục mỗi lần dùng). */
export async function bumpUses(ids: string[]) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return;
  await Promise.all(uniq.map((id) => db.$executeRaw`UPDATE "KbDoc" SET "uses" = "uses" + 1 WHERE "id" = ${id}`)).catch(() => {});
}

/* ───────────── Giọng shop (DNA) ───────────── */

export async function shopVoice(workspaceId: string): Promise<ShopVoice> {
  const [dnaRow, company] = await Promise.all([
    db.dna.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    getPref<{ name?: string }>(workspaceId, "company", {}),
  ]);
  const dna = parseJson<{ businessName?: string; industry?: string; products?: string; targetCustomer?: string; tone?: string }>(dnaRow?.dataJson, {});
  const ind = dna.industry ? (INDUSTRIES[dna.industry as keyof typeof INDUSTRIES]?.label ?? dna.industry) : "";
  return { businessName: company.name || dna.businessName || "", industry: ind, products: dna.products, targetCustomer: dna.targetCustomer, tone: dna.tone };
}

/* ───────────── Sản phẩm → kho ───────────── */

const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

/** Nội dung FAQ-hoá của một sản phẩm (để bot/gợi ý trả lời trực tiếp được). */
export function productContent(p: { name: string; price: number; unit: string; description: string; warrantyMonths: number; category: string; vat: number }) {
  const parts = [`Dạ ${p.name} giá ${p.price > 0 ? `${money(p.price)}/${p.unit || "cái"}` : "liên hệ"}${p.vat ? ` (chưa gồm VAT ${p.vat}%)` : ""} ạ.`];
  if (p.description.trim()) parts.push(p.description.trim().slice(0, 800));
  if (p.warrantyMonths > 0) parts.push(`Bảo hành ${p.warrantyMonths} tháng.`);
  return parts.join(" ");
}

/**
 * Đồng bộ bảng Product → KbDoc kind "product" (source "product:<id>"): thêm mới, cập nhật nội dung khi đổi,
 * giữ nguyên lựa chọn bật/tắt của người dùng; sản phẩm ngừng bán/xoá thì xoá khỏi kho.
 */
export async function syncProducts(workspaceId: string): Promise<{ added: number; updated: number; removed: number }> {
  const [products, docs] = await Promise.all([
    db.product.findMany({ where: { workspaceId, active: true }, take: 2000 }),
    db.kbDoc.findMany({ where: { workspaceId, kind: "product" } }),
  ]);
  const byId = new Map(docs.map((d) => [d.source.replace(/^product:/, ""), d]));
  let added = 0;
  let updated = 0;
  for (const p of products) {
    const title = p.code ? `${p.name} (${p.code})` : p.name;
    const content = productContent(p);
    const tagsJson = JSON.stringify(p.category ? [p.category] : []);
    const d = byId.get(p.id);
    if (!d) {
      await db.kbDoc.create({ data: { workspaceId, kind: "product", title, content, tagsJson, source: `product:${p.id}`, createdBy: "Đồng bộ sản phẩm" } });
      added++;
    } else if (d.title !== title || d.content !== content || d.tagsJson !== tagsJson) {
      await db.kbDoc.update({ where: { id: d.id }, data: { title, content, tagsJson } });
      updated++;
    }
    byId.delete(p.id);
  }
  const stale = [...byId.values()].map((d) => d.id);
  if (stale.length) await db.kbDoc.deleteMany({ where: { id: { in: stale }, workspaceId } });
  if (added || updated || stale.length) invalidateKb(workspaceId);
  return { added, updated, removed: stale.length };
}
