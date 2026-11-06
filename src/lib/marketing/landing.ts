// Landing page: AI dựng trang từ DNA, nhận form công khai và đổ lead vào CRM qua cùng đường với Hub nguồn khách.
import type { LandingPage } from "@prisma/client";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db, parseJson } from "../db";
import { ai, MODEL } from "../ai";
import type { Dna } from "../dna";
import type { WorkspaceConfig } from "../config/schema";
import { ingestLead } from "../sources/ingest";
import { notify } from "../notify";
import { formBlock, newId, sanitizeBlocks, slugify, type Block } from "@/app/lp/model";

export const pageBlocks = (p: Pick<LandingPage, "blocksJson">) => sanitizeBlocks(parseJson<unknown>(p.blocksJson, []));

// ---------------- Chống bot, chống spam ----------------

/** Máy quét, bot xem trước link: không tính lượt xem. Thiếu user-agent cũng coi là bot. */
export function isBot(ua: string | null | undefined) {
  const s = String(ua ?? "");
  if (!s) return true;
  return /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|curl|wget|python|httpclient|okhttp|go-http|axios|node-fetch|monitor|pingdom/i.test(s);
}

const g = globalThis as unknown as { crmLpHits?: Map<string, number[]> };

/** Giới hạn theo IP trong bộ nhớ: tối đa max lần trong windowMs. Trả true nếu còn được phép. */
export function rateLimit(key: string, max = 5, windowMs = 10 * 60_000, now = Date.now()) {
  const m = (g.crmLpHits ??= new Map<string, number[]>());
  const hits = (m.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    m.set(key, hits);
    return false;
  }
  hits.push(now);
  m.set(key, hits);
  // Dọn bớt khi bảng phình to.
  if (m.size > 5000) for (const [k, v] of m) if (!v.some((t) => now - t < windowMs)) m.delete(k);
  return true;
}

export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();

// ---------------- Slug ----------------

/** Slug chưa ai dùng: thêm -2, -3… nếu trùng. */
export async function uniqueSlug(base: string, exceptId?: string) {
  const root = slugify(base) || "trang";
  const s0 = root.length < 3 ? `${root}-lp` : root;
  for (let i = 1; i < 200; i++) {
    const s = i === 1 ? s0 : `${s0.slice(0, 55)}-${i}`;
    const hit = await db.landingPage.findUnique({ where: { slug: s }, select: { id: true } });
    if (!hit || hit.id === exceptId) return s;
  }
  return `${s0.slice(0, 50)}-${newId()}`;
}

// ---------------- AI dựng trang ----------------

