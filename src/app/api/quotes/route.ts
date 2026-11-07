import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counter";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { docScope, linkedTo, notifyManagers, scoped, resolveLinks } from "@/lib/sales/access";
import { totals } from "@/lib/sales/lines";
import { stampDocLines } from "@/lib/sales/tier-pricing";
import { QuoteInput, firstError } from "@/lib/sales/schemas";
import { QUOTE_STATUSES, fold } from "@/lib/sales/shared";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const s = await docScope(a.ctx);
  const status = sp.get("status") ?? "";
  const record = sp.get("record") ?? "";
  const q = fold(sp.get("q")?.trim() ?? "");
  const extra = {
    ...(record ? linkedTo(record) : {}),
    // "expired" là trạng thái suy ra từ validUntil, lọc ở dưới.
    ...(status && status !== "expired" && QUOTE_STATUSES.includes(status as never) ? { status } : {}),
    ...(status === "expired" ? { status: { in: ["draft", "pending", "approved", "sent", "expired"] }, validUntil: { lt: new Date() } } : {}),
  };
  const rows = await db.quote.findMany({ where: scoped(s.where, extra), orderBy: { createdAt: "desc" }, take: 500 });
  const items = q ? rows.filter((r) => fold(`${r.number} ${r.customerName} ${r.customerPhone} ${r.title}`).includes(q)) : rows;
  return ok({ items });
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const s = await docScope(a.ctx);
  if (!s.perm.create) return fail("Bạn chưa có quyền tạo báo giá", 403);
  const p = QuoteInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const wid = a.ctx.workspace.id;
  const links = await resolveLinks(a.ctx, d);
  // Ghi giá niêm yết + quy tắc giá theo hạng đúng thực tế (client không giả được nhãn "giá hạng").
  const items = await stampDocLines(a.ctx.workspace.id, links.contactId, d.items);
  const t = totals(items, d.discount);
  const company = await getPref<Company>(wid, "company", COMPANY_DEFAULT);
  // Quản lý bấm "Lưu & duyệt" thì duyệt luôn; nhân viên bấm "Gửi duyệt" thì chờ duyệt.
  const status = d.intent === "submit" ? (s.perm.approve ? "approved" : "pending") : "draft";
  const number = await nextNumber(wid, "BG");
  const quote = await db.quote.create({
    data: {
      workspaceId: wid,
      number,
      ...links,
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      customerEmail: d.customerEmail,
      title: d.title,
      status,
      itemsJson: JSON.stringify(items),
      ...t,
      validUntil: d.validUntil ?? new Date(Date.now() + 15 * 864e5),
      note: d.note,
      terms: d.terms || company.quoteTerms,
      createdBy: a.ctx.user.name,
      ...(status === "approved" ? { approvedBy: a.ctx.user.name, approvedAt: new Date() } : {}),
    },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "quote.create", "quote", quote.id, `Tạo báo giá ${number} cho ${quote.customerName} (${quote.total.toLocaleString("vi-VN")} ₫)`);
  if (status === "pending") await notifyManagers(wid, quote.id, `${a.ctx.user.name} gửi duyệt báo giá ${number} (${quote.customerName})`);
  return ok(quote, 201);
}

