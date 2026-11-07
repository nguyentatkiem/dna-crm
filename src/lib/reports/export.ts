// Xuất kết quả báo cáo ra Excel (.xlsx) / CSV và bảng HTML cho email.
import { buildXlsx, type Cell as XCell, type ColKind as XKind } from "../xlsx";
import { toCsv } from "../csv";
import { fmtCell, type ReportResult } from "./shared";

const xkind = (k: ReportResult["columns"][number]["kind"]): XKind => (k === "money" ? "money" : k === "number" || k === "duration" || k === "percent" ? "number" : k === "date" ? "date" : "text");

export function reportSheetRows(r: ReportResult): XCell[][] {
  const rows: XCell[][] = r.rows.map((row) => row.map((v, i) => (r.columns[i].kind === "date" && v ? String(v).slice(0, 10) : v)));
  if (r.mode === "group" && r.rows.length > 1) rows.push(["Tổng", ...r.totals]);
  return rows;
}

export async function reportXlsx(name: string, r: ReportResult): Promise<Buffer> {
  return buildXlsx([{ name: name.slice(0, 31) || "Báo cáo", columns: r.columns.map((c) => ({ header: c.label, kind: xkind(c.kind) })), rows: reportSheetRows(r) }]);
}

export function reportCsv(r: ReportResult): string {
  const rows = reportSheetRows(r).map((row) => row.map((v) => (v instanceof Date ? v.toISOString() : v ?? "")) as (string | number)[]);
  return toCsv([r.columns.map((c) => c.label), ...rows]);
}

/** Tên file an toàn (ASCII) cho header Content-Disposition. */
export function fileName(name: string, ext: string) {
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${ascii || "bao-cao"}.${ext}`;
}

export function downloadHeaders(name: string, ext: "xlsx" | "csv", mime: string) {
  return { "Content-Type": mime, "Content-Disposition": `attachment; filename="${fileName(name, ext)}"; filename*=UTF-8''${encodeURIComponent(`${name}.${ext}`)}`, "Cache-Control": "no-store" };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Bảng HTML tóm tắt (tối đa 30 dòng) để đặt trong thân email. */
export function reportHtml(name: string, r: ReportResult, extra: { link?: string; note?: string } = {}) {
  const th = r.columns.map((c, i) => `<th style="text-align:${i && c.kind !== "text" ? "right" : "left"};padding:6px 10px;border-bottom:2px solid #d0d4e4;background:#f5f6f8;font-size:13px">${esc(c.label)}</th>`).join("");
  const td = (v: unknown, i: number, bold = false) => {
    const c = r.columns[i];
    return `<td style="text-align:${i && c.kind !== "text" ? "right" : "left"};padding:6px 10px;border-bottom:1px solid #e6e9ef;font-size:13px${bold ? ";font-weight:600" : ""}">${esc(fmtCell(v as never, c.kind))}</td>`;
  };
  const body = r.rows.slice(0, 30).map((row) => `<tr>${row.map((v, i) => td(v, i)).join("")}</tr>`).join("");
  const total = r.mode === "group" && r.rows.length > 1 ? `<tr>${["Tổng", ...r.totals].map((v, i) => td(v, i, true)).join("")}</tr>` : "";
  const more = r.rows.length > 30 ? `<p style="color:#676879;font-size:12px">… và ${r.rows.length - 30} dòng nữa trong file đính kèm.</p>` : "";
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#323338">
<h2 style="margin:0 0 4px;font-size:18px">${esc(name)}</h2>
<p style="margin:0 0 12px;color:#676879;font-size:13px">${esc(r.rangeLabel)} · ${r.scanned.toLocaleString("vi-VN")} dòng dữ liệu${r.truncated ? " (đã cắt bớt)" : ""}</p>
<table style="border-collapse:collapse;min-width:320px">${`<tr>${th}</tr>`}${body}${total}</table>${more}
${extra.note ? `<p style="color:#676879;font-size:12px">${esc(extra.note)}</p>` : ""}
${extra.link ? `<p style="margin-top:14px"><a href="${esc(extra.link)}" style="color:#0073ea">Tải file Excel (link hết hạn sau 7 ngày)</a></p>` : ""}
<p style="color:#a0a3b1;font-size:11px;margin-top:18px">Gửi tự động từ DNA CRM.</p></body></html>`;
}
