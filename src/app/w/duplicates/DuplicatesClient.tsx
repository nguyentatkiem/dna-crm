"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { ago } from "@/lib/format";
import type { RecordDTO } from "@/lib/records";

type Field = { key: string; label: string; type: string };
type Group = { key: string; ids: string[]; reasons: string[]; records: RecordDTO[] };
type Hist = { id: string; survivorId: string; merged: number; names: string[]; moved: Record<string, number>; by: string; at: string };
type Data = { fields: Field[]; statuses: { key: string; label: string; color: string }[]; groups: Group[]; total: number; history: Hist[] };

const MOVED_LABEL: Record<string, string> = { activities: "hoạt động", tasks: "việc", orders: "đơn hàng", quotes: "báo giá", contracts: "hợp đồng", tickets: "phiếu hỗ trợ", loyalty: "giao dịch điểm", warranties: "bảo hành", calls: "cuộc gọi", conversations: "hội thoại", outMessages: "tin đã gửi", enrollments: "kịch bản", surveys: "khảo sát", vouchers: "voucher", leadEvents: "lượt lead", docs: "tài liệu", linkedRecords: "giao dịch liên kết" };
const movedText = (m: Record<string, number>) => Object.entries(m).map(([k, n]) => `${n} ${MOVED_LABEL[k] ?? k}`).join(", ") || "không có liên kết";
const filled = (r: RecordDTO) => Object.values(r.data).filter((v) => String(v ?? "").trim() !== "").length;

