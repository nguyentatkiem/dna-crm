"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ago, vnd } from "@/lib/format";
import { TL_KINDS, tlKind, type TimelineItem, type TlKind } from "@/lib/c360/kinds";
import type { ScorePart } from "@/lib/c360/scoring";

type Summary = {
  title: string;
  owner: string;
  status: string;
  totalSpent: number;
  orderCount: number;
  avgOrder: number;
  lastOrderAt: string | null;
  firstSeenAt: string;
  openTickets: number;
  avgCsat: number | null;
  lastNps: number | null;
  loyalty: { enabled: boolean; balance: number; earned: number; tier: { name: string; color: string } | null };
  score: number;
  scoreBreakdown: { current: number; profile: number; base: number; decay: number; idleWeeks: number; score: number; windowDays: number; enabled: boolean; parts: ScorePart[] } | null;
  rfm: { key: string; label: string; color: string; hint: string; code: string } | null;
  channels: string[];
};
type Page = { items: TimelineItem[]; next: string | null };

const dt = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayKey = (s: string) => new Date(s).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

function Tile({ label, value, hint, color }: { label: string; value: React.ReactNode; hint?: React.ReactNode; color?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line-soft bg-surface-2 px-3 py-2">
      <p className="truncate text-[12px] text-ink-2">{label}</p>
      <p className="mt-0.5 truncate text-[17px] font-semibold tnum" style={color ? { color } : undefined}>
        {value}
      </p>
      {hint && <p className="truncate text-[11.5px] text-ink-2">{hint}</p>}
    </div>
  );
}

