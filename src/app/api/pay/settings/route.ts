// Cài đặt Thanh toán & giao hàng: tài khoản nhận tiền, khoá webhook Casso/SePay, hoá đơn điện tử, hãng vận chuyển.
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { ensureHookKey } from "@/lib/settings";
import { originOf } from "@/lib/sales/service";
import { payPerm } from "@/lib/pay/access";
import { bankByBin } from "@/lib/pay/banks";
import { mask, newSecret, paySettings, payStatus, savePaySettings, type PaySettings } from "@/lib/pay/settings";
import { normPrefix } from "@/lib/pay/vietqr";
import { einvoiceSettings, saveEinvoiceSettings } from "@/lib/einvoice/settings";
import { isProviderKey } from "@/lib/einvoice/providers";
import { newShipToken, SHIP_SECRETS, shipSettings, saveShipSettings, type ShipSettings } from "@/lib/ship/settings";
import { CARRIERS, type CarrierKey } from "@/lib/ship/types";

const MASKED = /^••••/;
const keep = (incoming: unknown, cur: string) => (typeof incoming !== "string" || MASKED.test(incoming) ? cur : incoming.trim().slice(0, 500));

async function view(workspaceId: string, origin: string, hookKey: string) {
  const [pay, einv, ship, status] = await Promise.all([paySettings(workspaceId), einvoiceSettings(workspaceId), shipSettings(workspaceId), payStatus(workspaceId)]);
  const shipMasked = JSON.parse(JSON.stringify(ship)) as ShipSettings & Record<string, Record<string, unknown>>;
  for (const [k, fields] of Object.entries(SHIP_SECRETS)) for (const f of fields) shipMasked[k][f] = mask(String((ship as unknown as Record<string, Record<string, string>>)[k][f] ?? ""));
  return {
    pay: { ...pay, cassoSecret: mask(pay.cassoSecret), sepayKey: mask(pay.sepayKey), hasCasso: !!pay.cassoSecret, hasSepay: !!pay.sepayKey },
    einvoice: einv,
    ship: { ...shipMasked, webhookToken: mask(ship.webhookToken), hasWebhookToken: !!ship.webhookToken },
    status,
    hooks: {
      casso: `${origin}/api/hooks/bank/casso/${hookKey}`,
      sepay: `${origin}/api/hooks/bank/sepay/${hookKey}`,
      ship: Object.fromEntries(CARRIERS.map((c) => [c, `${origin}/api/hooks/ship/${c}/${hookKey}?token=${ship.webhookToken ? "<token>" : ""}`])),
    },
    dryRun: process.env.PAY_DRY_RUN === "1",
  };
}

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).settings) return fail("Bạn chưa có quyền xem cài đặt thanh toán", 403);
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: a.ctx.workspace.id } });
  return ok(await view(ws.id, originOf(req.headers), await ensureHookKey(ws)));
}

const Body = z.object({
  pay: z.record(z.string(), z.unknown()).optional(),
  einvoice: z.record(z.string(), z.unknown()).optional(),
  ship: z.record(z.string(), z.unknown()).optional(),
  /** Tạo khoá mới: "casso" | "sepay" | "ship" */
  regen: z.enum(["casso", "sepay", "ship"]).optional(),
  /** Hiện khoá vừa tạo đúng một lần để dán vào nhà cung cấp. */
});

