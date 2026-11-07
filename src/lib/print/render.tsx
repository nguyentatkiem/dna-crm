// Bộ dựng mẫu in dùng chung: trang in báo giá/đơn hàng/hợp đồng, trang báo giá công khai và xem trước trong trình soạn mẫu.
// Không import gì của server, nên chạy được cả ở Server Component lẫn Client Component.
import type { CSSProperties, ReactNode } from "react";
import { PaymentQr } from "@/components/pay/PaymentQr";
import { lineNet, moneyWords } from "@/lib/sales/lines";
import { dmy, money } from "@/lib/sales/shared";
import { BLOCKS, DOC_LABEL, fillVars, opt, type Align, type Block, type BlockType, type PrintCompany, type PrintData, type Size } from "./blocks";
import { varsOf } from "./doc";

/** CSS in bổ sung cho mẫu: ngăn trang. Dùng cùng PRINT_CSS của components/sales/print. */
export const TEMPLATE_PRINT_CSS = `
.pt-break { height: 0; }
@media print { .pt-break { break-after: page; page-break-after: always; } .pt-break-mark { display: none !important; } }
`;

const SIZE: Record<Size, string> = { sm: "text-[12.5px]", md: "text-[14px]", lg: "text-[15.5px]" };
const ALIGN: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };
const BOX: Record<Align, string> = { left: "mr-auto", center: "mx-auto", right: "ml-auto" };

type Ctx = { d: PrintData; c: PrintCompany; vars: Record<string, string>; preview: boolean };

function wrap(b: Block, node: ReactNode, defAlign: Align = "left") {
  if (node === null) return null;
  const cls = [SIZE[b.size ?? "md"], ALIGN[b.align ?? defAlign]].join(" ");
  return (
    <div key={b.id} data-block={b.type} className={cls}>
      {node}
    </div>
  );
}

function Company({ b, x }: { b: Block; x: Ctx }) {
  const { c } = x;
  const align = b.align ?? "left";
  const contact = [c.phone && `ĐT: ${c.phone}`, c.email, c.taxCode && `MST: ${c.taxCode}`].filter(Boolean).join(" · ");
  return (
    <div className={`flex min-w-0 items-start gap-3 ${align === "center" ? "flex-col items-center" : align === "right" ? "flex-row-reverse" : ""}`}>
      {opt<boolean>(b, "logo") && c.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logoUrl} alt="" className="h-14 w-14 flex-none rounded object-contain" />
      )}
      <div className="min-w-0">
        <p className="text-[1.2em] font-semibold">{c.name}</p>
        {opt<boolean>(b, "address") && c.address && <p className="text-[0.9em] text-ink-2">{c.address}</p>}
        {opt<boolean>(b, "contact") && contact && <p className="text-[0.9em] text-ink-2">{contact}</p>}
      </div>
    </div>
  );
}

function Title({ b, x }: { b: Block; x: Ctx }) {
  const text = fillVars(opt<string>(b, "text"), x.vars) || DOC_LABEL[x.d.docType];
  return (
    <div>
      <p className="text-[1.6em] font-bold uppercase tracking-wide">{text}</p>
      {opt<boolean>(b, "number") && <p className="tnum">Số: {x.d.number}</p>}
      {opt<boolean>(b, "date") && <p className="text-[0.9em] text-ink-2">Ngày {dmy(x.d.date)}</p>}
    </div>
  );
}