export function DuplicatesClient() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [survivor, setSurvivor] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const scan = useCallback(async () => {
    setBusy("scan");
    setErr("");
    const r = await fetch("/api/c360/duplicates");
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setErr(j.error ?? "Không quét được");
    setD(j);
    setOpen((o) => o ?? j.groups[0]?.key ?? null);
  }, []);
  useEffect(() => {
    scan();
  }, [scan]);

  const survivorOf = (g: Group) => survivor[g.key] ?? [...g.records].sort((a, b) => filled(b) - filled(a) || b.score - a.score || a.createdAt.localeCompare(b.createdAt))[0]?.id;

  async function act(g: Group, action: "merge" | "ignore") {
    const sid = survivorOf(g);
    const losers = g.ids.filter((x) => x !== sid && !(skip[g.key] ?? []).includes(x));
    if (action === "merge") {
      if (!losers.length) return setMsg({ ok: false, text: "Chọn ít nhất một hồ sơ để gộp" });
      const keep = g.records.find((r) => r.id === sid);
      if (!confirm(`Gộp ${losers.length} hồ sơ vào “${keep?.title}”? Các hồ sơ phụ sẽ vào thùng rác (khôi phục được trong 30 ngày).`)) return;
    }
    setBusy(g.key);
    setMsg(null);
    const body = action === "merge" ? { action, survivorId: sid, loserIds: losers } : { action, ids: g.ids };
    const r = await fetch("/api/c360/duplicates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? "Không thực hiện được" });
    setMsg({ ok: true, text: action === "merge" ? `Đã gộp ${j.merged} hồ sơ, chuyển ${movedText(j.moved)}.` : "Đã đánh dấu không phải trùng, nhóm này sẽ không hiện lại." });
    setOpen(null);
    scan();
  }

  if (err) return <p className="mt-6 text-danger">{err}</p>;
  if (!d) return <div className="skeleton mt-6 h-48" />;
  const fieldRows = d.fields.filter((f) => d.groups.some((g) => g.records.some((r) => String(r.data[f.key] ?? "").trim())));

  return (
    <div className="mt-5 grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={scan} disabled={busy === "scan"}>
          <Icon name="refresh" size={15} /> {busy === "scan" ? "Đang quét…" : "Quét lại"}
        </button>
        <span className="text-[13.5px] text-ink-2">{d.total ? `${d.total} nhóm có thể trùng` : "Không thấy hồ sơ trùng"}</span>
      </div>
      {msg && (
        <p role="status" className={`rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}
      {!d.groups.length ? (
        <EmptyState icon="check" title="Danh bạ sạch sẽ" desc="Không có khách nào trùng số điện thoại, email hay tên + đuôi số. Hệ thống tự quét mỗi tuần và báo khi có nhóm mới." />
      ) : (
        <div className="grid gap-3">
          {d.groups.map((g) => {
            const isOpen = open === g.key;
            const sid = survivorOf(g);
            const skipped = skip[g.key] ?? [];
            return (
              <section key={g.key} className="card overflow-hidden">
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-line-soft/40" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.key)}>
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-warning-soft text-warning">
                    <Icon name="copy" size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.records.map((r) => r.title).join(" · ")}</span>
                    <span className="block truncate text-[12.5px] text-ink-2">{g.reasons.join(" · ")}</span>
                  </span>
                  <span className="badge">{g.ids.length} hồ sơ</span>
                  <Icon name="chevron" size={15} className={isOpen ? "rotate-180" : ""} />
                </button>
                {isOpen && (
                  <div className="border-t border-line-soft p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-[13px]">
                        <thead>
                          <tr className="text-left text-ink-2">
                            <th className="w-36 py-1.5 pr-3 font-normal">Trường</th>
                            {g.records.map((r) => (
                              <th key={r.id} className="py-1.5 pr-3 align-top font-normal">
                                <label className="flex items-center gap-1.5 font-medium text-ink">
                                  <input type="radio" name={`keep-${g.key}`} checked={sid === r.id} onChange={() => setSurvivor({ ...survivor, [g.key]: r.id })} /> Giữ hồ sơ này
                                </label>
                                {sid !== r.id && (
                                  <label className="mt-1 flex items-center gap-1.5">
                                    <input type="checkbox" checked={!skipped.includes(r.id)} onChange={(e) => setSkip({ ...skip, [g.key]: e.target.checked ? skipped.filter((x) => x !== r.id) : [...skipped, r.id] })} /> Gộp vào
                                  </label>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-line-soft">
                            <td className="py-1.5 pr-3 text-ink-2">Tên</td>
                            {g.records.map((r) => (
                              <td key={r.id} className={`py-1.5 pr-3 font-medium ${sid === r.id ? "text-primary" : ""}`}>
                                <Link href={`/w/b/contacts?open=${r.id}`} className="hover:underline" target="_blank">
                                  {r.title}
                                </Link>
                              </td>
                            ))}
                          </tr>
                          {[
                            ["Trạng thái", (r: RecordDTO) => d.statuses.find((s) => s.key === r.status)?.label ?? r.status],
                            ["Phụ trách", (r: RecordDTO) => r.ownerName || "—"],
                            ["Điểm", (r: RecordDTO) => String(r.score)],
                            ["Tạo", (r: RecordDTO) => ago(r.createdAt)],
                          ].map(([label, fn]) => (
                            <tr key={label as string} className="border-t border-line-soft">
                              <td className="py-1.5 pr-3 text-ink-2">{label as string}</td>
                              {g.records.map((r) => (
                                <td key={r.id} className="py-1.5 pr-3">
                                  {(fn as (r: RecordDTO) => string)(r)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {fieldRows
                            .filter((f) => g.records.some((r) => String(r.data[f.key] ?? "").trim()))
                            .map((f) => {
                              const keepVal = String(g.records.find((r) => r.id === sid)?.data[f.key] ?? "").trim();
                              return (
                                <tr key={f.key} className="border-t border-line-soft">
                                  <td className="py-1.5 pr-3 text-ink-2">{f.label}</td>
                                  {g.records.map((r) => {
                                    const v = String(r.data[f.key] ?? "").trim();
                                    const fills = r.id !== sid && v && !keepVal;
                                    return (
                                      <td key={r.id} className={`max-w-[240px] truncate py-1.5 pr-3 ${fills ? "text-success" : ""}`} title={fills ? "Sẽ được điền vào hồ sơ giữ lại" : v}>
                                        {v || <span className="text-ink-2">—</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-[12.5px] text-ink-2">Ô màu xanh sẽ được điền vào hồ sơ giữ lại. Đơn hàng, báo giá, phiếu hỗ trợ, cuộc gọi, tin nhắn, điểm thưởng… của hồ sơ phụ đều chuyển sang hồ sơ giữ lại.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn-primary" disabled={busy === g.key} onClick={() => act(g, "merge")}>
                        <Icon name="check" size={15} /> {busy === g.key ? "Đang gộp…" : "Gộp hồ sơ"}
                      </button>
                      <button className="btn-outline" disabled={busy === g.key} onClick={() => act(g, "ignore")}>
                        Không phải trùng
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {d.history.length > 0 && (
        <section className="card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="history" size={16} /> Đã gộp gần đây
          </h2>
          <ul className="mt-2 grid gap-1.5 text-[13px]">
            {d.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/w/b/contacts?open=${h.survivorId}`} className="font-medium text-primary hover:underline">
                  Gộp {h.merged} hồ sơ
                </Link>
                <span className="text-ink-2">
                  ({h.names.join(", ")}) · chuyển {movedText(h.moved)} · {h.by} · {ago(h.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
