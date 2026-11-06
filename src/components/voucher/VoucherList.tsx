"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui";
import { VOUCHER_STATUS_LABEL, VOUCHER_STATUS_TONE } from "@/lib/voucher/shared";
import type { VoucherDTO } from "@/lib/voucher/api";
import { IssueVoucherDrawer } from "./IssueVoucherDrawer";

const dmy = (s: string) => new Date(s).toLocaleDateString("vi-VN");

/** Voucher của một khách (hồ sơ khách): mã, giá trị, hạn, trạng thái; nút tặng mã mới. */
export function VoucherList({ recordId }: { recordId: string }) {
  const [items, setItems] = useState<VoucherDTO[] | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`/api/vouchers?record=${encodeURIComponent(recordId)}`);
    setItems(r.ok ? (await r.json()).items : []);
  }, [recordId]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-ink-2">{items ? `${items.filter((v) => v.status === "issued").length} mã còn dùng được` : " "}</p>
        <button type="button" className="btn-outline h-8" onClick={() => setOpen(true)}>
          <Icon name="gift" size={14} /> Tặng voucher
        </button>
      </div>
      {items === null ? (
        <div className="skeleton h-16" />
      ) : !items.length ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-2">Khách chưa có voucher nào.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((v) => (
            <li key={v.id} className={`flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2 ${v.status === "issued" ? "" : "opacity-75"}`}>
              <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-accent-soft text-accent">
                <Icon name="gift" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="font-mono text-[14px] font-semibold hover:underline"
                    title="Bấm để chép mã"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(v.code).catch(() => undefined);
                      setCopied(v.id);
                      setTimeout(() => setCopied(""), 1200);
                    }}
                  >
                    {v.code}
                  </button>
                  {copied === v.id && <span className="text-[12px] text-success">Đã chép</span>}
                  <Badge tone={VOUCHER_STATUS_TONE[v.status]}>{VOUCHER_STATUS_LABEL[v.status]}</Badge>
                </p>
                <p className="truncate text-[12.5px] text-ink-2">
                  {v.campaign} · {v.value}
                </p>
                <p className="text-[12px] text-ink-2">
                  {v.status === "used" ? (
                    <>
                      Dùng {v.usedAt ? dmy(v.usedAt) : ""} · giảm {Math.round(v.discount).toLocaleString("vi-VN")}đ
                      {v.usedOrderId && (
                        <>
                          {" "}
                          ·{" "}
                          <Link href={`/w/orders/${v.usedOrderId}`} className="hover:underline">
                            {v.usedOrder || "xem đơn"}
                          </Link>
                        </>
                      )}
                    </>
                  ) : (
                    `Hạn đến ${dmy(v.expiresAt)}`
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <IssueVoucherDrawer open={open} onClose={() => setOpen(false)} recordId={recordId} onDone={load} />
    </div>
  );
}
