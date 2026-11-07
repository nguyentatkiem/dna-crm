"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Drawer, EmptyState, Stat } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { fold, money } from "@/lib/sales/shared";
import { MOVE_KIND, REASONS, fmtQty, moveQty, type MoveKind, type StockPref } from "@/lib/stock/shared";

type Item = { id: string; code: string; sku: string; name: string; unit: string; category: string; price: number; trackStock: boolean; stock: number; lowStock: number; active: boolean; value: number; low: boolean };
type Move = { id: string; qty: number; kind: string; note: string; balance: number; by: string; createdAt: string; orderId: string | null; orderNumber: string };
type VKind = "in" | "out" | "adjust";
type VLine = { productId: string; qty: string };

const VLABEL: Record<VKind, { title: string; qty: string; btn: string }> = {
  in: { title: "Phiếu nhập kho", qty: "SL nhập", btn: "Ghi phiếu nhập" },
  out: { title: "Phiếu xuất kho", qty: "SL xuất", btn: "Ghi phiếu xuất" },
  adjust: { title: "Phiếu kiểm kê", qty: "SL đếm được", btn: "Ghi kiểm kê" },
};

const dt = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function StockClient({ initial, pref: pref0, canManage, canProducts, canExport = true, initialView, openProduct }: { initial: Item[]; pref: StockPref; canManage: boolean; canProducts: boolean; canExport?: boolean; initialView: "tracked" | "low"; openProduct: string | null }) {
  const [items, setItems] = useState(initial);
  const [pref, setPref] = useState(pref0);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [view, setView] = useState<"tracked" | "low" | "all">(initialView);
  const [voucher, setVoucher] = useState<{ kind: VKind; reason: string; note: string; lines: VLine[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hist, setHist] = useState<{ item: Item; moves: Move[] | null } | null>(null);

  const tracked = useMemo(() => items.filter((p) => p.trackStock), [items]);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")), [items]);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return items.filter((p) => (view === "all" || p.trackStock) && (view !== "low" || p.low) && (!cat || p.category === cat) && (!f || fold(`${p.code} ${p.sku} ${p.name} ${p.category}`).includes(f)));
  }, [items, q, cat, view]);
  const lowCount = tracked.filter((p) => p.low).length;
  const totalValue = tracked.reduce((s, p) => s + p.value, 0);

  async function reload() {
    const r = await fetch("/api/stock").then((x) => x.json()).catch(() => null);
    if (r?.items) setItems(r.items);
  }

  const openHist = async (item: Item) => {
    setHist({ item, moves: null });
    const r = await fetch(`/api/stock/${item.id}`).then((x) => x.json()).catch(() => null);
    setHist((h) => (h && h.item.id === item.id ? { item, moves: r?.moves ?? [] } : h));
  };
  useEffect(() => {
    if (!openProduct) return;
    const it = initial.find((p) => p.id === openProduct);
    if (it) void openHist(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVoucher = (kind: VKind, productId?: string) => {
    setErr("");
    setVoucher({ kind, reason: REASONS[kind][0], note: "", lines: productId ? [{ productId, qty: kind === "adjust" ? String(items.find((p) => p.id === productId)?.stock ?? "") : "" }] : [{ productId: "", qty: "" }] });
  };
  const setLine = (i: number, patch: Partial<VLine>) => setVoucher((v) => (v ? { ...v, lines: v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : v));

  async function saveVoucher() {
    if (!voucher) return;
    setErr("");
    const lines = voucher.lines.filter((l) => l.productId && l.qty.trim() !== "").map((l) => ({ productId: l.productId, qty: Number(l.qty.replace(",", ".")) }));
    if (!lines.length) return setErr("Hãy chọn sản phẩm và nhập số lượng");
    if (lines.some((l) => !Number.isFinite(l.qty) || l.qty < 0)) return setErr("Số lượng không hợp lệ");
    setBusy(true);
    const res = await fetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: voucher.kind, reason: voucher.reason, note: voucher.note, lines }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Không ghi được phiếu");
    toast(`Đã ghi ${VLABEL[voucher.kind].title.toLowerCase()} ${j.number}`);
    setVoucher(null);
    await reload();
  }

  async function savePref(p: StockPref) {
    const old = pref;
    setPref(p);
    const res = await fetch("/api/stock/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }).catch(() => null);
    if (!res?.ok) {
      setPref(old);
      toast("Không lưu được cấu hình kho", "error");
    }
  }

  async function track(p: Item) {
    const res = await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackStock: !p.trackStock }) }).catch(() => null);
    if (!res?.ok) return toast("Không đổi được", "error");
    await reload();
  }

  const productOpts = tracked.filter((p) => p.active || voucher?.lines.some((l) => l.productId === p.id));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">Tồn kho</h1>
          <p className="mt-1 text-ink-2">
            Đơn hàng tự trừ kho khi chuyển sang <b>Đã xác nhận</b> (hoặc Đang giao / Hoàn tất) và hoàn kho khi huỷ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <button type="button" className="btn-primary" onClick={() => startVoucher("in")} disabled={!tracked.length}>
                <Icon name="plus" size={15} /> Nhập kho
              </button>
              <button type="button" className="btn-outline" onClick={() => startVoucher("out")} disabled={!tracked.length}>
                Xuất kho
              </button>
              <button type="button" className="btn-outline" onClick={() => startVoucher("adjust")} disabled={!tracked.length}>
                <Icon name="check" size={15} /> Kiểm kê
              </button>
            </>
          )}
          {canExport && (
            <a href="/api/stock/export" className="btn-ghost">
              <Icon name="download" size={15} /> Excel
            </a>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sản phẩm theo dõi tồn" value={tracked.length} icon="box" />
        <Stat label="Sắp hết / âm kho" value={lowCount} icon="bell" tone={lowCount ? "#df2f4a" : "#00c875"} />
        <Stat label="Giá trị tồn" value={money(totalValue)} hint="giá trị theo giá bán" icon="wallet" tone="#a25ddc" />
        <div className="card grid content-start gap-2 p-3 text-[13px]">
          <p className="font-medium">Cấu hình kho</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={pref.allowNegative} disabled={!canManage} onChange={(e) => savePref({ ...pref, allowNegative: e.target.checked })} />
            Cho bán âm kho
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={pref.lowStockAlert} disabled={!canManage} onChange={(e) => savePref({ ...pref, lowStockAlert: e.target.checked })} />
            Báo sắp hết hàng mỗi ngày
          </label>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="relative w-56 max-sm:w-full">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, SKU, tên" aria-label="Tìm sản phẩm" className="input h-8 pl-8" />
        </label>
        <label className="btn-ghost">
          <Icon name="filter" size={16} />
          <select aria-label="Lọc theo nhóm" value={cat} onChange={(e) => setCat(e.target.value)} className="max-w-[160px] bg-transparent outline-none">
            <option value="">Mọi nhóm</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Hiển thị">
          {(
            [
              ["tracked", "Đang theo dõi"],
              ["low", `Sắp hết${lowCount ? ` (${lowCount})` : ""}`],
              ["all", "Mọi sản phẩm"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-ink-2">{shown.length} mục</span>
      </div>

      {shown.length === 0 ? (
        <div className="card mt-4">
          <EmptyState
            icon="box"
            title={!tracked.length ? "Chưa có sản phẩm theo dõi tồn" : view === "low" ? "Không có sản phẩm sắp hết" : "Không có sản phẩm nào khớp"}
            desc={!tracked.length ? "Bật “Theo dõi tồn kho” cho sản phẩm vật lý ở trang Sản phẩm, hoặc chọn “Mọi sản phẩm”." : "Thử bỏ bộ lọc."}
            action={!tracked.length && view !== "all" ? { label: "Xem mọi sản phẩm", onClick: () => setView("all") } : undefined}
          />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[13px] text-ink-2">
                <th className="px-3 py-2.5 font-normal">Sản phẩm</th>
                <th className="px-2 py-2.5 font-normal">Nhóm</th>
                <th className="px-2 py-2.5 text-right font-normal">Tồn</th>
                <th className="px-2 py-2.5 text-right font-normal">Ngưỡng</th>
                <th className="px-2 py-2.5 text-right font-normal">Giá bán</th>
                <th className="px-2 py-2.5 text-right font-normal" title="Tồn × giá bán (chưa có giá vốn)">
                  Giá trị theo giá bán
                </th>
                <th className="px-3 py-2.5 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={`border-b border-line-soft last:border-0 hover:bg-[var(--row-hover)] ${p.active ? "" : "text-ink-2"}`}>
                  <td className="max-w-[300px] px-3 py-2.5">
                    <button type="button" className="block max-w-full truncate text-left font-medium hover:underline disabled:no-underline" disabled={!p.trackStock} onClick={() => openHist(p)}>
                      {p.name}
                    </button>
                    <p className="text-[12.5px] text-ink-2">{[p.code, p.sku && `SKU ${p.sku}`, p.unit].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">{p.category || "–"}</td>
                  <td className="px-2 py-2.5 text-right tnum">
                    {p.trackStock ? (
                      <span className="inline-flex items-center gap-1.5">
                        {p.low && <Badge tone="danger">{p.stock < 0 ? "Âm kho" : "Sắp hết"}</Badge>}
                        <b className={p.stock < 0 ? "text-danger" : ""}>{fmtQty(p.stock)}</b>
                      </span>
                    ) : (
                      <span className="text-ink-2">Không theo dõi</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right text-ink-2 tnum">{p.trackStock && p.lowStock ? fmtQty(p.lowStock) : "–"}</td>
                  <td className="px-2 py-2.5 text-right tnum">{money(p.price)}</td>
                  <td className="px-2 py-2.5 text-right tnum">{p.trackStock ? money(p.value) : "–"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {p.trackStock ? (
                      <>
                        <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => openHist(p)}>
                          <Icon name="history" size={14} /> Thẻ kho
                        </button>
                        {canManage && (
                          <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => startVoucher("in", p.id)} aria-label={`Nhập ${p.name}`}>
                            <Icon name="plus" size={14} />
                          </button>
                        )}
                      </>
                    ) : (
                      canProducts && (
                        <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => track(p)}>
                          Bật theo dõi
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={!!voucher}
        onClose={() => setVoucher(null)}
        title={voucher ? VLABEL[voucher.kind].title : ""}
        subtitle={voucher?.kind === "adjust" ? "Nhập số đếm được thực tế; hệ thống ghi phần chênh lệch." : undefined}
        width={560}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setVoucher(null)}>
              Huỷ
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={saveVoucher}>
              {voucher ? VLABEL[voucher.kind].btn : ""}
            </button>
          </>
        }
      >
        {voucher && (
          <div className="grid gap-3 p-5">
            <div className="segmented" role="group" aria-label="Loại phiếu">
              {(["in", "out", "adjust"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={voucher.kind === k} onClick={() => setVoucher({ ...voucher, kind: k, reason: REASONS[k][0] })}>
                  {MOVE_KIND[k].label}
                </button>
              ))}
            </div>
            <label className="grid gap-1">
              <span className="label">Lý do</span>
              <select className="input" value={voucher.reason} onChange={(e) => setVoucher({ ...voucher, reason: e.target.value })}>
                {REASONS[voucher.kind].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-2">
              <span className="label">Dòng hàng</span>
              {voucher.lines.map((l, i) => {
                const p = items.find((x) => x.id === l.productId);
                const qty = Number(l.qty.replace(",", "."));
                const after = p && l.qty.trim() !== "" && Number.isFinite(qty) ? p.stock + moveQty(voucher.kind, qty, p.stock) : null;
                return (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-start gap-2">
                    <div className="min-w-0">
                      <select className="input" aria-label={`Sản phẩm dòng ${i + 1}`} value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value, ...(voucher.kind === "adjust" ? { qty: String(items.find((x) => x.id === e.target.value)?.stock ?? "") } : {}) })}>
                        <option value="">Chọn sản phẩm…</option>
                        {productOpts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} (tồn {fmtQty(o.stock)})
                          </option>
                        ))}
                      </select>
                      {p && after !== null && (
                        <p className={`mt-0.5 text-[12px] ${after < 0 ? "text-danger" : "text-ink-2"}`}>
                          Tồn {fmtQty(p.stock)} → {fmtQty(after)} {p.unit}
                          {after < 0 && !pref.allowNegative ? " · vượt tồn" : ""}
                        </p>
                      )}
                    </div>
                    <input className="input tnum" inputMode="decimal" aria-label={VLABEL[voucher.kind].qty} placeholder={VLABEL[voucher.kind].qty} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^\d.,]/g, "") })} />
                    <button type="button" className="btn-ghost h-9 w-8 justify-center p-0 text-ink-2" aria-label={`Xoá dòng ${i + 1}`} onClick={() => setVoucher({ ...voucher, lines: voucher.lines.length > 1 ? voucher.lines.filter((_, j) => j !== i) : [{ productId: "", qty: "" }] })}>
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setVoucher({ ...voucher, lines: [...voucher.lines, { productId: "", qty: "" }] })}>
                  <Icon name="plus" size={14} /> Thêm dòng
                </button>
                {voucher.kind === "adjust" && (
                  <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setVoucher({ ...voucher, lines: tracked.filter((p) => p.active).map((p) => ({ productId: p.id, qty: String(p.stock) })) })}>
                    Kiểm kê toàn bộ ({tracked.filter((p) => p.active).length})
                  </button>
                )}
              </div>
            </div>
            <label className="grid gap-1">
              <span className="label">Ghi chú</span>
              <textarea className="textarea min-h-[60px]" value={voucher.note} maxLength={1000} onChange={(e) => setVoucher({ ...voucher, note: e.target.value })} placeholder="Nhà cung cấp, số hoá đơn, người giao…" />
            </label>
            {err && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
                {err}
              </p>
            )}
          </div>
        )}
      </Drawer>

      <Drawer open={!!hist} onClose={() => setHist(null)} title={hist ? `Thẻ kho · ${hist.item.name}` : ""} subtitle={hist ? `Tồn hiện tại: ${fmtQty(items.find((p) => p.id === hist.item.id)?.stock ?? hist.item.stock)} ${hist.item.unit}` : undefined} width={620}>
        {hist && (
          <div className="p-4">
            {canManage && (
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" className="btn-outline h-8 text-[13px]" onClick={() => startVoucher("in", hist.item.id)}>
                  Nhập
                </button>
                <button type="button" className="btn-outline h-8 text-[13px]" onClick={() => startVoucher("out", hist.item.id)}>
                  Xuất
                </button>
                <button type="button" className="btn-outline h-8 text-[13px]" onClick={() => startVoucher("adjust", hist.item.id)}>
                  Kiểm kê
                </button>
              </div>
            )}
            {hist.moves === null ? (
              <p className="py-6 text-center text-[13.5px] text-ink-2">Đang tải…</p>
            ) : hist.moves.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-ink-2">Chưa có phát sinh.</p>
            ) : (
              <ol className="grid gap-1.5">
                {hist.moves.map((m) => (
                  <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-line-soft px-3 py-2 text-[13px]">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={MOVE_KIND[m.kind as MoveKind]?.tone ?? "neutral"}>{MOVE_KIND[m.kind as MoveKind]?.label ?? m.kind}</Badge>
                        <span className="text-ink-2">{dt(m.createdAt)}</span>
                        {m.by && <span className="text-ink-2">· {m.by}</span>}
                      </p>
                      <p className="mt-0.5 truncate">
                        {m.orderId ? (
                          <Link href={`/w/orders/${m.orderId}`} className="hover:underline">
                            {m.note || m.orderNumber}
                          </Link>
                        ) : (
                          m.note || "–"
                        )}
                      </p>
                    </div>
                    <div className="text-right tnum">
                      <p className={`font-semibold ${m.qty < 0 ? "text-danger" : "text-success"}`}>
                        {m.qty > 0 ? "+" : ""}
                        {fmtQty(m.qty)}
                      </p>
                      <p className="text-[12px] text-ink-2">tồn {fmtQty(m.balance)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