function Customer({ b, x }: { b: Block; x: Ctx }) {
  const { d } = x;
  const label = fillVars(opt<string>(b, "label"), x.vars);
  const contact = opt<boolean>(b, "contact") ? [d.customer.phone, d.customer.email].filter(Boolean).join(" · ") : "";
  const meta: ReactNode[] = [];
  if (opt<boolean>(b, "meta")) {
    if (d.title && d.docType !== "order") meta.push(<p key="t" className="font-medium">{d.title}</p>);
    if (d.docType === "quote") meta.push(<p key="v" className="text-[0.93em] text-ink-2">Hiệu lực đến: {d.validUntil ? dmy(d.validUntil) : "không giới hạn"}</p>);
    if (d.contract) meta.push(<p key="c" className="text-[0.93em] text-ink-2">Thời hạn: {x.vars.ngay_bat_dau} – {x.vars.ngay_ket_thuc}</p>);
  }
  return (
    <section className="grid gap-1 sm:grid-cols-2 print:grid-cols-2">
      <div>
        {label && <p className="section-title">{label}</p>}
        <p className="mt-0.5 font-semibold">{d.customer.name}</p>
        {contact && <p className="text-[0.93em] text-ink-2 tnum">{contact}</p>}
        {opt<boolean>(b, "ship") && d.customer.address && <p className="text-[0.93em] text-ink-2">Giao tới: {d.customer.address}</p>}
      </div>
      {meta.length > 0 && <div className="sm:text-right print:text-right">{meta}</div>}
    </section>
  );
}