/** Tab "360°" của khách: thẻ tổng quan, vì sao có điểm này, và dòng thời gian mọi điểm chạm. */
export function Customer360({ recordId }: { recordId: string }) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [kinds, setKinds] = useState<TlKind[]>([]);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const [why, setWhy] = useState(false);
  const sumFor = useRef("");
  // Mỗi lần tải mới (đổi khách/bộ lọc) tăng số này; phản hồi cũ về muộn thì bỏ qua, không ghi đè/nối nhầm.
  const seq = useRef(0);

  const load = useCallback(
    async (before?: string) => {
      const my = before ? seq.current : ++seq.current;
      const q = new URLSearchParams();
      if (before) q.set("before", before);
      if (kinds.length) q.set("kinds", kinds.join(","));
      if (sumFor.current === recordId) q.set("summary", "0");
      const r = await fetch(`/api/c360/${recordId}?${q}`).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (my !== seq.current) return;
      if (!r || !r.ok) return setErr(j.error ?? "Không tải được chân dung khách");
      if (j.summary) {
        sumFor.current = recordId;
        setSum(j.summary);
      }
      const page = j.timeline as Page;
      setItems((cur) => (before ? [...(cur ?? []), ...page.items] : page.items));
      setNext(page.next);
    },
    [recordId, kinds],
  );

  useEffect(() => {
    sumFor.current = "";
    setSum(null);
    setErr("");
  }, [recordId]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const toggle = (k: TlKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  if (err) return <p className="text-[13px] text-danger">{err}</p>;
  if (!sum) return <div className="skeleton h-40" />;
  const b = sum.scoreBreakdown;
  const npsColor = sum.lastNps == null ? undefined : sum.lastNps >= 9 ? "#00c875" : sum.lastNps <= 6 ? "#df2f4a" : "#fdab3d";

  let lastDay = "";
  return (
    <div className="grid gap-4">
      <section aria-label="Tổng quan khách" className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          {sum.rfm && (
            <span className="badge text-white" style={{ background: sum.rfm.color }} title={sum.rfm.hint}>
              RFM: {sum.rfm.label}
              {sum.rfm.code && ` · ${sum.rfm.code}`}
            </span>
          )}
          {sum.loyalty.enabled && sum.loyalty.tier && (
            <span className="badge text-white" style={{ background: sum.loyalty.tier.color }}>
              Hạng {sum.loyalty.tier.name}
            </span>
          )}
          <span>Biết đến từ {new Date(sum.firstSeenAt).toLocaleDateString("vi-VN")}</span>
          {sum.owner && <span>· Phụ trách {sum.owner}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Tổng chi tiêu" value={vnd(sum.totalSpent)} hint={`${sum.orderCount} đơn · TB ${vnd(sum.avgOrder)}`} />
          <Tile label="Mua gần nhất" value={sum.lastOrderAt ? ago(sum.lastOrderAt) : "Chưa mua"} hint={sum.lastOrderAt ? new Date(sum.lastOrderAt).toLocaleDateString("vi-VN") : undefined} />
          <Tile label="Hỗ trợ đang mở" value={sum.openTickets} hint={sum.avgCsat != null ? `CSAT TB ${sum.avgCsat}/5` : "Chưa có CSAT"} color={sum.openTickets ? "#df2f4a" : undefined} />
          <Tile label="NPS gần nhất" value={sum.lastNps ?? "—"} hint={sum.lastNps == null ? "Chưa khảo sát" : sum.lastNps >= 9 ? "Sẵn lòng giới thiệu" : sum.lastNps <= 6 ? "Chưa hài lòng" : "Trung lập"} color={npsColor} />
          <Tile label="Điểm thưởng" value={sum.loyalty.balance.toLocaleString("vi-VN")} hint={`Đã tích ${sum.loyalty.earned.toLocaleString("vi-VN")}`} />
          <button type="button" onClick={() => setWhy((v) => !v)} className="text-left" aria-expanded={why}>
            <Tile label="Điểm khách" value={`${sum.score}/100`} hint={<span className="text-primary">Vì sao điểm này?</span>} />
          </button>
          <div className="col-span-2 min-w-0 rounded-lg border border-line-soft bg-surface-2 px-3 py-2">
            <p className="text-[12px] text-ink-2">Kênh đã dùng</p>
            <div className="mt-1 flex flex-wrap gap-1">{sum.channels.length ? sum.channels.map((c) => <span key={c} className="badge">{c}</span>) : <span className="text-[13px] text-ink-2">Chưa có</span>}</div>
          </div>
        </div>
        {why && b && (
          <div className="rounded-lg border border-line-soft p-3 text-[13px]">
            {!b.enabled ? (
              <p className="text-ink-2">Chấm điểm theo hành vi đang tắt: điểm chỉ dựa vào độ đầy đủ hồ sơ và nguồn ({b.profile}).</p>
            ) : (
              <>
                <p className="font-medium">Điểm tính lại hiện tại: {b.score}/100 (trong {b.windowDays} ngày qua)</p>
                <ul className="mt-1 grid gap-0.5 text-ink-2">
                  <li className="flex justify-between gap-2">
                    <span>Hồ sơ & nguồn (điểm hồ sơ {b.profile})</span>
                    <span className="tnum">+{b.base}</span>
                  </li>
                  {b.parts.map((p) => (
                    <li key={p.key} className="flex justify-between gap-2">
                      <span>
                        {p.label} ×{p.count}
                      </span>
                      <span className={`tnum ${p.points < 0 ? "text-danger" : "text-success"}`}>
                        {p.points > 0 ? "+" : ""}
                        {p.points}
                      </span>
                    </li>
                  ))}
                  {b.decay > 0 && (
                    <li className="flex justify-between gap-2">
                      <span>{b.idleWeeks} tuần chưa tương tác</span>
                      <span className="tnum text-danger">−{b.decay}</span>
                    </li>
                  )}
                </ul>
                {b.score !== sum.score && <p className="mt-1 text-[12px] text-ink-2">Điểm sẽ tự cập nhật trong lần chấm điểm kế tiếp (mỗi giờ).</p>}
              </>
            )}
          </div>
        )}
        {sum.rfm && <p className="text-[12.5px] text-ink-2">{sum.rfm.hint}</p>}
      </section>

      <section aria-label="Dòng thời gian">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo loại">
          <button type="button" className={`chip ${kinds.length ? "" : "chip-on"}`} onClick={() => setKinds([])}>
            Tất cả
          </button>
          {TL_KINDS.map((k) => (
            <button key={k.key} type="button" aria-pressed={kinds.includes(k.key)} className={`chip ${kinds.includes(k.key) ? "chip-on" : ""}`} onClick={() => toggle(k.key)}>
              <Icon name={k.icon} size={13} /> {k.label}
            </button>
          ))}
        </div>
        {!items ? (
          <div className="skeleton mt-3 h-40" />
        ) : !items.length ? (
          <p className="mt-4 text-[13px] text-ink-2">Chưa có điểm chạm nào{kinds.length ? " thuộc loại đã chọn" : ""}.</p>
        ) : (
          <ol className="mt-3 grid gap-0">
            {items.map((it) => {
              const k = tlKind(it.kind);
              const day = dayKey(it.at);
              const head = day !== lastDay;
              lastDay = day;
              const body = (
                <>
                  <p className="text-[13.5px] font-medium leading-snug">{it.title}</p>
                  {it.detail && <p className="mt-0.5 whitespace-pre-line break-words text-[12.5px] text-ink-2">{it.detail}</p>}
                  <p className="mt-0.5 text-[11.5px] text-ink-2">
                    {dt(it.at)} · {k.label}
                  </p>
                </>
              );
              return (
                <li key={it.id}>
                  {head && <p className="mb-1 mt-3 text-[12px] font-medium capitalize text-ink-2 first:mt-0">{day}</p>}
                  <div className="relative flex gap-3 pb-3 pl-1">
                    <span className="absolute bottom-0 left-[17px] top-8 w-px bg-line-soft" aria-hidden />
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full" style={{ background: `${k.color}1f`, color: k.color }}>
                      <Icon name={it.icon} size={15} />
                    </span>
                    {it.href ? (
                      <Link href={it.href} className="min-w-0 flex-1 rounded-md hover:bg-line-soft/50">
                        {body}
                      </Link>
                    ) : (
                      <div className="min-w-0 flex-1">{body}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {next && (
          <button
            type="button"
            className="btn-outline mt-2 w-full"
            disabled={more}
            onClick={async () => {
              setMore(true);
              await load(next);
              setMore(false);
            }}
          >
            {more ? "Đang tải…" : "Xem cũ hơn"}
          </button>
        )}
      </section>
    </div>
  );
}
