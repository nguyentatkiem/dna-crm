// Bản thể hiện hoá đơn (HTML in được) với đủ trường bắt buộc. Bản demo luôn có dấu "KHÔNG CÓ GIÁ TRỊ PHÁP LÝ".
import type { InvoiceDoc } from "./doc";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const vnd = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");
const dmy = (iso: string) => {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { d: g("day"), m: g("month"), y: g("year") };
};
const pct = (p: number) => (p ? `${p}%` : "0%");

export function invoiceHtml(doc: InvoiceDoc, opts: { status?: string; title?: string } = {}) {
  const dt = dmy(doc.date);
  const cancelled = opts.status === "cancelled";
  const pending = !doc.number;
  const stamp = doc.demo ? "BẢN DEMO – KHÔNG CÓ GIÁ TRỊ PHÁP LÝ" : cancelled ? "ĐÃ HUỶ" : pending ? "BẢN NHÁP – CHƯA PHÁT HÀNH" : "";
  const rows = doc.lines
    .map((l) => `<tr><td class="c">${l.no}</td><td>${esc(l.name)}</td><td class="c">${esc(l.unit)}</td><td class="r">${l.qty.toLocaleString("vi-VN")}</td><td class="r">${vnd(l.price)}</td><td class="r">${vnd(l.amount)}</td><td class="c">${pct(l.vatPct)}</td><td class="r">${vnd(l.vat)}</td></tr>`)
    .join("");
  const disc = doc.discount ? `<tr><td></td><td><i>Chiết khấu thương mại</i></td><td></td><td></td><td></td><td class="r">-${vnd(doc.discount)}</td><td></td><td></td></tr>` : "";
  const groups = doc.groups.map((g) => `<tr><td>Thuế suất ${pct(g.vatPct)}</td><td class="r">${vnd(g.base)}</td><td class="r">${vnd(g.vat)}</td><td class="r">${vnd(g.base + g.vat)}</td></tr>`).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(opts.title ?? `Hoá đơn ${doc.series} ${doc.number || "(nháp)"}`)}</title>
<style>
body{font-family:"Times New Roman",serif;color:#111;background:#f4f4f5;margin:0;padding:16px}
.sheet{position:relative;max-width:820px;margin:0 auto;background:#fff;padding:28px 32px;border:1px solid #ddd}
h1{font-size:22px;text-align:center;margin:4px 0;color:#9b1c1c;letter-spacing:.5px}
.sub{text-align:center;font-size:14px}
.meta{display:flex;justify-content:space-between;gap:16px;font-size:14px;margin-top:10px}
.box{border-top:1px solid #9b1c1c;margin-top:12px;padding-top:8px;font-size:14px;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:10px}
th,td{border:1px solid #999;padding:4px 6px;vertical-align:top}
th{background:#fbeaea}
.c{text-align:center}.r{text-align:right;white-space:nowrap}
.tot td{font-weight:bold}
.stamp{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.stamp span{transform:rotate(-24deg);font-size:34px;font-weight:bold;color:rgba(200,30,30,.22);border:4px solid rgba(200,30,30,.22);padding:8px 18px;text-align:center}
.sign{display:grid;grid-template-columns:1fr 1fr;text-align:center;margin-top:22px;font-size:14px;min-height:90px}
.note{font-size:12px;color:#555;margin-top:14px}
.bar{max-width:820px;margin:0 auto 10px;display:flex;justify-content:flex-end;gap:8px}
.bar button{font:14px system-ui;padding:6px 12px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer}
@media print{body{background:#fff;padding:0}.sheet{border:0}.bar{display:none}}
</style></head><body>
<div class="bar"><button onclick="window.print()">In / Lưu PDF</button></div>
<div class="sheet">
${stamp ? `<div class="stamp"><span>${esc(stamp)}</span></div>` : ""}
<h1>HOÁ ĐƠN GIÁ TRỊ GIA TĂNG</h1>
<div class="sub"><i>(Bản thể hiện của hoá đơn điện tử)</i></div>
<div class="sub">Ngày ${dt.d} tháng ${dt.m} năm ${dt.y}</div>
<div class="meta"><div>Mẫu số: <b>${esc(doc.templateNo)}</b><br>Ký hiệu: <b>${esc(doc.series)}</b><br>Số: <b>${esc(doc.number || "(chưa cấp)")}</b></div>
<div style="text-align:right">${doc.lookupCode ? `Mã tra cứu: <b>${esc(doc.lookupCode)}</b><br>` : ""}Theo đơn hàng: ${esc(doc.orderNumber)}</div></div>
<div class="box"><b>Đơn vị bán hàng:</b> ${esc(doc.seller.name)}<br>Mã số thuế: ${esc(doc.seller.taxCode || "—")}<br>Địa chỉ: ${esc(doc.seller.address || "—")}<br>Điện thoại: ${esc(doc.seller.phone || "—")}${doc.seller.bank ? `<br>Số tài khoản: ${esc(doc.seller.bank)}` : ""}</div>
<div class="box">Họ tên người mua hàng: ${esc(doc.buyer.name || "—")}<br>Tên đơn vị: ${esc(doc.buyer.company || "—")}<br>Mã số thuế: ${esc(doc.buyer.taxCode || "—")}<br>Địa chỉ: ${esc(doc.buyer.address || "—")}<br>Email: ${esc(doc.buyer.email || "—")}<br>Hình thức thanh toán: ${esc(doc.payMethod)} &nbsp; Đồng tiền: VND</div>
<table><thead><tr><th>STT</th><th>Tên hàng hoá, dịch vụ</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền chưa thuế</th><th>Thuế suất</th><th>Tiền thuế GTGT</th></tr></thead>
<tbody>${rows}${disc}</tbody></table>
<table><thead><tr><th>Tổng hợp</th><th>Thành tiền chưa thuế</th><th>Tiền thuế GTGT</th><th>Cộng tiền thanh toán</th></tr></thead>
<tbody>${groups}<tr class="tot"><td>Tổng cộng</td><td class="r">${vnd(doc.subtotal)}</td><td class="r">${vnd(doc.vatTotal)}</td><td class="r">${vnd(doc.total)}</td></tr></tbody></table>
<p style="font-size:14px;margin-top:10px">Số tiền viết bằng chữ: <b><i>${esc(doc.words)}</i></b></p>
<div class="sign"><div><b>Người mua hàng</b><br><i>(Chữ ký số (nếu có))</i></div><div><b>Người bán hàng</b><br><i>(Chữ ký số)</i>${doc.demo ? "<br><br><small>Chưa ký số – bản mô phỏng</small>" : ""}</div></div>
<p class="note">${doc.demo ? "Đây là hoá đơn mô phỏng do DNA CRM tạo ở chế độ demo, KHÔNG được gửi tới cơ quan thuế và không có giá trị pháp lý." : pending ? "Bản nháp từ DNA CRM để đối chiếu. Hoá đơn chỉ có giá trị khi đã được phát hành và ký số trên phần mềm hoá đơn điện tử của nhà cung cấp." : "Bản thể hiện do DNA CRM dựng lại từ thông tin hoá đơn đã phát hành; bản gốc có chữ ký số nằm trên hệ thống của nhà cung cấp."}</p>
</div></body></html>`;
}
