import type { Doc } from "@prisma/client";
import type { WorkspaceConfig } from "./config/schema";
import { db } from "./db";
import { recordScope } from "./permissions";

// Tài liệu (Tiptap/ProseMirror JSON) gắn khách hoặc dùng chung. Chỉ dùng phía server;
// component trình duyệt chỉ import type từ file này.

export type PMMark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: PMMark[] };

export type DocDTO = {
  id: string;
  title: string;
  recordId: string | null;
  recordTitle: string;
  recordObject: string;
  contentText: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export function toDocDTO(d: Doc, rec?: { title: string; objectKey: string } | null): DocDTO {
  return {
    id: d.id,
    title: d.title,
    recordId: d.recordId,
    recordTitle: rec?.title ?? "",
    recordObject: rec?.objectKey ?? "",
    contentText: d.contentText,
    updatedBy: d.updatedBy,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export const EMPTY_DOC: PMNode = { type: "doc", content: [{ type: "paragraph" }] };

/** Chữ thường có **đậm** và *nghiêng* → các nút text của ProseMirror. */
function inline(s: string): PMNode[] {
  const out: PMNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ type: "text", text: s.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) out.push({ type: "text", text: t.slice(2, -2), marks: [{ type: "bold" }] });
    else if (t.startsWith("`")) out.push({ type: "text", text: t.slice(1, -1), marks: [{ type: "code" }] });
    else out.push({ type: "text", text: t.slice(1, -1), marks: [{ type: "italic" }] });
    last = m.index! + t.length;
  }
  if (last < s.length) out.push({ type: "text", text: s.slice(last) });
  return out.filter((n) => n.text);
}

const para = (s: string): PMNode => (s ? { type: "paragraph", content: inline(s) } : { type: "paragraph" });

/** Markdown tối giản (#, ##, -, 1., >, ---) → ProseMirror JSON. Dùng cho mẫu và dữ liệu mẫu. */
export function mdToDoc(md: string): PMNode {
  const lines = md.replace(/\r/g, "").split("\n");
  const content: PMNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      content.push({ type: "heading", attrs: { level: h[1].length }, content: inline(h[2]) });
      i++;
    } else if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
      const ordered = /^\s*\d+\.\s+/.test(l);
      const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      const items: PMNode[] = [];
      while (i < lines.length && re.test(lines[i])) {
        const text = lines[i].replace(re, "");
        const task = /^\[( |x)\]\s*/.exec(text);
        items.push({ type: "listItem", content: [para(task ? `${task[1] === "x" ? "☑" : "☐"} ${text.slice(task[0].length)}` : text)] });
        i++;
      }
      content.push({ type: ordered ? "orderedList" : "bulletList", ...(ordered ? { attrs: { start: 1 } } : {}), content: items });
    } else if (/^>\s?/.test(l)) {
      const ps: PMNode[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) ps.push(para(lines[i++].replace(/^>\s?/, "")));
      content.push({ type: "blockquote", content: ps });
    } else if (/^---+$/.test(l.trim())) {
      content.push({ type: "horizontalRule" });
      i++;
    } else if (l.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      content.push({ type: "codeBlock", content: code.length ? [{ type: "text", text: code.join("\n") }] : undefined });
    } else if (l.trim() === "") {
      i++;
    } else {
      content.push(para(l));
      i++;
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** Rút chữ thuần từ ProseMirror JSON (để tìm kiếm). */
export function docToText(node: PMNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(docToText).join(node.type === "doc" || node.type.endsWith("List") || node.type === "blockquote" ? "\n" : "");
  return inner;
}

export function parseDoc(json: string): PMNode {
  try {
    const d = JSON.parse(json) as PMNode;
    return d && d.type === "doc" ? d : EMPTY_DOC;
  } catch {
    return EMPTY_DOC;
  }
}

// ---------- Mẫu dựng sẵn ----------
export const DOC_TEMPLATES: { key: string; title: string; hint: string; md: string }[] = [
  {
    key: "tu_van",
    title: "Kịch bản tư vấn",
    hint: "Mở lời, khai thác nhu cầu, xử lý từ chối, chốt hẹn",
    md: `# Kịch bản tư vấn

## 1. Mở lời (30 giây đầu)
- Chào anh/chị, em là ... từ ... Anh/chị cho em xin 2 phút được không ạ?
- Nhắc lại lý do liên hệ: anh/chị vừa để lại thông tin về ...

## 2. Khai thác nhu cầu
1. Anh/chị đang quan tâm đến vấn đề gì nhất?
2. Trước giờ anh/chị đã thử giải pháp nào chưa? Kết quả ra sao?
3. Anh/chị mong muốn kết quả trong bao lâu?
4. Ngân sách dự kiến của anh/chị khoảng bao nhiêu?

## 3. Giới thiệu giải pháp
- Nêu **2–3 lợi ích** khớp đúng nhu cầu vừa khai thác, không đọc hết danh mục.
- Kể một câu chuyện khách hàng tương tự đã thành công.

## 4. Xử lý từ chối
> “Để anh/chị suy nghĩ thêm” → Dạ, anh/chị đang băn khoăn nhất ở điểm nào ạ? Em gửi thêm thông tin đúng phần đó.

> “Giá hơi cao” → So sánh chi phí trên mỗi buổi/mỗi tháng và giá trị nhận được.

## 5. Chốt bước tiếp theo
- Đề xuất **2 khung giờ cụ thể** để hẹn, không hỏi “khi nào anh/chị rảnh”.
- Xác nhận lại qua Zalo ngay sau cuộc gọi.`,
  },
  {
    key: "bien_ban",
    title: "Biên bản cuộc họp",
    hint: "Thành phần, nội dung, quyết định, việc cần làm",
    md: `# Biên bản cuộc họp

**Thời gian:** ...
**Địa điểm / hình thức:** ...
**Thành phần:** ...

## Nội dung chính
- ...

## Quyết định
1. ...

## Việc cần làm
- [ ] Việc ... — người phụ trách ... — hạn ...
- [ ] Việc ... — người phụ trách ... — hạn ...

## Ghi chú thêm
...`,
  },
  {
    key: "bao_gia",
    title: "Báo giá",
    hint: "Hạng mục, đơn giá, ưu đãi, điều khoản",
    md: `# Báo giá

**Kính gửi:** Anh/Chị ...
**Ngày báo giá:** ...
**Hiệu lực:** 15 ngày kể từ ngày báo giá

## Hạng mục
1. Hạng mục 1 — số lượng ... — đơn giá ... — thành tiền ...
2. Hạng mục 2 — số lượng ... — đơn giá ... — thành tiền ...

**Tổng cộng:** ... (đã gồm VAT)

## Ưu đãi
- Giảm ...% khi thanh toán trong 7 ngày.
- Tặng kèm ...

## Điều khoản thanh toán
- Đặt cọc 30% khi ký hợp đồng, phần còn lại khi bàn giao.
- Chuyển khoản: Ngân hàng ... — STK ... — Chủ TK ...

> Mọi thắc mắc anh/chị vui lòng liên hệ hotline hoặc Zalo của người phụ trách.`,
  },
  {
    key: "cham_soc",
    title: "Quy trình chăm sóc",
    hint: "Các mốc chăm sóc sau mua, kịch bản tin nhắn",
    md: `# Quy trình chăm sóc khách hàng

## Mốc chăm sóc
1. **Ngày 0:** Cảm ơn khách, gửi hướng dẫn sử dụng/lưu ý.
2. **Ngày 3:** Hỏi thăm trải nghiệm, giải đáp vướng mắc.
3. **Ngày 14:** Xin đánh giá, đề nghị giới thiệu bạn bè.
4. **Ngày 30:** Gợi ý gói/sản phẩm tiếp theo phù hợp.
5. **Sinh nhật / dịp lễ:** Gửi lời chúc kèm ưu đãi riêng.

## Mẫu tin nhắn
> Dạ chào anh/chị, em ... đây ạ. Không biết sau mấy ngày anh/chị dùng thấy thế nào ạ? Có gì chưa rõ anh/chị cứ nhắn em nhé!

## Nguyên tắc
- Mỗi lần liên hệ đều ghi cập nhật vào CRM.
- Khách phàn nàn: phản hồi trong **2 giờ**, báo quản lý nếu chưa xử lý được trong ngày.`,
  },
];

export function templateDoc(key: string) {
  const t = DOC_TEMPLATES.find((x) => x.key === key);
  if (!t) return null;
  const doc = mdToDoc(t.md);
  return { title: t.title, doc, text: docToText(doc) };
}

// ---------- Dữ liệu mẫu ----------
export async function seedDocs(workspaceId: string, cfg: WorkspaceConfig): Promise<void> {
  if (await db.doc.count({ where: { workspaceId } })) return;
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 2 });
  const t = cfg.terminology;
  const team = cfg.team.length ? cfg.team : ["Bạn"];
  const items: { title: string; recordId: string | null; md: string }[] = [
    {
      title: `Quy trình bán hàng của ${cfg.businessName}`,
      recordId: null,
      md: `# Quy trình bán hàng của ${cfg.businessName}

Tài liệu chung cho cả đội. Mọi người cập nhật khi có thay đổi.

## Các bước
1. **Tiếp nhận ${t.contact.toLowerCase()}:** lead từ quảng cáo, Zalo OA, website tự vào bảng ${t.contact}. Gọi lại trong **5 phút** đầu.
2. **Tư vấn lần đầu:** dùng “Kịch bản tư vấn”, ghi nhu cầu, ngân sách, thời điểm mua vào phần cập nhật.
3. **Tạo ${t.deal.toLowerCase()}:** khi khách có nhu cầu rõ ràng, tạo mục ở bảng ${t.deal} và gắn giá trị dự kiến.
4. **Báo giá / hẹn gặp:** gửi báo giá trong ngày, hẹn lịch cụ thể.
5. **Chốt và bàn giao:** chuyển trạng thái sang thắng, chuyển sang quy trình chăm sóc.

## Chỉ tiêu tuần
- Mỗi người gọi tối thiểu **40 cuộc**, cập nhật CRM cuối ngày.
- Khách “Nóng” (điểm AI từ 70) phải có việc cần làm trong 24 giờ.

## Phân công
${team.map((n) => `- ${n}`).join("\n")}

> Mẹo: gõ tên khách vào ô tìm kiếm ở trang Tài liệu để xem mọi ghi chú liên quan.`,
    },
  ];
  if (contacts[0]) {
    items.push({
      title: `Ghi chú tư vấn – ${contacts[0].title}`,
      recordId: contacts[0].id,
      md: `# Ghi chú tư vấn – ${contacts[0].title}

**Người phụ trách:** ${contacts[0].ownerName || team[0]}

## Nhu cầu
- Quan tâm gói phù hợp ngân sách, muốn thấy kết quả trong 1–2 tháng.
- Đã tham khảo 2 nơi khác, còn băn khoăn về giá và thời gian.

## Đã trao đổi
1. Gửi bảng giá và câu chuyện khách hàng tương tự qua Zalo.
2. Khách hẹn trao đổi lại với gia đình trước khi quyết định.

## Bước tiếp theo
- [ ] Gọi lại sau 2 ngày, đề xuất 2 khung giờ đến trải nghiệm.
- [ ] Chuẩn bị ưu đãi đăng ký sớm trong tuần.

> Khách thích nhắn tin hơn gọi điện, nên chủ động nhắn trước khi gọi.`,
    });
  }
  if (contacts[1]) {
    items.push({
      title: `Biên bản trao đổi – ${contacts[1].title}`,
      recordId: contacts[1].id,
      md: `# Biên bản trao đổi – ${contacts[1].title}

**Hình thức:** gọi điện 15 phút
**Thành phần:** ${contacts[1].title}, ${contacts[1].ownerName || team[0]}

## Nội dung
- Khách cần báo giá chi tiết cho 2 phương án, so sánh trước cuối tuần.
- Ưu tiên chất lượng, chấp nhận chi phí cao hơn nếu có bảo hành rõ ràng.

## Quyết định
1. Gửi báo giá 2 phương án trước 17h ngày mai.
2. Mời khách đến xem trực tiếp vào cuối tuần.

## Việc cần làm
- [ ] Soạn báo giá theo mẫu “Báo giá”.
- [x] Lưu số Zalo của khách.`,
    });
  }
  for (const it of items) {
    const doc = mdToDoc(it.md);
    await db.doc.create({ data: { workspaceId, recordId: it.recordId, title: it.title, contentJson: JSON.stringify(doc), contentText: docToText(doc), updatedBy: "Dữ liệu mẫu" } });
  }
}

