// Kiểu khối của landing page, dùng chung cho trình sửa (trình duyệt), trang công khai và API. Không import db ở đây.
import { z } from "zod";

export const THEMES: Record<string, { label: string; color: string }> = {
  blue: { label: "Xanh dương", color: "#0073ea" },
  green: { label: "Xanh lá", color: "#00a76f" },
  teal: { label: "Xanh ngọc", color: "#0e9f9a" },
  purple: { label: "Tím", color: "#7e3bd0" },
  pink: { label: "Hồng", color: "#e2445c" },
  orange: { label: "Cam", color: "#f2711c" },
  red: { label: "Đỏ", color: "#d83a52" },
  dark: { label: "Đen", color: "#1f2937" },
};
export const themeColor = (t: string) => THEMES[t]?.color ?? THEMES.blue.color;

const txt = (max: number) => z.string().max(max).default("");
/** Link nút: neo trong trang (#dang-ky) hoặc http(s). Chặn javascript: và kiểu lạ. */
const href = z
  .string()
  .max(500)
  .default("#dang-ky")
  .transform((v) => (/^(#[\w-]*|https?:\/\/\S+)$/.test(v.trim()) ? v.trim() : "#dang-ky"));
const imgUrl = z
  .string()
  .max(1000)
  .default("")
  .transform((v) => (/^https?:\/\/\S+$/.test(v.trim()) ? v.trim() : ""));

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(40), type: z.literal("hero"), title: txt(160), subtitle: txt(400), button: txt(60), href, image: imgUrl }),
  z.object({ id: z.string().max(40), type: z.literal("benefits"), title: txt(160), items: z.array(z.string().max(200)).max(12).default([]) }),
  z.object({ id: z.string().max(40), type: z.literal("image"), url: imgUrl, alt: txt(200), caption: txt(200) }),
  z.object({ id: z.string().max(40), type: z.literal("testimonial"), quote: txt(600), author: txt(80), role: txt(120) }),
  z.object({
    id: z.string().max(40),
    type: z.literal("form"),
    title: txt(160),
    subtitle: txt(300),
    fields: z.object({ phone: z.boolean().default(true), email: z.boolean().default(false), note: z.boolean().default(true) }).default({ phone: true, email: false, note: true }),
    button: txt(60),
    thanks: txt(400),
  }),
  z.object({ id: z.string().max(40), type: z.literal("faq"), title: txt(160), items: z.array(z.object({ q: z.string().max(200), a: z.string().max(800) })).max(12).default([]) }),
  z.object({ id: z.string().max(40), type: z.literal("cta"), title: txt(160), subtitle: txt(300), button: txt(60), href }),
]);
export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block["type"];

export const BLOCK_LABEL: Record<BlockType, string> = {
  hero: "Ảnh bìa & tiêu đề",
  benefits: "Lợi ích",
  image: "Hình ảnh",
  testimonial: "Cảm nhận khách",
  form: "Form đăng ký",
  faq: "Câu hỏi thường gặp",
  cta: "Kêu gọi hành động",
};

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Khối mới với nội dung gợi ý để người dùng sửa. */
export function blankBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "hero":
      return { id, type, title: "Tiêu đề hấp dẫn cho ưu đãi của bạn", subtitle: "Một câu ngắn nói rõ khách được gì.", button: "Đăng ký ngay", href: "#dang-ky", image: "" };
    case "benefits":
      return { id, type, title: "Vì sao chọn chúng tôi", items: ["Lợi ích thứ nhất", "Lợi ích thứ hai", "Lợi ích thứ ba"] };
    case "image":
      return { id, type, url: "", alt: "", caption: "" };
    case "testimonial":
      return { id, type, quote: "Dịch vụ rất tận tâm, mình sẽ quay lại.", author: "Chị Lan", role: "Khách hàng" };
    case "form":
      return { id, type, title: "Để lại thông tin, chúng tôi gọi lại trong 15 phút", subtitle: "", fields: { phone: true, email: false, note: true }, button: "Gửi thông tin", thanks: "Cảm ơn anh/chị! Chúng tôi sẽ liên hệ sớm." };
    case "faq":
      return { id, type, title: "Câu hỏi thường gặp", items: [{ q: "Câu hỏi?", a: "Câu trả lời." }] };
    case "cta":
      return { id, type, title: "Sẵn sàng bắt đầu?", subtitle: "Số lượng ưu đãi có hạn.", button: "Nhận ưu đãi", href: "#dang-ky" };
  }
}

/** Đọc mảng khối từ JSON/đầu vào bất kỳ: bỏ khối sai, thêm id còn thiếu, tối đa 30 khối. */
export function sanitizeBlocks(raw: unknown): Block[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Block[] = [];
  const ids = new Set<string>();
  for (const x of arr.slice(0, 30)) {
    const withId = x && typeof x === "object" ? { ...(x as object), id: String((x as { id?: unknown }).id ?? "") || newId() } : x;
    const p = BlockSchema.safeParse(withId);
    if (!p.success) continue;
    if (ids.has(p.data.id)) p.data.id = newId();
    ids.add(p.data.id);
    out.push(p.data);
  }
  return out;
}

export const formBlock = (blocks: Block[]) => blocks.find((b): b is Extract<Block, { type: "form" }> => b.type === "form");

/** Tiêu đề → đường dẫn không dấu: "Ưu đãi Tháng 11" → "uu-dai-thang-11". */
export function slugify(s: string) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;
export function slugError(slug: string) {
  if (!SLUG_RE.test(slug)) return "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang (3–60 ký tự)";
  if (slug.includes("--")) return "Đường dẫn không được có hai dấu gạch ngang liền nhau";
  return null;
}
