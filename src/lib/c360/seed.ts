// Dữ liệu mẫu cho Chân dung 360°: vài hồ sơ trùng rõ ràng, chạy RFM và chấm điểm một lần.
import { db } from "../db";
import { getPref, setPref } from "../prefs";
import { loadCfg } from "../marketing/store";
import { nextNumber } from "../counter";
import { contactKeys, dataOf } from "./common";
import { normPhoneVN } from "./dedupe";
import { recomputeRfm } from "./rfm-data";
import { recomputeScores } from "./behavior";

/** "0912345678" → "+84 912.345.678" (cùng số, khác cách viết). */
const reformat = (p: string) => {
  const d = normPhoneVN(p).slice(1);
  return d.length === 9 ? `+84 ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}` : p;
};

/** Gieo dữ liệu mẫu. Bỏ qua nếu đã gieo (Pref "c360_seed"). */
export async function seedC360(workspaceId: string): Promise<void> {
  if ((await getPref(workspaceId, "c360_seed", { done: false })).done) return;
  const cfg = await loadCfg(workspaceId);
  if (!cfg) return;
  const { obj, phoneKey, emailKey } = contactKeys(cfg);
  if (!obj) return;
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 40 });
  const withPhone = contacts.filter((c) => phoneKey && normPhoneVN(dataOf(c)[phoneKey]));
  const now = Date.now();
  // Hai khách bị nhập lại: cùng số nhưng viết kiểu +84 có dấu chấm, tên viết khác chút, thiếu vài trường.
  for (const [i, c] of withPhone.slice(2, 4).entries()) {
    const d = dataOf(c);
    const data: Record<string, unknown> = { [phoneKey]: reformat(String(d[phoneKey])) };
    if (i === 1 && emailKey && !d[emailKey]) data[emailKey] = `${c.id.slice(-6)}@khachmau.vn`;
    const first = c.title.split(" ").pop() ?? c.title;
    await db.record.create({
      data: { workspaceId, objectKey: "contacts", title: i === 0 ? c.title.toUpperCase() : `Chị ${first}`, status: obj.statuses[0]?.key ?? c.status, ownerName: "", score: Math.max(10, c.score - 20), dataJson: JSON.stringify(data), createdAt: new Date(now - (3 + i) * 864e5) },
    });
  }
  // Lịch sử mua hàng 18 tháng cho RFM khi workspace còn ít đơn: mỗi khách một kiểu (VIP, trung thành, mới, sắp rời bỏ, ngủ đông…).
  if ((await db.order.count({ where: { workspaceId, status: "done" } })) < 8) {
    const prods = await db.product.findMany({ where: { workspaceId, active: true }, take: 5 });
    // [số ngày trước của các đơn, giá trị mỗi đơn]
    const plans: [number[], number][] = [
      [[3, 25, 50, 80, 120, 170], 2.8e6],
      [[8, 40, 75, 110], 1.6e6],
      [[15, 60, 130], 9e5],
      [[2], 6.5e5],
      [[5], 3.5e5],
      [[45, 100], 7e5],
      [[95, 160, 230, 290], 2.2e6],
      [[150], 4e5],
      [[210, 260], 5e5],
      [[420], 1.2e6],
      [[30, 200], 8e5],
      [[12, 70, 140, 200, 260], 1.1e6],
    ];
    for (const [i, c] of contacts.slice(0, plans.length).entries()) {
      const [days, value] = plans[i];
      const d = dataOf(c);
      for (const [j, ago] of days.entries()) {
        const at = new Date(now - ago * 864e5);
        const p = prods[(i + j) % Math.max(1, prods.length)];
        const total = Math.round((value * (0.8 + ((i * 7 + j * 3) % 5) / 10)) / 1000) * 1000;
        const lines = [{ productId: p?.id ?? null, code: p?.code ?? "", name: p?.name ?? "Dịch vụ chăm sóc", unit: p?.unit ?? "lần", qty: 1, price: total, discountPct: 0, vatPct: 0 }];
        await db.order.create({
          data: { workspaceId, number: await nextNumber(workspaceId, "DH", at), contactId: c.id, customerName: c.title, customerPhone: phoneKey ? normPhoneVN(d[phoneKey]) : "", status: "done", itemsJson: JSON.stringify(lines), subtotal: total, total, paid: total, note: "Đơn mẫu", createdBy: "Hệ thống", createdAt: at, updatedAt: at },
        });
      }
    }
  }
  await recomputeRfm(workspaceId, cfg, { fire: false });
  await recomputeScores(workspaceId, cfg, { quiet: true });
  await setPref(workspaceId, "scoring_state", { lastRun: now, lastFull: now });
  await setPref(workspaceId, "c360_seed", { done: true });
}
