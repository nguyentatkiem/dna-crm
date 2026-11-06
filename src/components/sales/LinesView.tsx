// Bảng dòng hàng chỉ đọc + khối tổng tiền. Dùng ở trang chi tiết, trang in và trang công khai.
import { lineNet, moneyWords, type Line } from "@/lib/sales/lines";
import { money } from "@/lib/sales/shared";

export function LinesView({ lines, print }: { lines: Line[]; print?: boolean }) {
  return (
    <div className={print ? "" : "overflow-x-auto"}>
      <table className={`w-full text-[13.5px] ${print ? "" : "min-w-[560px]"}`}>
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-ink-2">
            <th className="w-8 py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Sản phẩm / dịch vụ</th>
            <th className="py-2 pr-2 text-right font-medium">SL</th>
            <th className="py-2 pr-2 text-right font-medium">Đơn giá</th>
            <th className="py-2 pr-2 text-right font-medium">CK</th>
            <th className="py-2 pr-2 text-right font-medium">VAT</th>
            <th className="py-2 text-right font-medium">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-line-soft align-top">
              <td className="py-2 pr-2 text-ink-2 tnum">{i + 1}</td>
              <td className="py-2 pr-2">
                <p className="font-medium">{l.name}</p>
                {(l.code || l.unit) && <p className="text-[12px] text-ink-2">{[l.code, l.unit].filter(Boolean).join(" · ")}</p>}
              </td>
              <td className="py-2 pr-2 text-right tnum">{l.qty.toLocaleString("vi-VN")}</td>
              <td className="py-2 pr-2 text-right tnum">{money(l.price)}</td>
              <td className="py-2 pr-2 text-right tnum">{l.discountPct ? `${l.discountPct}%` : "–"}</td>
              <td className="py-2 pr-2 text-right tnum">{l.vatPct ? `${l.vatPct}%` : "–"}</td>
              <td className="py-2 text-right font-medium tnum">{money(lineNet(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsBox({ t, paid, words }: { t: { subtotal: number; discount: number; vatTotal: number; total: number }; paid?: number; words?: boolean }) {
  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between gap-6 ${strong ? "border-t border-line pt-2 text-[16px] font-semibold" : "text-[13.5px]"}`}>
      <span className={strong ? "" : "text-ink-2"}>{label}</span>
      <span className="tnum">{v}</span>
    </div>
  );
  return (
    <div className="ml-auto grid w-full max-w-[340px] gap-1.5">
      {row("Cộng tiền hàng", money(t.subtotal))}
      {t.discount > 0 && row("Chiết khấu", `− ${money(t.discount)}`)}
      {row("Thuế VAT", money(t.vatTotal))}
      {row("Tổng cộng", money(t.total), true)}
      {paid !== undefined && row("Đã thu", money(paid))}
      {paid !== undefined && row("Còn nợ", money(Math.max(0, t.total - paid)))}
      {words && <p className="text-right text-[12.5px] italic text-ink-2">Bằng chữ: {moneyWords(t.total)}</p>}
    </div>
  );
}
