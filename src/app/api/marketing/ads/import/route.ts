import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { marketingApi } from "@/lib/marketing/guard";
import { parseSpendCsv, upsertSpend } from "@/lib/marketing/ads";

/** Nhập CSV chi phí (cột: ngày, nền tảng, chiến dịch, chi phí, hiển thị, click, lead). */
export async function POST(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const { csv } = (await req.json().catch(() => ({}))) as { csv?: string };
  if (!csv?.trim()) return fail("Chưa có nội dung CSV");
  if (csv.length > 2_000_000) return fail("File quá lớn (tối đa 2MB)");
  const { rows, errors } = parseSpendCsv(csv);
  if (!rows.length) return fail(errors[0] ?? "Không đọc được dòng nào");
  const n = await upsertSpend(a.ctx.workspace.id, rows, "csv");
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "import", "adSpend", "", `Nhập CSV chi phí quảng cáo: ${n} dòng`);
  return ok({ rows: n, errors });
}
