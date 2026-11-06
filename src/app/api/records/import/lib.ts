// Dùng chung cho các route nhập dữ liệu: đọc file, ghép cột, chống trùng theo SĐT.
import { NUMERIC_TYPES } from "@/lib/config/schema";
import { db, parseJson } from "@/lib/db";
import type { ObjectDef, WorkspaceConfig } from "@/lib/config/schema";
import { parseTable } from "@/lib/csv";
import { scoreContact } from "@/lib/records";
import { normPhone } from "@/lib/sources/ingest";
import { isXlsx, readXlsx } from "@/lib/xlsx";

export type ImportRow = { title: string; status?: string; ownerName?: string; amount?: number; data: Record<string, string | number> };
export type ImportResult = { created: number; merged: number; skipped: number };

export const MAX_ROWS = 5000;
export const MAX_BYTES = 10 * 1024 * 1024;

/** Đọc file người dùng tải lên (.xlsx, .csv, .tsv, .txt) thành bảng chuỗi. */
export async function readUpload(file: File): Promise<string[][]> {
  if (file.size > MAX_BYTES) throw new Error("File quá lớn (tối đa 10 MB). Hãy chia nhỏ file.");
  if (/\.xls$/i.test(file.name)) throw new Error("File .xls (Excel 97-2003) chưa hỗ trợ. Trong Excel: Tệp → Lưu thành → Sổ làm việc Excel (.xlsx).");
  const buf = new Uint8Array(await file.arrayBuffer());
  if (isXlsx(buf, file.name)) {
    try {
      return await readXlsx(buf, MAX_ROWS + 1);
    } catch {
      throw new Error("Không đọc được file Excel. Hãy mở lại bằng Excel và lưu dạng .xlsx.");
    }
  }
  return parseTable(new TextDecoder("utf-8").decode(buf));
}

const num = (v: string) => Number(v.replace(/[^\d.-]/g, "")) || 0;

/** Ghép bảng theo ánh xạ cột (giống hộp thoại nhập phía trình duyệt). */
export function mapRows(obj: ObjectDef, table: string[][], map: string[]): ImportRow[] {
  return table.slice(1).map((r) => {
    const out: ImportRow = { title: "", data: {} };
    map.forEach((k, i) => {
      const v = (r[i] ?? "").trim();
      if (!k || v === "") return;
      if (k === "__title") out.title = v;
      else if (k === "__status") out.status = v;
      else if (k === "__owner") out.ownerName = v;
      else if (k === "__amount") out.amount = num(v);
      else {
        const f = obj.fields.find((x) => x.key === k);
        if (!f || f.type === "formula") return;
        if (f.type === "checkbox") out.data[k] = /^(1|x|có|co|yes|true|đã|da|✓|✔)$/i.test(v) ? 1 : 0;
        else if (f.type === "progress") out.data[k] = Math.max(0, Math.min(100, num(String(v).replace("%", ""))));
        else if (NUMERIC_TYPES.includes(f.type)) out.data[k] = num(v);
        else if (f.type === "phone") out.data[k] = normPhone(v) || v;
        else if (f.type === "date") {
          const vn = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
          out.data[k] = vn ? `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}` : v;
        } else out.data[k] = v;
      }
    });
    return out;
  });
}

/**
 * Nhập hàng loạt. Bảng có cột SĐT thì chống trùng theo normPhone:
 * trùng khách cũ (hoặc trùng dòng phía trên) → gộp các trường đang trống vào mục cũ; không có gì mới → bỏ qua.
 * Không chạy tự động hoá để tránh tạo hàng nghìn việc.
 */
export async function importRows(
  ctx: { workspace: { id: string }; user: { name: string }; config: WorkspaceConfig },
  obj: ObjectDef,
  rows: ImportRow[],
  /** Trường chỉ xem với người nhập: không gộp vào khách đã có. */
  locked: Set<string> = new Set(),
): Promise<ImportResult> {
  const wid = ctx.workspace.id;
  const phoneKey = obj.fields.find((f) => f.type === "phone")?.key;
  const known = new Map<string, { id: string; data: Record<string, string | number> }>();
  if (phoneKey) {
    const old = await db.record.findMany({ where: { workspaceId: wid, objectKey: obj.key }, select: { id: true, dataJson: true } });
    for (const r of old) {
      const data = parseJson<Record<string, string | number>>(r.dataJson, {});
      const p = normPhone(String(data[phoneKey] ?? ""));
      if (p && !known.has(p)) known.set(p, { id: r.id, data });
    }
  }
  const statusByLabel = new Map(obj.statuses.flatMap((s) => [[s.key, s.key], [s.label.toLowerCase(), s.key]] as [string, string][]));
  const res: ImportResult = { created: 0, merged: 0, skipped: 0 };

  for (const r of rows) {
    if (!r.title.trim()) {
      res.skipped++;
      continue;
    }
    const p = phoneKey ? normPhone(String(r.data[phoneKey] ?? "")) : "";
    const hit = p ? known.get(p) : undefined;
    if (hit) {
      const add = Object.fromEntries(Object.entries(r.data).filter(([k, v]) => v !== "" && !locked.has(k) && (hit.data[k] === undefined || hit.data[k] === "")));
      if (!Object.keys(add).length) {
        res.skipped++;
        continue;
      }
      hit.data = { ...hit.data, ...add };
      await db.record.update({
        where: { id: hit.id },
        data: {
          dataJson: JSON.stringify(hit.data),
          activities: { create: [{ kind: "system", body: `Gộp thông tin từ file nhập: ${Object.keys(add).map((k) => obj.fields.find((f) => f.key === k)?.label ?? k).join(", ")}`, author: ctx.user.name }] },
        },
      });
      res.merged++;
      continue;
    }
    const created = await db.record.create({
      data: {
        workspaceId: wid,
        objectKey: obj.key,
        title: r.title.trim().slice(0, 200),
        status: statusByLabel.get((r.status ?? "").toLowerCase()) ?? obj.statuses[0].key,
        ownerName: r.ownerName ?? "",
        amount: r.amount ?? 0,
        score: obj.key === "contacts" ? scoreContact(r.data, ctx.config) : 0,
        dataJson: JSON.stringify(r.data),
        activities: { create: [{ kind: "system", body: "Nhập từ file Excel/CSV", author: ctx.user.name }] },
      },
      select: { id: true },
    });
    if (p) known.set(p, { id: created.id, data: r.data });
    res.created++;
  }
  await db.agentLog.create({
    data: { workspaceId: wid, agent: "Nhập dữ liệu", message: `Nhập vào ${obj.label}: tạo ${res.created}, gộp ${res.merged}, bỏ qua ${res.skipped} dòng trùng hoặc trống` },
  });
  return res;
}