function Items({ b, x }: { b: Block; x: Ctx }) {
  const lines = x.d.items;
  if (!lines.length) return null;
  const on = (k: string) => opt<boolean>(b, k);
  const th = "py-2 pr-2 font-medium";
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-line text-left text-[0.86em] text-ink-2">
          <th className={`w-8 ${th}`}>#</th>
          {on("colCode") && <th className={th}>Mã</th>}
          <th className={th}>Sản phẩm / dịch vụ</th>
          {on("colUnit") && <th className={th}>ĐVT</th>}
          {on("colQty") && <th className={`${th} text-right`}>SL</th>}
          {on("colPrice") && <th className={`${th} text-right`}>Đơn giá</th>}
          {on("colDiscount") && <th className={`${th} text-right`}>CK</th>}
          {on("colVat") && <th className={`${th} text-right`}>VAT</th>}
          {on("colAmount") && <th className="py-2 text-right font-medium">Thành tiền</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => {
          const sub = on("subLine") ? [!on("colCode") && l.code, !on("colUnit") && l.unit].filter(Boolean).join(" · ") : "";
          return (
            <tr key={i} className="border-b border-line-soft align-top">
              <td className="py-2 pr-2 text-ink-2 tnum">{i + 1}</td>
              {on("colCode") && <td className="py-2 pr-2 tnum">{l.code}</td>}
              <td className="py-2 pr-2">
                <p className="font-medium">{l.name}</p>
                {sub && <p className="text-[0.86em] text-ink-2">{sub}</p>}
              </td>
              {on("colUnit") && <td className="py-2 pr-2">{l.unit}</td>}
              {on("colQty") && <td className="py-2 pr-2 text-right tnum">{l.qty.toLocaleString("vi-VN")}</td>}
              {on("colPrice") && <td className="py-2 pr-2 text-right tnum">{money(l.price)}</td>}
              {on("colDiscount") && <td className="py-2 pr-2 text-right tnum">{l.discountPct ? `${l.discountPct}%` : "–"}</td>}
              {on("colVat") && <td className="py-2 pr-2 text-right tnum">{l.vatPct ? `${l.vatPct}%` : "–"}</td>}
              {on("colAmount") && <td className="py-2 text-right font-medium tnum">{money(lineNet(l))}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Totals({ b, x }: { b: Block; x: Ctx }) {
  const { d } = x;
  if (!d.items.length) return null;
  const t = d.totals;
  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between gap-6 ${strong ? "border-t border-line pt-2 text-[1.15em] font-semibold" : "text-[0.96em]"}`}>
      <span className={strong ? "" : "text-ink-2"}>{label}</span>
      <span className="tnum">{v}</span>
    </div>
  );
  const paid = opt<boolean>(b, "paid") && d.paid !== undefined;
  return (
    <div className={`grid w-full max-w-[340px] gap-1.5 text-left ${BOX[b.align ?? "right"]}`}>
      {row("Cộng tiền hàng", money(t.subtotal))}
      {t.discount > 0 && row("Chiết khấu", `− ${money(t.discount)}`)}
      {row("Thuế VAT", money(t.vatTotal))}
      {row("Tổng cộng", money(t.total), true)}
      {paid && row("Đã thu", money(d.paid ?? 0))}
      {paid && row("Còn nợ", money(Math.max(0, t.total - (d.paid ?? 0))))}
      {opt<boolean>(b, "words") && <p className="text-right text-[0.9em] italic text-ink-2">Bằng chữ: {moneyWords(t.total)}</p>}
    </div>
  );
}

function Terms({ b, x }: { b: Block; x: Ctx }) {
  const terms = x.d.terms;
  const bank = opt<boolean>(b, "bank") ? x.c.bank : "";
  if (!terms && !bank) return null;
  return (
    <section className="grid gap-2 text-[0.93em]">
      {terms && (
        <div>
          {opt<string>(b, "title") && <p className="section-title">{opt<string>(b, "title")}</p>}
          <p className="mt-0.5 whitespace-pre-line">{terms}</p>
        </div>
      )}
      {bank && (
        <div>
          <p className="section-title">Thông tin chuyển khoản</p>
          <p className="mt-0.5 whitespace-pre-line">{bank}</p>
        </div>
      )}
    </section>
  );
}

function Note({ b, x }: { b: Block; x: Ctx }) {
  if (!x.d.note) return null;
  const title = opt<string>(b, "title");
  return (
    <div>
      {title && <p className="section-title">{title}</p>}
      <p className="whitespace-pre-line text-[0.96em]">{x.d.note}</p>
    </div>
  );
}

function Qr({ b, x }: { b: Block; x: Ctx }) {
  const size = Math.min(320, Math.max(60, Number(opt<number>(b, "size")) || 140));
  if (!x.d.orderId) {
    return x.preview ? (
      <div className={`pt-break-mark grid place-items-center rounded border border-dashed border-line text-[12px] text-ink-2 ${BOX[b.align ?? "left"]}`} style={{ width: size, height: size }}>
        Mã QR thanh toán
      </div>
    ) : null;
  }
  return (
    <div className={`inline-block ${BOX[b.align ?? "left"]}`}>
      <PaymentQr orderId={x.d.orderId} amount={Math.max(0, Math.round(x.d.totals.total - (x.d.paid ?? 0)))} size={size} showInfo={opt<boolean>(b, "info")} />
    </div>
  );
}

function Signatures({ b, x }: { b: Block; x: Ctx }) {
  return (
    <section className="sign-boxes mt-4 grid grid-cols-2 gap-6 text-center">
      <div>
        <p className="font-semibold">{fillVars(opt<string>(b, "left"), x.vars)}</p>
        <p className="text-[0.86em] text-ink-2">(Ký, ghi rõ họ tên)</p>
        <div className="h-24" />
      </div>
      <div>
        <p className="font-semibold">{fillVars(opt<string>(b, "right"), x.vars)}</p>
        <p className="text-[0.86em] text-ink-2">(Ký, ghi rõ họ tên)</p>
        <div className="h-20" />
        {opt<boolean>(b, "seller") && <p>{x.d.createdBy}</p>}
      </div>
    </section>
  );
}

function FreeText({ b, x }: { b: Block; x: Ctx }) {
  const text = fillVars(opt<string>(b, "text"), x.vars);
  const title = fillVars(opt<string>(b, "title"), x.vars);
  if (!text && !title) return x.preview ? <p className="text-ink-2">(Văn bản trống)</p> : null;
  return (
    <div>
      {title && <p className="section-title">{title}</p>}
      {text && <p className="mt-0.5 whitespace-pre-line">{text}</p>}
    </div>
  );
}

function Footer({ b, x }: { b: Block; x: Ctx }) {
  const text = fillVars(opt<string>(b, "text"), x.vars) || x.c.footer;
  if (!text) return null;
  return <footer className="border-t border-line pt-3 text-[0.86em] text-ink-2">{text}</footer>;
}

const R: Record<Exclude<BlockType, "pagebreak">, (p: { b: Block; x: Ctx }) => ReactNode> = {
  company: Company,
  title: Title,
  customer: Customer,
  items: Items,
  totals: Totals,
  terms: Terms,
  note: Note,
  qr: Qr,
  signatures: Signatures,
  text: FreeText,
  footer: Footer,
};

/** Kết quả của một khối có rỗng không (để bỏ khoảng trống). */
function renderBlock(b: Block, x: Ctx) {
  if (b.type === "pagebreak") {
    return (
      <div key={b.id} className="pt-break">
        {x.preview && <div className="pt-break-mark border-t border-dashed border-line text-center text-[11px] text-ink-2">Ngăn trang</div>}
      </div>
    );
  }
  const Comp = R[b.type];
  if (!Comp) return null;
  const node = Comp({ b, x });
  return node === null ? null : wrap(b, node, b.type === "footer" ? "center" : "left");
}

export type PrintDocProps = {
  layout: Block[];
  data: PrintData;
  company: PrintCompany;
  /** Bỏ các khối này (vd. trang công khai không in ô ký). */
  hide?: BlockType[];
  /** Trình soạn mẫu: hiện chỗ giữ cho khối rỗng và vạch ngăn trang. */
  preview?: boolean;
  /** Khối đang chọn trong trình soạn (viền nổi bật). */
  selected?: string | null;
  onSelect?: (id: string) => void;
  style?: CSSProperties;
};

/**
 * Dựng chứng từ theo danh sách khối. Khối "Logo & công ty" đứng ngay trước "Tiêu đề" căn phải thì
 * gộp thành một hàng đầu trang (như mẫu gốc).
 */
export function PrintDoc({ layout, data, company, hide = [], preview = false, selected, onSelect, style }: PrintDocProps) {
  const x: Ctx = { d: data, c: company, vars: varsOf(data, company), preview };
  const blocks = layout.filter((b) => !b.hidden && !hide.includes(b.type) && BLOCKS[b.type]);
  const out: ReactNode[] = [];
  const pick = (b: Block, node: ReactNode) =>
    onSelect ? (
      <div key={`s-${b.id}`} role="button" tabIndex={0} onClick={() => onSelect(b.id)} onKeyDown={(e) => e.key === "Enter" && onSelect(b.id)} className={`-m-1 cursor-pointer rounded p-1 outline-offset-2 ${selected === b.id ? "outline outline-2 outline-[var(--primary)]" : "hover:outline hover:outline-1 hover:outline-[var(--line)]"}`}>
        {node}
      </div>
    ) : (
      node
    );
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const next = blocks[i + 1];
    if (b.type === "company" && next?.type === "title" && (next.align ?? "left") === "right" && (b.align ?? "left") === "left") {
      const head = (
        <header key={`h-${b.id}`} className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div className={`${SIZE[b.size ?? "md"]} min-w-0`}>{pick(b, <Company b={b} x={x} />)}</div>
          <div className={`${SIZE[next.size ?? "md"]} text-right`}>{pick(next, <Title b={next} x={x} />)}</div>
        </header>
      );
      out.push(head);
      i++;
      continue;
    }
    const node = renderBlock(b, x);
    if (node !== null) out.push(<div key={`w-${b.id}`}>{pick(b, node)}</div>);
    else if (preview) out.push(<div key={`w-${b.id}`}>{pick(b, <p className="rounded border border-dashed border-line-soft px-2 py-1 text-[12px] text-ink-2">{BLOCKS[b.type].label} (chứng từ này không có dữ liệu)</p>)}</div>);
  }
  return (
    <article className="quote-sheet grid gap-5 text-[14px]" style={style}>
      {out}
    </article>
  );
}
