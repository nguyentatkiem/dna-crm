// Dữ liệu mẫu Thanh toán / Hoá đơn / Vận chuyển (idempotent): tài khoản demo, payCode cho đơn, vài giao dịch ngân hàng,
// một hoá đơn demo, hai vận đơn demo. Chạy lại không tạo trùng.
import { db } from "@/lib/db";
import { getPref } from "@/lib/prefs";
import { remaining } from "@/lib/sales/shared";
import { issueInvoice } from "@/lib/einvoice/service";
import { createShipment, applyStatus } from "@/lib/ship/service";
import { shipSettings, saveShipSettings } from "@/lib/ship/settings";
import { ensurePayCodes, ingestTxn, autoMatch } from "./reconcile";
import { PAY_DEFAULT, paySettings, savePaySettings, newSecret } from "./settings";

export async function seedPayments(workspaceId: string) {
  const SYS = { id: "", name: "Dữ liệu mẫu" };
  // 1. Tài khoản nhận tiền demo (chỉ khi chưa cài).
  const raw = await getPref<Record<string, unknown>>(workspaceId, "payments", {});
  if (!raw.accountNo) await savePaySettings(workspaceId, { ...PAY_DEFAULT, ...(await paySettings(workspaceId)), bankBin: "970436", accountNo: "0071000123456", accountName: "CONG TY DEMO DNA", sepayKey: newSecret() });
  const ship = await shipSettings(workspaceId);
  if (!ship.from.province) await saveShipSettings(workspaceId, { ...ship, from: { ...ship.from, name: ship.from.name || "Kho Demo", phone: ship.from.phone || "0900000001", address: ship.from.address || "12 Nguyễn Huệ", ward: "Phường Bến Nghé", district: "Quận 1", province: "Hồ Chí Minh" } });

  // 2. payCode cho mọi đơn.
  await ensurePayCodes(workspaceId);
  const orders = await db.order.findMany({ where: { workspaceId, status: { not: "cancelled" } }, orderBy: { createdAt: "asc" }, take: 60 });
  const open = orders.filter((o) => remaining(o) > 0);

  // 3. Giao dịch ngân hàng: 1–2 khớp tự động + 2 không khớp.
  const now = Date.now();
  const txns = [
    open[0] && { externalId: "SEED-1", amount: remaining(open[0]), content: `MBVCB.3278614.${open[0].payCode}.CT tu NGUYEN VAN A`, at: new Date(now - 3 * 3600e3) },
    open[1] && { externalId: "SEED-2", amount: Math.round(remaining(open[1]) / 2), content: `IBFT ${open[1].payCode.replace(/(\d{4})(\d+)$/, " $1 $2")} dat coc`, at: new Date(now - 2 * 3600e3) },
    { externalId: "SEED-3", amount: 350000, content: "CHUYEN TIEN AN TRUA THANG 11", at: new Date(now - 90 * 60e3) },
    { externalId: "SEED-4", amount: 1200000, content: "TT DON HANG CHI LAN 0912345678", at: new Date(now - 30 * 60e3) },
  ].filter(Boolean) as { externalId: string; amount: number; content: string; at: Date }[];
  for (const t of txns) {
    const { txn, created } = await ingestTxn(workspaceId, { provider: "sepay", externalId: t.externalId, amount: t.amount, content: t.content, accountNo: "0071000123456", at: t.at, raw: { seed: true } });
    if (created) await autoMatch(txn.id).catch(() => undefined);
  }

  // Đơn mẫu có thể đã bị tạo lại (dữ liệu mẫu chạy lại): dọn vận đơn / hoá đơn mồ côi (bảng không có khoá ngoại tới Order).
  const ids = (await db.order.findMany({ where: { workspaceId }, select: { id: true } })).map((o) => o.id);
  await db.shipment.deleteMany({ where: { workspaceId, orderId: { notIn: ids } } });
  await db.eInvoice.deleteMany({ where: { workspaceId, orderId: { notIn: ids } } });
  await db.bankTxn.updateMany({ where: { workspaceId, orderId: { notIn: ids }, NOT: { orderId: null } }, data: { orderId: null, paymentId: null, status: "unmatched" } });

  // 4. Một hoá đơn demo cho đơn đầu tiên có dòng hàng.
  const hasInv = await db.eInvoice.count({ where: { workspaceId } });
  if (!hasInv) {
    const o = orders.find((x) => x.itemsJson.length > 5);
    if (o) await issueInvoice(o, { name: o.customerName || "Khách lẻ", company: "", taxCode: "", address: o.shipAddress || "", email: "", phone: o.customerPhone }, SYS);
  }

  // 5. Hai vận đơn demo ở hai trạng thái khác nhau.
  const hasShip = await db.shipment.count({ where: { workspaceId } });
  if (!hasShip) {
    const cands = orders.filter((o) => o.status === "new" || o.status === "confirmed").slice(-2);
    const addrs = [
      { shipName: "", shipPhone: "0912345678", shipAddress: "25 Trần Phú", shipWard: "Phường Điện Biên", shipDistrict: "Quận Ba Đình", shipProvince: "Hà Nội" },
      { shipName: "", shipPhone: "0987654321", shipAddress: "88 Lê Lợi", shipWard: "Phường Bến Thành", shipDistrict: "Quận 1", shipProvince: "Hồ Chí Minh" },
    ];
    for (const [i, o0] of cands.entries()) {
      const o = await db.order.update({ where: { id: o0.id }, data: { ...addrs[i], shipName: o0.shipName || o0.customerName, shipPhone: o0.shipPhone || o0.customerPhone || addrs[i].shipPhone } });
      const r = await createShipment(o, "demo", {}, SYS);
      if ("shipment" in r && i === 1) {
        const s1 = await applyStatus(r.shipment, "picking", "Shipper demo đang lấy hàng", new Date(now - 40 * 60e3));
        await applyStatus(s1, "delivering", "Đang giao tới người nhận (demo)", new Date(now - 10 * 60e3));
      }
    }
  }
}
