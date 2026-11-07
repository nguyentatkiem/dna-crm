// HỢP ĐỒNG: trang Kiểm tra kết nối gọi hàm này. Kiểm tra Thanh toán, Hoá đơn điện tử, Vận chuyển.
// live = true: gọi thử tới nhà cung cấp ở các điểm an toàn (chỉ đọc/đăng nhập), không tạo đơn hay giao dịch.
import type { Check } from "../health/types";
import { db } from "@/lib/db";
import { bankByBin } from "./banks";
import { bankConfigured, payDryRun, paySettings, payStatus } from "./settings";
import { einvoiceSettings } from "@/lib/einvoice/settings";
import { EINVOICE_PROVIDERS } from "@/lib/einvoice/providers";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { shipSettings, type ShipSettings } from "@/lib/ship/settings";
import { CARRIER_LABEL, type CarrierKey } from "@/lib/ship/types";

const GROUP_PAY = "Thanh toán";
const GROUP_INV = "Hoá đơn điện tử";
const GROUP_SHIP = "Vận chuyển";
const FIX = "/w/settings/payments";

const ago = (iso?: string) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(0, m)} phút trước` : m < 2880 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
};

async function probe(url: string, init: RequestInit): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, detail: res.ok ? "Kết nối được" : `HTTP ${res.status}${j.message ? `: ${String(j.message).slice(0, 80)}` : ""}` };
  } catch (e) {
    return { ok: false, detail: `Không gọi được (${e instanceof Error ? e.message.slice(0, 60) : "lỗi mạng"})` };
  }
}

/** Gọi thử an toàn: GHN lấy danh sách tỉnh (chỉ đọc), GHTK hỏi phí một tuyến mẫu (chỉ đọc), Viettel Post đăng nhập. */
async function liveCarrier(k: CarrierKey, s: ShipSettings) {
  if (k === "ghn") return probe(`${s.ghn.env === "dev" ? "https://dev-online-gateway.ghn.vn" : "https://online-gateway.ghn.vn"}/shiip/public-api/master-data/province`, { headers: { Token: s.ghn.token } });
  if (k === "ghtk") {
    const q = new URLSearchParams({ pick_province: "Hà Nội", pick_district: "Quận Ba Đình", province: "Hà Nội", district: "Quận Ba Đình", weight: "500" });
    return probe(`${s.ghtk.env === "staging" ? "https://services-staging.ghtklab.com" : "https://services.giaohangtietkiem.vn"}/services/shipment/fee?${q}`, { headers: { Token: s.ghtk.token } });
  }
  if (k === "vtp") {
    if (s.vtp.token && !s.vtp.password) return { ok: true, detail: "Có token (không thử đăng nhập)" };
    return probe("https://partner.viettelpost.vn/v2/user/Login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ USERNAME: s.vtp.username, PASSWORD: s.vtp.password }) });
  }
  return { ok: true, detail: "Mô phỏng" };
}

export async function health(workspaceId: string, opts: { live?: boolean } = {}): Promise<Check[]> {
  const [pay, status, einv, company, ship, unmatched] = await Promise.all([
    paySettings(workspaceId),
    payStatus(workspaceId),
    einvoiceSettings(workspaceId),
    getPref<Company>(workspaceId, "company", COMPANY_DEFAULT),
    shipSettings(workspaceId),
    db.bankTxn.count({ where: { workspaceId, status: "unmatched" } }),
  ]);
  const out: Check[] = [];
  const bank = bankByBin(pay.bankBin);
  out.push({
    key: "pay.bank",
    group: GROUP_PAY,
    label: "Tài khoản nhận tiền (VietQR)",
    status: bankConfigured(pay) ? "ok" : "warn",
    detail: bankConfigured(pay) ? `${bank?.short ?? pay.bankBin} · STK …${pay.accountNo.slice(-4)} · mã nội dung "${pay.payCodePrefix}…"` : "Chưa khai báo ngân hàng và số tài khoản: chưa tạo được mã QR chuyển khoản",
    fixHref: FIX,
  });
  const anyHook = !!(pay.cassoSecret || pay.sepayKey);
  const providers = [pay.cassoSecret && "Casso", pay.sepayKey && "SePay"].filter(Boolean).join(", ");
  const recentErr = status.lastErrorAt && (!status.lastWebhookAt || status.lastErrorAt > status.lastWebhookAt);
  out.push({
    key: "pay.webhook",
    group: GROUP_PAY,
    label: "Tự đối soát chuyển khoản",
    status: !anyHook ? "off" : recentErr ? "error" : status.lastWebhookAt ? "ok" : "warn",
    detail: !anyHook
      ? "Chưa bật: tạo khoá webhook Casso hoặc SePay để tự ghép tiền về với đơn"
      : recentErr
        ? `${providers}: lần gọi gần nhất bị từ chối (${status.lastError ?? "lỗi"}), ${ago(status.lastErrorAt)}`
        : status.lastWebhookAt
          ? `${providers}: nhận webhook gần nhất ${ago(status.lastWebhookAt)} (${status.received ?? 0} lần)`
          : `${providers}: đã có khoá nhưng chưa nhận webhook nào`,
    fixHref: FIX,
  });
  if (unmatched > 0) out.push({ key: "pay.unmatched", group: GROUP_PAY, label: "Giao dịch chờ ghép", status: "warn", detail: `${unmatched} giao dịch chưa ghép được với đơn`, fixHref: "/w/payments" });

  const p = EINVOICE_PROVIDERS[einv.provider];
  out.push({
    key: "einvoice.provider",
    group: GROUP_INV,
    label: "Nhà cung cấp hoá đơn",
    status: p.mode === "simulated" ? "warn" : company.taxCode ? "ok" : "error",
    detail: p.mode === "simulated" ? "Đang ở chế độ Demo: hoá đơn chỉ mô phỏng, không có giá trị pháp lý" : company.taxCode ? `${p.label} · ký hiệu ${einv.series} (CRM xuất file để nhập, không gọi API)` : `${p.label}: thiếu Mã số thuế doanh nghiệp`,
    fixHref: p.mode !== "simulated" && !company.taxCode ? "/w/settings/company" : FIX,
  });

  const keys: CarrierKey[] = ["ghn", "ghtk", "vtp"];
  const configured = keys.filter((k) => (k === "ghn" ? ship.ghn.token && ship.ghn.shopId : k === "ghtk" ? ship.ghtk.token : ship.vtp.token || (ship.vtp.username && ship.vtp.password)));
  out.push({
    key: "ship.from",
    group: GROUP_SHIP,
    label: "Địa chỉ lấy hàng",
    status: ship.from.name && ship.from.address && ship.from.province && ship.from.district ? "ok" : "warn",
    detail: ship.from.address ? `${ship.from.name} · ${[ship.from.address, ship.from.district, ship.from.province].filter((x, i, arr) => x && (i === 0 || !arr[0].includes(x))).join(", ")}` : "Chưa có địa chỉ lấy hàng",
    fixHref: FIX,
  });
  if (!configured.length) out.push({ key: "ship.carriers", group: GROUP_SHIP, label: "Hãng vận chuyển", status: "off", detail: "Chưa kết nối GHN / GHTK / Viettel Post (đang dùng vận đơn Demo)", fixHref: FIX });
  for (const k of configured) {
    const c: Check = { key: `ship.${k}`, group: GROUP_SHIP, label: CARRIER_LABEL[k], status: "ok", detail: "Đã điền khoá kết nối", fixHref: FIX, testable: true };
    if (opts.live && !payDryRun()) {
      const r = await liveCarrier(k, ship);
      c.status = r.ok ? "ok" : "error";
      c.detail = r.detail;
    }
    out.push(c);
  }
  if (!ship.webhookToken && configured.length) out.push({ key: "ship.webhook", group: GROUP_SHIP, label: "Webhook trạng thái vận đơn", status: "warn", detail: "Chưa tạo token webhook: trạng thái chỉ cập nhật khi bấm Cập nhật", fixHref: FIX });
  if (payDryRun()) out.push({ key: "pay.dryrun", group: GROUP_PAY, label: "Chế độ chạy khô", status: "warn", detail: "PAY_DRY_RUN=1: không gọi API hãng vận chuyển thật" });
  return out;
}
