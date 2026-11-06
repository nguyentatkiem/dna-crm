import { db, parseJson } from "@/lib/db";
import { appApi, ok } from "@/lib/http";
import { getRole, recordScope } from "@/lib/permissions";
import { getPrivacy, maskPhoneFor } from "@/lib/privacy";
import { color } from "@/lib/colors";

/** Bỏ dấu, chữ thường để tìm không phân biệt dấu ("nguyen" khớp "Nguyễn"). */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
const digits = (s: string) => s.replace(/\D/g, "");

const LIMIT = 20;

/** Tìm nhanh cho bảng lệnh Ctrl+K: khách, giao dịch, lịch hẹn (theo tên, SĐT) và tài liệu. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { config } = a.ctx;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return ok({ records: [], docs: [] });

  const fq = fold(q);
  let dq = digits(q);
  if (dq.startsWith("84") && dq.length >= 9) dq = "0" + dq.slice(2);
  const phoneQuery = dq.length >= 3 && dq.length >= q.replace(/[\s.+-]/g, "").length - 1;
  const scope = await recordScope(a.ctx);
  const select = { id: true, title: true, objectKey: true, status: true, dataJson: true, amount: true, ownerName: true } as const;

  // SQLite không có tìm không phân biệt hoa thường cho tiếng Việt: lấy các mục gần đây rồi lọc bỏ dấu.
  const [recent, byPhone] = await Promise.all([
    db.record.findMany({ where: scope, select, orderBy: { updatedAt: "desc" }, take: 3000 }),
    phoneQuery ? db.record.findMany({ where: { AND: [scope, { dataJson: { contains: dq.slice(-7) } }] }, select, take: 50 }) : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const hits: { rank: number; r: (typeof recent)[number]; phone: string }[] = [];
  for (const r of [...byPhone, ...recent]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const obj = config.objects.find((o) => o.key === r.objectKey);
    const data = parseJson<Record<string, unknown>>(r.dataJson, {});
    const phoneKeys = obj?.fields.filter((f) => f.type === "phone").map((f) => f.key) ?? [];
    const phone = phoneKeys.map((k) => String(data[k] ?? "")).find(Boolean) ?? "";
    const title = fold(r.title);
    let rank = -1;
    if (title.startsWith(fq)) rank = 0;
    else if (title.includes(fq)) rank = 1;
    else if (phoneQuery && phoneKeys.some((k) => digits(String(data[k] ?? "")).includes(dq))) rank = 0;
    else if (fq.length >= 3 && fold(Object.values(data).filter((v) => typeof v === "string").join(" ")).includes(fq)) rank = 2;
    if (rank >= 0) hits.push({ rank, r, phone });
  }
  hits.sort((x, y) => x.rank - y.rank);

  const [role, prefs] = await Promise.all([getRole(a.ctx.user.id, a.ctx.workspace.id), getPrivacy(a.ctx.workspace.id)]);
  const records = hits.slice(0, LIMIT).map(({ r, phone }) => {
    const obj = config.objects.find((o) => o.key === r.objectKey);
    const st = obj?.statuses.find((s) => s.key === r.status);
    return {
      id: r.id,
      title: r.title,
      objectKey: r.objectKey,
      objectLabel: obj?.label ?? r.objectKey,
      status: st?.label ?? r.status,
      color: color(st?.color).bg,
      phone: maskPhoneFor(role, prefs, phone),
      amount: r.amount,
      owner: r.ownerName,
      href: `/w/b/${r.objectKey}?open=${r.id}`,
    };
  });

  // Tài liệu: theo tiêu đề và nội dung; tài liệu gắn khách thì chỉ hiện khi người dùng thấy được khách đó.
  const docTable = db.doc as typeof db.doc | undefined;
  const docRows = !docTable ? [] : await docTable.findMany({ where: { workspaceId: a.ctx.workspace.id }, select: { id: true, title: true, contentText: true, recordId: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 500 });
  let docs = docRows
    .map((d) => {
      const t = fold(d.title);
      const body = fold(d.contentText);
      const at = body.indexOf(fq);
      const rank = t.startsWith(fq) ? 0 : t.includes(fq) ? 1 : at >= 0 ? 2 : -1;
      const snippet = at >= 0 ? (at > 30 ? "…" : "") + d.contentText.slice(Math.max(0, at - 30), at + 70).replace(/\s+/g, " ").trim() : d.contentText.slice(0, 90).replace(/\s+/g, " ").trim();
      return { rank, id: d.id, title: d.title || "Tài liệu chưa đặt tên", snippet, recordId: d.recordId, href: `/w/docs/${d.id}` };
    })
    .filter((d) => d.rank >= 0)
    .sort((x, y) => x.rank - y.rank);
  const linked = docs.filter((d) => d.recordId).map((d) => d.recordId as string);
  if (linked.length && "OR" in scope) {
    const visible = new Set((await db.record.findMany({ where: { AND: [scope, { id: { in: linked } }] }, select: { id: true } })).map((r) => r.id));
    docs = docs.filter((d) => !d.recordId || visible.has(d.recordId));
  }

  return ok({ records, docs: docs.slice(0, 8).map(({ rank: _r, recordId: _x, ...d }) => d) });
}
