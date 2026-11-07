// Tải file nhập hoá đơn cho nhà cung cấp (chế độ xuất file).
import type { EInvoice } from "@prisma/client";
import { docOf } from "./service";
import { EINVOICE_PROVIDERS, isProviderKey } from "./providers";

export async function exportResponse(invs: EInvoice[]) {
  const first = invs[0];
  const key = first && isProviderKey(first.provider) ? first.provider : "misa";
  const p = EINVOICE_PROVIDERS[key === "demo" ? "misa" : key];
  const docs = invs.map(docOf).filter((d): d is NonNullable<typeof d> => !!d);
  const f = await p.exportFile!(docs);
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Content-Disposition": `attachment; filename="${f.name}"`, "Cache-Control": "private, no-store" } });
}
