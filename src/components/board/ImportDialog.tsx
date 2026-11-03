"use client";

import { useMemo, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import { norm, parseTable } from "@/lib/csv";
import { Icon } from "../Icon";

type Target = { key: string; label: string };

/** Nhập từ file CSV hoặc dán trực tiếp từ Excel / Google Sheets; tự ghép cột theo tên. */
export function ImportDialog({ obj, onClose, onDone }: { obj: ObjectDef; onClose: () => void; onDone: (msg: string) => void }) {
  const [table, setTable] = useState<string[][]>([]);
  const [map, setMap] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targets: Target[] = useMemo(
    () => [
      { key: "__title", label: obj.itemLabel + " (tên)" },
      { key: "__status", label: obj.statusLabel },
      { key: "__owner", label: "Phụ trách" },
      ...obj.fields.map((f) => ({ key: f.key, label: f.label })),
      ...(obj.amountLabel ? [{ key: "__amount", label: obj.amountLabel }] : []),
    ],
    [obj],
  );

  function load(text: string) {
    const t = parseTable(text);
    if (t.length < 2) {
      setError("Cần ít nhất một dòng tiêu đề và một dòng dữ liệu.");
      return;
    }
    setError("");
    setTable(t);
    // Tự ghép theo tên cột; cột đầu tiên mặc định là tên nếu không khớp gì.
    const guesses = t[0].map((h) => {
      const n = norm(h);
      const hit = targets.find((x) => norm(x.label).startsWith(n) || n.includes(norm(x.label.replace(/\s*\(.*\)/, ""))));
      if (hit) return hit.key;
      if (/^(ten|hoten|name|khachhang|fullname)$/.test(n)) return "__title";
      if (/(sdt|dienthoai|phone|sodienthoai)/.test(n)) return obj.fields.find((f) => f.type === "phone")?.key ?? "";
      return "";
    });
    if (!guesses.includes("__title")) guesses[0] = "__title";
    setMap(guesses);
  }

  async function submit() {
    setBusy(true);
    const rows = table.slice(1).map((r) => {
      const out = { title: "", status: undefined as string | undefined, ownerName: undefined as string | undefined, amount: undefined as number | undefined, data: {} as Record<string, string | number> };
      map.forEach((k, i) => {
        const v = r[i] ?? "";
        if (!k || v === "") return;
        if (k === "__title") out.title = v;
        else if (k === "__status") out.status = v;
        else if (k === "__owner") out.ownerName = v;
        else if (k === "__amount") out.amount = Number(v.replace(/[^\d.-]/g, "")) || 0;
        else {
          const f = obj.fields.find((x) => x.key === k);
          out.data[k] = f && (f.type === "number" || f.type === "money") ? Number(v.replace(/[^\d.-]/g, "")) || 0 : v;
        }
      });
      return out;
    });
    const res = await fetch("/api/records/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectKey: obj.key, rows }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Không nhập được");
    onDone(`Đã nhập ${d.created} mục${d.skipped ? `, bỏ qua ${d.skipped} dòng trùng số điện thoại hoặc trống` : ""}`);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label="Nhập dữ liệu" className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-40px)] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface shadow-panel">
        <header className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="text-[18px] font-semibold">Nhập {obj.label.toLowerCase()} từ Excel / CSV</h2>
          <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </header>
        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          {table.length === 0 ? (
            <>
              <label className="grid cursor-pointer place-items-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-8 text-center hover:border-primary">
                <Icon name="upload" size={26} className="text-primary" />
                <b>Chọn file .csv</b>
                <span className="text-[13px] text-ink-2">Trong Excel: Tệp → Lưu thành → CSV UTF-8</span>
                <input id="import-file" type="file" accept=".csv,.tsv,.txt" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); }} />
              </label>
              <div className="text-center text-[13px] text-ink-2">hoặc</div>
              <textarea id="import-paste" placeholder="Bôi đen bảng trong Excel / Google Sheets (gồm dòng tiêu đề), Ctrl+C rồi dán vào đây" className="textarea min-h-28" onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) { e.preventDefault(); load(t); } }} />
            </>
          ) : (
            <>
              <p className="text-[14px]">
                Tìm thấy <b>{table.length - 1} dòng</b>. Kiểm tra cột nào ứng với trường nào:
              </p>
              <div className="overflow-x-auto rounded border border-line-soft">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead className="bg-surface-2 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Cột trong file</th>
                      <th className="px-3 py-2 font-medium">Ví dụ</th>
                      <th className="px-3 py-2 font-medium">Nhập vào trường</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table[0].map((h, i) => (
                      <tr key={i} className="border-t border-line-soft">
                        <td className="px-3 py-1.5 font-medium">{h || `Cột ${i + 1}`}</td>
                        <td className="max-w-[200px] truncate px-3 py-1.5 text-ink-2">{table[1]?.[i]}</td>
                        <td className="px-3 py-1.5">
                          <select id={`map-${i}`} value={map[i]} onChange={(e) => setMap(map.map((m, k) => (k === i ? e.target.value : m)))} className="h-8 w-full rounded border border-line bg-surface px-2">
                            <option value="">Bỏ qua cột này</option>
                            {targets.map((t) => (
                              <option key={t.key} value={t.key}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {error && <p className="rounded bg-[#ffe0e5] px-3 py-2 text-[13px] text-[#a01c32]">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">
          {table.length > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setTable([])}>
              Chọn file khác
            </button>
          )}
          <button type="button" className="btn-primary" disabled={!table.length || !map.includes("__title") || busy} onClick={submit}>
            {busy ? "Đang nhập..." : `Nhập ${Math.max(table.length - 1, 0)} dòng`}
          </button>
        </footer>
      </div>
    </>
  );
}