export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).settings) return fail("Bạn chưa có quyền sửa cài đặt thanh toán", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const wid = a.ctx.workspace.id;
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: wid } });
  const hookKey = await ensureHookKey(ws);
  let revealed: string | null = null;
  const d = p.data;

  if (d.pay || d.regen === "casso" || d.regen === "sepay") {
    const cur = await paySettings(wid);
    const x = d.pay ?? {};
    const next: PaySettings = {
      bankBin: typeof x.bankBin === "string" ? x.bankBin.replace(/\D/g, "").slice(0, 6) : cur.bankBin,
      accountNo: typeof x.accountNo === "string" ? x.accountNo.replace(/[^0-9A-Za-z]/g, "").slice(0, 19) : cur.accountNo,
      accountName: typeof x.accountName === "string" ? x.accountName.trim().toUpperCase().slice(0, 60) : cur.accountName,
      payCodePrefix: typeof x.payCodePrefix === "string" ? normPrefix(x.payCodePrefix) : cur.payCodePrefix,
      cassoSecret: keep(x.cassoSecret, cur.cassoSecret),
      sepayKey: keep(x.sepayKey, cur.sepayKey),
      tolerance: x.tolerance != null ? Math.max(0, Math.min(100000, Math.round(Number(x.tolerance) || 0))) : cur.tolerance,
      publicPage: typeof x.publicPage === "boolean" ? x.publicPage : cur.publicPage,
    };
    if (next.bankBin && !bankByBin(next.bankBin)) return fail("Ngân hàng không có trong danh sách hỗ trợ VietQR");
    if (d.regen === "casso") revealed = next.cassoSecret = newSecret();
    if (d.regen === "sepay") revealed = next.sepayKey = newSecret();
    await savePaySettings(wid, next);
    await audit({ workspaceId: wid, user: a.ctx.user }, "settings.payments", "workspace", wid, d.regen ? `Tạo khoá webhook ${d.regen === "casso" ? "Casso" : "SePay"} mới` : "Sửa cài đặt thanh toán");
  }

  if (d.einvoice) {
    const cur = await einvoiceSettings(wid);
    const x = d.einvoice;
    await saveEinvoiceSettings(wid, {
      provider: typeof x.provider === "string" && isProviderKey(x.provider) ? x.provider : cur.provider,
      templateNo: typeof x.templateNo === "string" ? x.templateNo.trim().slice(0, 12) || "1" : cur.templateNo,
      series: typeof x.series === "string" ? x.series.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) : cur.series,
      payMethod: typeof x.payMethod === "string" ? x.payMethod.trim().slice(0, 40) || "TM/CK" : cur.payMethod,
    });
    await audit({ workspaceId: wid, user: a.ctx.user }, "settings.einvoice", "workspace", wid, "Sửa cài đặt hoá đơn điện tử");
  }

  if (d.ship || d.regen === "ship") {
    const cur = await shipSettings(wid);
    const x = (d.ship ?? {}) as Record<string, unknown>;
    const sec = (k: "ghn" | "ghtk" | "vtp") => ((x[k] ?? {}) as Record<string, unknown>);
    const str = (v: unknown, c: string, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : c);
    const numIn = (v: unknown, c: number) => (v != null && Number.isFinite(Number(v)) ? Number(v) : c);
    const from = (x.from ?? {}) as Record<string, unknown>;
    const next: ShipSettings = {
      defaultCarrier: typeof x.defaultCarrier === "string" && CARRIERS.includes(x.defaultCarrier as CarrierKey) ? (x.defaultCarrier as CarrierKey) : cur.defaultCarrier,
      autoDone: typeof x.autoDone === "boolean" ? x.autoDone : cur.autoDone,
      autoShipping: typeof x.autoShipping === "boolean" ? x.autoShipping : cur.autoShipping,
      defaultWeight: Math.max(1, Math.min(50000, Math.round(numIn(x.defaultWeight, cur.defaultWeight)))),
      from: { name: str(from.name, cur.from.name), phone: str(from.phone, cur.from.phone, 20), address: str(from.address, cur.from.address, 300), province: str(from.province, cur.from.province), district: str(from.district, cur.from.district), ward: str(from.ward, cur.from.ward) },
      webhookToken: cur.webhookToken,
      ghn: { token: keep(sec("ghn").token, cur.ghn.token), shopId: str(sec("ghn").shopId, cur.ghn.shopId, 20), env: sec("ghn").env === "dev" ? "dev" : sec("ghn").env === "prod" ? "prod" : cur.ghn.env, serviceTypeId: Math.round(numIn(sec("ghn").serviceTypeId, cur.ghn.serviceTypeId)), requiredNote: str(sec("ghn").requiredNote, cur.ghn.requiredNote, 40), paymentTypeId: numIn(sec("ghn").paymentTypeId, cur.ghn.paymentTypeId) === 2 ? 2 : 1 },
      ghtk: { token: keep(sec("ghtk").token, cur.ghtk.token), env: sec("ghtk").env === "staging" ? "staging" : sec("ghtk").env === "prod" ? "prod" : cur.ghtk.env, transport: sec("ghtk").transport === "fly" ? "fly" : sec("ghtk").transport === "road" ? "road" : cur.ghtk.transport, clientSource: str(sec("ghtk").clientSource, cur.ghtk.clientSource, 60) },
      vtp: { username: str(sec("vtp").username, cur.vtp.username, 100), password: keep(sec("vtp").password, cur.vtp.password), token: keep(sec("vtp").token, cur.vtp.token), service: str(sec("vtp").service, cur.vtp.service, 20), orderPayment: Math.round(numIn(sec("vtp").orderPayment, cur.vtp.orderPayment)), groupAddressId: str(sec("vtp").groupAddressId, cur.vtp.groupAddressId, 20), cusId: str(sec("vtp").cusId, cur.vtp.cusId, 20), createPath: str(sec("vtp").createPath, cur.vtp.createPath, 100), pricePath: str(sec("vtp").pricePath, cur.vtp.pricePath, 100) },
    };
    if (!next.webhookToken || d.regen === "ship") revealed = next.webhookToken = newShipToken();
    if (d.regen !== "ship" && cur.webhookToken) revealed = null;
    await saveShipSettings(wid, next);
    await audit({ workspaceId: wid, user: a.ctx.user }, "settings.shipping", "workspace", wid, d.regen === "ship" ? "Tạo token webhook vận chuyển mới" : "Sửa cài đặt vận chuyển");
  }

  return ok({ ...(await view(wid, originOf(req.headers), hookKey)), revealed });
}