// ---------- Truy vấn theo phạm vi quyền ----------
type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

/** Liệt kê tài liệu người dùng được xem: tài liệu chung + tài liệu gắn mục mà họ thấy được (recordScope). */
export async function listDocs(ctx: Ctx, opts: { recordId?: string | null; kind?: "all" | "record" | "general"; q?: string; take?: number } = {}) {
  const scope = await recordScope(ctx);
  const q = opts.q?.trim();
  const docs = await db.doc.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      ...(opts.recordId ? { recordId: opts.recordId } : opts.kind === "record" ? { recordId: { not: null } } : opts.kind === "general" ? { recordId: null } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { contentText: { contains: q } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: opts.take ?? 500,
  });
  const ids = [...new Set(docs.map((d) => d.recordId).filter((x): x is string => !!x))];
  const recs = ids.length ? await db.record.findMany({ where: { AND: [scope, { id: { in: ids } }] }, select: { id: true, title: true, objectKey: true } }) : [];
  const byId = new Map(recs.map((r) => [r.id, r]));
  return docs.filter((d) => !d.recordId || byId.has(d.recordId)).map((d) => toDocDTO(d, d.recordId ? byId.get(d.recordId) : null));
}

/** Lấy một tài liệu nếu người dùng được phép xem (cùng workspace, mục gắn kèm nằm trong phạm vi). */
export async function getDocFor(ctx: Ctx, id: string) {
  const d = await db.doc.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!d) return null;
  let rec: { id: string; title: string; objectKey: string } | null = null;
  if (d.recordId) {
    rec = await db.record.findFirst({ where: { AND: [await recordScope(ctx), { id: d.recordId }] }, select: { id: true, title: true, objectKey: true } });
    if (!rec) return null;
  }
  return { doc: d, rec };
}
