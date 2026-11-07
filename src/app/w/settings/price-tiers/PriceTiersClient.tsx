"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import type { Tier } from "@/lib/care/shared";
import { priceFor, ruleText, type PriceRuleLite } from "@/lib/sales/pricing";
import { fold, money } from "@/lib/sales/shared";

type Rule = PriceRuleLite & { active: boolean; createdAt: string };
type Prod = { id: string; code: string; name: string; category: string; price: number };
type Draft = { target: "product" | "category" | "all"; productId: string; category: string; mode: "pct" | "fixed"; value: string };
const EMPTY: Draft = { target: "category", productId: "", category: "", mode: "pct", value: "" };

export function PriceTiersClient({ initial, tiers, loyaltyOn, products, canEdit }: { initial: Rule[]; tiers: Tier[]; loyaltyOn: boolean; products: Prod[]; canEdit: boolean }) {
  const sorted = useMemo(() => [...tiers].sort((a, b) => a.minPoints - b.minPoints), [tiers]);
  const [rules, setRules] = useState(initial);
  const [tier, setTier] = useState(sorted.find((t) => initial.some((r) => r.tier === t.name))?.name ?? sorted[1]?.name ?? sorted[0]?.name ?? "");
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")), [products]);
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? "(sản phẩm đã xoá)";
  const mine = rules.filter((r) => r.tier === tier);
  const t = sorted.find((x) => x.name === tier);

  const preview = useMemo(() => {
    const f = fold(q.trim());
    return products
      .filter((p) => !f || fold(`${p.code} ${p.name} ${p.category}`).includes(f))
      .map((p) => ({ p, r: priceFor({ basePrice: p.price, productId: p.id, category: p.category, tier, rules }) }));
  }, [products, rules, tier, q]);

  async function add() {
    const v = Number(d.value.replace(/[^\d.,]/g, "").replace(/\./g, d.mode === "fixed" ? "" : ".").replace(",", "."));
    if (!(v >= 0) || d.value.trim() === "") return toast(d.mode === "pct" ? "Nhập % chiết khấu" : "Nhập giá cố định", "error");
    if (d.target === "product" && !d.productId) return toast("Chọn sản phẩm", "error");
    if (d.target === "category" && !d.category) return toast("Chọn nhóm", "error");
    setBusy(true);
    const body = { tier, productId: d.target === "product" ? d.productId : "", category: d.target === "category" ? d.category : "", discountPct: d.mode === "pct" ? v : 0, price: d.mode === "fixed" ? v : null };
    const res = await fetch("/api/price-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(j.error ?? "Không lưu được", "error");
    setRules((xs) => [...xs, j]);
    setD({ ...EMPTY, target: d.target, mode: d.mode });
  }

  async function toggle(r: Rule) {
    setRules((xs) => xs.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)));
    const res = await fetch(`/api/price-rules/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !r.active }) }).catch(() => null);
    if (!res?.ok) {
      setRules((xs) => xs.map((x) => (x.id === r.id ? r : x)));
      toast("Không đổi được", "error");
    }
  }

  async function remove(r: Rule) {
    const res = await fetch(`/api/price-rules/${r.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast("Không xoá được", "error");
    setRules((xs) => xs.filter((x) => x.id !== r.id));
  }

  if (!sorted.length) {
    return (
      <div className="card mt-5">
        <EmptyState icon="award" title="Chưa có hạng thành viên" desc="Thiết lập các hạng ở trang Tích điểm trước." />
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-4">
      {!loyaltyOn && <p className="rounded-md bg-warning-soft px-3 py-2 text-[13.5px] text-warning">Tích điểm đang tắt nên giá hạng chưa được áp khi lập chứng từ.</p>}
      <div role="tablist" aria-label="Hạng thành viên" className="no-scrollbar flex gap-2 overflow-x-auto">
        {sorted.map((x) => {
          const n = rules.filter((r) => r.tier === x.name).length;
          return (
            <button key={x.name} role="tab" type="button" aria-selected={x.name === tier} onClick={() => setTier(x.name)} className={`chip flex-none gap-1.5 ${x.name === tier ? "chip-on" : ""}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
              {x.name}
              <span className="text-[12px] text-ink-2">{n ? `· ${n}` : ""}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card grid content-start gap-3 p-4">
          <h2 className="section-title">
            Quy tắc hạng {tier} {t ? <span className="font-normal normal-case text-ink-2">(từ {t.minPoints.toLocaleString("vi-VN")} điểm)</span> : null}
          </h2>
          {mine.length === 0 ? (
            <p className="text-[13.5px] text-ink-2">Chưa có quy tắc: khách hạng {tier} mua theo giá niêm yết.</p>
          ) : (
            <ul className="grid gap-1.5">
              {mine.map((r) => (
                <li key={r.id} className={`flex items-center gap-2 rounded-md border border-line-soft px-3 py-2 text-[13.5px] ${r.active ? "" : "opacity-60"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.productId ? pname(r.productId) : r.category ? `Nhóm “${r.category}”` : "Mọi sản phẩm"}</span>
                    <span className="block text-[12.5px] text-ink-2">{ruleText(r)}</span>
                  </span>
                  <input type="checkbox" role="switch" aria-label="Đang áp dụng" checked={r.active} disabled={!canEdit} onChange={() => toggle(r)} className="h-4 w-4 accent-[var(--primary)]" />
                  {canEdit && (
                    <button type="button" className="btn-ghost h-8 w-8 justify-center p-0 text-ink-2" aria-label="Xoá quy tắc" onClick={() => remove(r)}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="grid gap-2 rounded-md bg-surface-2 p-3">
              <p className="text-[13px] font-medium">Thêm quy tắc</p>
              <div className="segmented" role="group" aria-label="Áp cho">
                {(
                  [
                    ["product", "Sản phẩm"],
                    ["category", "Nhóm"],
                    ["all", "Mọi sản phẩm"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={d.target === k} onClick={() => setD({ ...d, target: k })}>
                    {l}
                  </button>
                ))}
              </div>
              {d.target === "product" && (
                <select className="input" aria-label="Sản phẩm" value={d.productId} onChange={(e) => setD({ ...d, productId: e.target.value })}>
                  <option value="">Chọn sản phẩm…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price)}
                    </option>
                  ))}
                </select>
              )}
              {d.target === "category" && (
                <select className="input" aria-label="Nhóm" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
                  <option value="">Chọn nhóm…</option>
                  {cats.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <select className="input w-auto" aria-label="Kiểu giá" value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value as Draft["mode"], value: "" })}>
                  <option value="pct">Giảm %</option>
                  <option value="fixed">Giá cố định</option>
                </select>
                <input
                  className="input tnum"
                  inputMode="decimal"
                  aria-label={d.mode === "pct" ? "Phần trăm giảm" : "Giá cố định"}
                  placeholder={d.mode === "pct" ? "vd. 10" : "vd. 3.500.000"}
                  value={d.mode === "fixed" && d.value ? Number(d.value.replace(/\D/g, "")).toLocaleString("vi-VN") : d.value}
                  onChange={(e) => setD({ ...d, value: d.mode === "fixed" ? e.target.value.replace(/\D/g, "") : e.target.value.replace(/[^\d.,]/g, "") })}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                />
                <button type="button" className="btn-primary" disabled={busy} onClick={add}>
                  <Icon name="plus" size={15} /> Thêm
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card grid content-start gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Xem trước giá hạng {tier}</h2>
            <input className="input h-8 w-48 max-sm:w-full" placeholder="Tìm sản phẩm" aria-label="Tìm sản phẩm xem trước" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-[12.5px] text-ink-2">
                  <th className="py-2 pr-2 font-normal">Sản phẩm</th>
                  <th className="py-2 pr-2 text-right font-normal">Niêm yết</th>
                  <th className="py-2 text-right font-normal">Giá hạng</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(({ p, r }) => (
                  <tr key={p.id} className="border-b border-line-soft last:border-0">
                    <td className="py-1.5 pr-2">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-[12px] text-ink-2">{p.category || "–"}</p>
                    </td>
                    <td className="py-1.5 pr-2 text-right tnum text-ink-2">{money(p.price)}</td>
                    <td className="py-1.5 text-right tnum">
                      {r.ruleId ? (
                        <>
                          <b>{money(r.price)}</b>
                          <span className="block text-[11.5px] text-success">{r.label.replace(`Giá hạng ${tier}`, "").trim() || "giá cố định"}</span>
                        </>
                      ) : (
                        <span className="text-ink-2">như niêm yết</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
