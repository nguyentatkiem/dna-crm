// Cài đặt hoá đơn điện tử (Pref "einvoice").
import { getPref, setPref } from "@/lib/prefs";
import { defaultSeries } from "./doc";
import { isProviderKey, type EInvoiceProviderKey } from "./providers";

export type EInvoiceSettings = { provider: EInvoiceProviderKey; templateNo: string; series: string; payMethod: string };
export const EINVOICE_DEFAULT: EInvoiceSettings = { provider: "demo", templateNo: "1", series: "", payMethod: "TM/CK" };

export async function einvoiceSettings(workspaceId: string): Promise<EInvoiceSettings> {
  const s = await getPref<EInvoiceSettings>(workspaceId, "einvoice", EINVOICE_DEFAULT);
  return { ...s, provider: isProviderKey(s.provider) ? s.provider : "demo", series: s.series || defaultSeries() };
}
export const saveEinvoiceSettings = (workspaceId: string, s: EInvoiceSettings) => setPref(workspaceId, "einvoice", s);