const GenOut = z.object({
  title: z.string(),
  hero: z.object({ title: z.string(), subtitle: z.string(), button: z.string() }),
  benefitsTitle: z.string(),
  benefits: z.array(z.string()),
  testimonial: z.object({ quote: z.string(), author: z.string(), role: z.string() }),
  formTitle: z.string(),
  formButton: z.string(),
  thanks: z.string(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  cta: z.object({ title: z.string(), subtitle: z.string(), button: z.string() }),
});
type Gen = z.infer<typeof GenOut>;

const splitList = (s: string) =>
  String(s ?? "")
    .split(/[,;\n•·]|→/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Bản dựng theo luật khi không có AI: lấy sản phẩm, khách mục tiêu, nỗi đau từ DNA. */
export function fallbackGen(dna: Partial<Dna> | null, cfg: Pick<WorkspaceConfig, "businessName" | "industry">): Gen {
  const biz = dna?.businessName || cfg.businessName;
  const products = splitList(dna?.products ?? "");
  const main = products[0] ?? "dịch vụ của chúng tôi";
  const pains = splitList(dna?.painPoints ?? "");
  const target = dna?.targetCustomer?.split(/[,.]/)[0]?.trim();
  const benefits = [
    ...products.slice(0, 3).map((p) => `${p[0].toUpperCase()}${p.slice(1)} chuẩn chất lượng, tư vấn tận tình`),
    "Tư vấn miễn phí, báo giá rõ ràng trước khi làm",
    "Đội ngũ giàu kinh nghiệm, hỗ trợ nhanh qua Zalo và điện thoại",
    dna?.repeatPurchase ? "Ưu đãi riêng cho khách quay lại" : "Cam kết minh bạch, không phát sinh chi phí",
  ].slice(0, 5);
  return {
    title: `${biz} – ${main}`,
    hero: {
      title: `${main[0].toUpperCase()}${main.slice(1)} tại ${biz}`,
      subtitle: target ? `Giải pháp dành cho ${target.toLowerCase()}. Đăng ký hôm nay để nhận tư vấn miễn phí và ưu đãi riêng.` : "Đăng ký hôm nay để nhận tư vấn miễn phí và ưu đãi riêng.",
      button: dna?.hasAppointments ? "Đặt lịch tư vấn" : "Nhận ưu đãi",
    },
    benefitsTitle: `Vì sao khách chọn ${biz}`,
    benefits,
    testimonial: { quote: `Mình rất hài lòng với ${main.toLowerCase()} ở ${biz}: tư vấn kỹ, làm chuẩn, sẽ giới thiệu bạn bè.`, author: "Chị Minh Anh", role: "Khách hàng" },
    formTitle: dna?.hasAppointments ? "Đặt lịch tư vấn miễn phí" : "Để lại thông tin để nhận ưu đãi",
    formButton: "Gửi thông tin",
    thanks: `Cảm ơn anh/chị đã quan tâm ${biz}! Chúng tôi sẽ liên hệ trong thời gian sớm nhất.`,
    faq: [
      { q: "Tư vấn có mất phí không?", a: "Hoàn toàn miễn phí. Anh/chị chỉ trả tiền khi đồng ý sử dụng dịch vụ." },
      { q: "Bao lâu thì có người liên hệ?", a: "Thường trong vòng 15–30 phút trong giờ làm việc." },
      ...(pains[0] ? [{ q: `${pains[0][0].toUpperCase()}${pains[0].slice(1)}?`, a: `${biz} sẽ tư vấn cụ thể theo nhu cầu của anh/chị.` }] : []),
    ],
    cta: { title: "Ưu đãi có hạn trong tháng này", subtitle: "Đăng ký ngay để giữ suất.", button: "Đăng ký ngay" },
  };
}

function toBlocks(gen: Gen): Block[] {
  return sanitizeBlocks([
    { id: newId(), type: "hero", title: gen.hero.title, subtitle: gen.hero.subtitle, button: gen.hero.button, href: "#dang-ky", image: "" },
    { id: newId(), type: "benefits", title: gen.benefitsTitle, items: gen.benefits.slice(0, 6) },
    { id: newId(), type: "testimonial", ...gen.testimonial },
    { id: newId(), type: "form", title: gen.formTitle, subtitle: "", fields: { phone: true, email: false, note: true }, button: gen.formButton, thanks: gen.thanks },
    { id: newId(), type: "faq", title: "Câu hỏi thường gặp", items: gen.faq.slice(0, 6) },
    { id: newId(), type: "cta", title: gen.cta.title, subtitle: gen.cta.subtitle, button: gen.cta.button, href: "#dang-ky" },
  ]);
}

/** "AI tạo trang": Claude viết nội dung theo DNA (structured output); không có khoá hoặc lỗi thì dùng bản theo luật. */
export async function generateLanding(workspaceId: string, cfg: WorkspaceConfig, goal = ""): Promise<{ title: string; blocks: Block[]; source: "ai" | "template" }> {
  const row = await db.dna.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  const dna = parseJson<Partial<Dna> | null>(row?.dataJson, null);
  const fb = fallbackGen(dna, cfg);
  const c = ai();
  if (!c) return { title: fb.title, blocks: toBlocks(fb), source: "template" };
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 3000,
      output_config: { effort: "low", format: zodOutputFormat(GenOut) },
      system: `Bạn viết landing page thu lead cho ${cfg.businessName} (ngành ${cfg.industry}) ở Việt Nam. Tiếng Việt có dấu, giọng tự nhiên, cụ thể, không phóng đại, không hứa điều trái luật quảng cáo. Tiêu đề ngắn dưới 70 ký tự, nút dưới 25 ký tự, 4–6 lợi ích, 3–5 câu hỏi thường gặp. Cảm nhận khách phải chung chung, không bịa số liệu.`,
      messages: [{ role: "user", content: `DNA doanh nghiệp: ${row?.dataJson.slice(0, 3000) ?? "(chưa có)"}\n\nMục tiêu trang: ${goal || "thu thông tin khách quan tâm để tư vấn"}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output?.hero?.title) return { title: fb.title, blocks: toBlocks(fb), source: "template" };
    return { title: res.parsed_output.title || fb.title, blocks: toBlocks(res.parsed_output), source: "ai" };
  } catch (e) {
    console.error("[landing] AI dựng trang lỗi:", e instanceof Error ? e.message : e);
    return { title: fb.title, blocks: toBlocks(fb), source: "template" };
  }
}

// ---------------- Nhận form ----------------

export const LeadIn = z.object({
  name: z.string().trim().min(1, "Hãy nhập họ tên").max(120),
  phone: z.string().trim().max(20).optional().default(""),
  email: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(2000).optional().default(""),
  website: z.string().optional(), // bẫy bot: người thật không thấy ô này
  utm: z.record(z.string(), z.string().max(200)).optional(),
});

/** Ghi lead từ landing page vào CRM: nguồn "Landing page", chiến dịch = utm_campaign hoặc tên trang. */
export async function submitLanding(page: LandingPage, input: z.infer<typeof LeadIn>): Promise<{ ok: true; thanks: string } | { ok: false; error: string }> {
  const form = formBlock(pageBlocks(page));
  if (!form) return { ok: false, error: "Trang này không có form" };
  const thanks = form.thanks || "Cảm ơn anh/chị! Chúng tôi sẽ liên hệ sớm.";
  if (input.website) return { ok: true, thanks };
  const phone = form.fields.phone ? input.phone : "";
  const email = form.fields.email ? input.email : "";
  if (form.fields.phone && !form.fields.email && !phone) return { ok: false, error: "Hãy nhập số điện thoại" };
  if (phone && !/^[0-9+\s.()-]{8,15}$/.test(phone)) return { ok: false, error: "Số điện thoại chưa đúng" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email chưa đúng" };
  if (form.fields.phone && form.fields.email && !phone && !email) return { ok: false, error: "Hãy nhập số điện thoại hoặc email" };

  const ws = await db.workspace.findUnique({ where: { id: page.workspaceId } });
  if (!ws) return { ok: false, error: "Trang không tồn tại" };
  const u = input.utm ?? {};
  const extra: Record<string, string> = { "Landing page": `/lp/${page.slug}` };
  if (u.utm_source) extra["utm_source"] = u.utm_source;
  if (u.utm_medium) extra["utm_medium"] = u.utm_medium;
  if (u.utm_content) extra["utm_content"] = u.utm_content;
  const r = await ingestLead(
    ws,
    {
      provider: "landing",
      providerLabel: "Landing page",
      channel: "website",
      name: input.name,
      phone,
      email,
      note: form.fields.note && input.note ? `Lời nhắn: ${input.note}` : undefined,
      campaign: u.utm_campaign || page.title,
      extra,
    },
    { slug: page.slug, utm: u },
  );
  if (r.status === "error") return { ok: false, error: "CRM chưa sẵn sàng nhận thông tin, vui lòng gọi trực tiếp" };
  await db.landingPage.update({ where: { id: page.id }, data: { conversions: { increment: 1 } } });
  await notify(page.workspaceId, { kind: "lead", text: `Lead mới từ landing page “${page.title}”: ${input.name}`, href: r.recordId ? `/w/b/contacts?open=${r.recordId}` : "/w/landing" });
  return { ok: true, thanks };
}
