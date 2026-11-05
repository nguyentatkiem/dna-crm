"use client";

import { useMemo, useState } from "react";
import type { ObjectDef } from "@/lib/config/schema";
import { norm, parseTable } from "@/lib/csv";
import { Icon } from "../Icon";

type Target = { key: string; label: string };
type Result = { created: number; merged: number; skipped: number };

/**
 * Nhập từ file Excel (.xlsx) / CSV hoặc dán trực tiếp từ Excel / Google Sheets; tự ghép cột theo tên.
 * File được đọc ở server (xem trước 10 dòng), dữ liệu dán được đọc ngay trên trình duyệt.
 */
export function ImportDialog({ obj, onClose, onDone }: { obj: ObjectDef; onClose: () => void; onDone: (msg: string) => void }) {
  const [table, setTable] = useState<string[][]>([]);
  const [total, setTotal] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [map, setMap] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targets: Target[] = useMemo(
    () => [
      { key: "__title", label: obj.itemLabel + " (tên)" },
      { key: "__status", label: obj.statusLabel },
      { key: "__owner", label: "Phụ trách" },
      ...obj.fields.filter((f) => f.type !== "formula").map((f) => ({ key: f.key, label: f.label })),
      ...(obj.amountLabel ? [{ key: "__amount", label: obj.amountLabel }] : []),
    ],
    [obj],
  );

  function guess(header: string[]) {
    // Tự ghép theo tên cột; cột đầu tiên mặc định là tên nếu không khớp gì.
    const used = new Set<string>();
    const g = header.map((h) => {
      const n = norm(h);
      if (!n) return "";
      const hit = targets.find((x) => !used.has(x.key) && (norm(x.label) === n || norm(x.label).startsWith(n) || n.includes(norm(x.label.replace(/\s*\(.*\)/, "")))));
      let k = hit?.key ?? "";
      if (!k && /^(ten|hoten|hovaten|name|khachhang|fullname)$/.test(n)) k = "__title";
      if (!k && /(sdt|dienthoai|phone|sodienthoai|mobile)/.test(n)) k = obj.fields.find((f) => f.type === "phone")?.key ?? "";
      if (k && used.has(k)) k = "";
      if (k) used.add(k);
      return k;
    });
    if (!g.includes("__title")) g[0] = "__title";
    setMap(g);
  }

  function loadText(text: string) {
    const t = parseTable(text);
    if (t.length < 2) {
      setError("Cần ít nhất một dòng tiêu đề và một dòng dữ liệu.");
      return;
    }
    setError("");
    setFile(null);
    setTable(t);
    setTotal(t.length - 1);
    guess(t[0]);
  }

  async function loadFile(f: File) {
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/records/import/preview", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Không đọc được file");
    setFile(f);
    setTable([d.header, ...d.sample]);
    setTotal(d.total);
    guess(d.header);
  }

  async function submit() {
    setBusy(true);
    setError("");
    let res: Response;
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("objectKey", obj.key);
      fd.append("map", JSON.stringify(map));
      res = await fetch("/api/records/import", { method: "POST", body: fd });
    } else {
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
      res = await fetch("/api/records/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectKey: obj.key, rows }) });
    }
    const d = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Không nhập được");
    const parts = [`Đã tạo ${d.created ?? 0} mục`];
    if (d.merged) parts.push(`gộp ${d.merged} khách trùng số điện thoại`);
    if (d.skipped) parts.push(`bỏ qua ${d.skipped} dòng trùng hoặc trống`);
    onDone(parts.join(", "));
  }

  const reset = () => {
    setTable([]);
    setFile(null);
    setTotal(0);
    setError("");
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label="Nhập dữ liệu" className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-40px)] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface shadow-panel">
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="min-w-0 truncate text-[18px] font-semibold">Nhập {obj.label.toLowerCase()} từ Excel / CSV</h2>
          <button type="button" className="btn-ghost h-8 w-8 flex-none justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </header>
        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          {table.length === 0 ? (
            <>
              <label className={`grid cursor-pointer place-items-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-8 text-center hover:border-primary ${busy ? "opacity-60" : ""}`}>
                <Icon name="upload" size={26} className="text-primary" />
                <b>{busy ? "Đang đọc file..." : "Chọn file Excel (.xlsx) hoặc .csv"}</b>
                <span className="text-[13px] text-ink-2">Dòng đầu là tiêu đề cột. Tối đa 5.000 dòng, 10 MB.</span>
                <input
                  id="import-file"
                  type="file"
                  accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) loadFile(f);
                  }}
                />
              </label>
              <p className="text-center text-[13px] text-ink-2">
                Chưa có file?{" "}
                <a className="font-medium text-primary hover:underline" href={`/api/records/import/template?object=${obj.key}`}>
                  <Icon name="download" size={14} className="mr-0.5 inline align-[-2px]" />
                  Tải file mẫu .xlsx
                </a>
              </p>
              <div className="text-center text-[13px] text-ink-2">hoặc</div>
              <textarea
                id="import-paste"
                placeholder="Bôi đen bảng trong Excel / Google Sheets (gồm dòng tiêu đề), Ctrl+C rồi dán vào đây"
                className="textarea min-h-28"
                onPaste={(e) => {
                  const t = e.clipboardData.getData("text");
                  if (t) {
                    e.preventDefault();
                    loadText(t);
                  }
                }}
              />
            </>
          ) : (
            <>
              <p className="text-[14px]">
                {file && (
                  <span className="mr-1 inline-flex max-w-full items-center gap-1 rounded bg-surface-2 px-2 py-0.5 align-middle text-[13px]">
                    <Icon name="doc" size={14} /> <span className="truncate">{file.name}</span>
                  </span>
                )}
                Tìm thấy <b>{total.toLocaleString("vi-VN")} dòng</b>. Kiểm tra cột nào ứng với trường nào:
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
                        <td className="max-w-[200px] truncate px-3 py-1.5 text-ink-2">{table.slice(1, 4).map((r) => r[i]).filter(Boolean).join(" · ")}</td>
                        <td className="px-3 py-1.5">
                          <select id={`map-${i}`} value={map[i] ?? ""} onChange={(e) => setMap(map.map((m, k) => (k === i ? e.target.value : m)))} className="h-8 w-full rounded border border-line bg-surface px-2">
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
              {table.length > 1 && (
                <details className="rounded border border-line-soft">
                  <summary className="cursor-pointer px-3 py-2 text-[13px] text-ink-2">Xem trước {Math.min(table.length - 1, 10)} dòng đầu</summary>
                  <div className="overflow-x-auto border-t border-line-soft">
                    <table className="w-full text-[12.5px]">
                      <thead className="bg-surface-2 text-left">
                        <tr>
                          {table[0].map((h, i) => (
                            <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">
                              {h || `Cột ${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.slice(1, 11).map((r, j) => (
                          <tr key={j} className="border-t border-line-soft">
                            {table[0].map((_, i) => (
                              <td key={i} className="max-w-[180px] truncate whitespace-nowrap px-2 py-1">
                                {r[i]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              <p className="text-[12.5px] text-ink-2">Khách trùng số điện thoại với khách đã có sẽ được gộp: chỉ điền thêm các trường đang trống, không ghi đè.</p>
            </>
          )}
          {error && <p className="rounded bg-[#ffe0e5] px-3 py-2 text-[13px] text-[#a01c32]">{error}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3">
          {table.length > 0 && (
            <button type="button" className="btn-ghost" onClick={reset} disabled={busy}>
              Chọn file khác
            </button>
          )}
          <button type="button" className="btn-primary" disabled={!table.length || !map.includes("__title") || busy} onClick={submit}>
            {busy && table.length ? "Đang nhập..." : `Nhập ${total.toLocaleString("vi-VN")} dòng`}
          </button>
        </footer>
      </div>
    </>
  );
}
