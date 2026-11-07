import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { canManageKb, createDocs, DocInput } from "@/lib/kb/api";
import { kbDTO, retrieve, syncProducts } from "@/lib/kb/store";
import { fold, maskPII } from "@/lib/kb/text";
import { ai } from "@/lib/ai";

const KINDS: Record<string, string[]> = { faq: ["faq", "conversation"], docs: ["doc", "policy"], product: ["product"] };

/** Danh sách mục kho (?tab=faq|docs|product&q=). Mọi người xem được; ?q= xếp theo độ liên quan (BM25) rồi khớp chữ. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const sp = new URL(req.url).searchParams;
  const tab = sp.get("tab") ?? "faq";
  const q = (sp.get("q") ?? "").trim().slice(0, 200);
  if (tab === "product") await syncProducts(wid).catch(() => undefined);
  const where: Prisma.KbDocWhereInput = { workspaceId: wid, kind: { in: KINDS[tab] ?? KINDS.faq } };
  const [rows, counts, canManage] = await Promise.all([
    db.kbDoc.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: 1000 }),
    db.kbDoc.groupBy({ by: ["kind"], where: { workspaceId: wid }, _count: { _all: true } }),
    canManageKb(a.ctx),
  ]);
  let items = rows.map(kbDTO);
  if (q) {
    const rank = new Map((await retrieve(wid, q, 50)).map((h, i) => [h.docId, i]));
    const fq = fold(q);
    items = items
      .filter((d) => rank.has(d.id) || fold(`${d.title} ${d.content} ${d.tags.join(" ")}`).includes(fq))
      .sort((x, y) => (rank.get(x.id) ?? 999) - (rank.get(y.id) ?? 999));
  }
  const c = Object.fromEntries(counts.map((r) => [r.kind, r._count._all]));
  return ok({
    items,
    canManage,
    aiAvailable: !!ai(),
    counts: { faq: (c.faq ?? 0) + (c.conversation ?? 0), docs: (c.doc ?? 0) + (c.policy ?? 0), product: c.product ?? 0 },
  });
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  const p = DocInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  // Lưu từ Hộp thư ("Thêm vào kho"): che SĐT/email/địa chỉ của khách.
  const input = p.data.source?.startsWith("inbox:") ? { ...p.data, title: maskPII(p.data.title), content: maskPII(p.data.content) } : p.data;
  await createDocs(a.ctx, [input]);
  const doc = await db.kbDoc.findFirst({ where: { workspaceId: a.ctx.workspace.id, title: input.title }, orderBy: { createdAt: "desc" } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "kb.create", "kb", doc?.id ?? "", `Thêm vào kho: ${input.title.slice(0, 80)}`);
  return ok({ item: doc ? kbDTO(doc) : null });
}
