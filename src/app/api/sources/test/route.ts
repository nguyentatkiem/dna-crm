import { appApi, fail, ok } from "@/lib/http";
import { ingestLead, type Lead } from "@/lib/sources/ingest";
import { getProvider } from "@/lib/sources/providers";

const NAMES = ["Chị Hồng (thử)", "Anh Phúc (thử)", "Chị Ngọc (thử)", "Anh Long (thử)"];

/** Bơm một lead mẫu đi qua đúng luồng thật (chống trùng, gộp khách, tự động hoá) để kiểm tra trước khi nối nền tảng. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { provider } = (await req.json().catch(() => ({}))) as { provider?: string };
  const p = getProvider(provider ?? "");
  if (!p) return fail("Nguồn không hợp lệ");
  const n = Math.floor(Math.random() * 1e8);
  const lead: Lead = {
    provider: p.key,
    providerLabel: p.label.split(" (")[0].replace(" Lead Ads", "").replace("Website, Landing page, n8n/Make", "Website"),
    channel: p.channel,
    name: NAMES[n % NAMES.length],
    phone: "09" + String(n).padStart(8, "0"),
    campaign: p.channel === "ads" ? "Thử kết nối" : undefined,
    externalId: `test-${n}`,
    note: "Lead mẫu tạo từ nút Gửi thử",
    zaloUid: p.key === "zalo" ? `test-${n}` : undefined,
    order: p.channel === "ecommerce" ? { code: `TEST${n % 10000}`, amount: 350000 + (n % 20) * 50000, items: "Sản phẩm mẫu x1", state: "won" } : undefined,
  };
  const r = await ingestLead(a.ctx.workspace, lead, { test: true });
  return ok(r);
}
