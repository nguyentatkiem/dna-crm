import { apiContext } from "@/lib/auth";
import { buildXlsx, XLSX_MIME, type ColKind } from "@/lib/xlsx";
import { perfAccess } from "@/lib/perf/access";
import { overviewBoard, rangeFromQuery } from "@/lib/perf/board";
import { METRIC_DEFS, METRIC_KEYS, vnDate, type Unit } from "@/lib/perf/metrics";

const KIND: Record<Unit, ColKind> = { vnd: "money", count: "number", pct: "number", min: "number", hour: "number", day: "number", score: "number", star: "number", nps: "number" };
const UNIT_SUFFIX: Record<Unit, string> = { vnd: "", count: "", pct: " (%)", min: " (phút)", hour: " (giờ)", day: " (ngày)", score: " (0–100)", star: " (1–5)", nps: "" };

/** Xuất bảng tổng quan hiệu suất ra Excel (cùng bộ lọc và quyền như màn hình). */
export async function GET(req: Request) {
  const ctx = await apiContext();
  if (!ctx?.config) return new Response("Bạn cần đăng nhập lại", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const access = await perfAccess(ctx);
  const b = await overviewBoard(ctx.workspace.id, ctx.config, access, { ...rangeFromQuery(sp), teamId: sp.get("team") });
  const head = (k: (typeof METRIC_KEYS)[number]) => `${METRIC_DEFS[k].label}${UNIT_SUFFIX[METRIC_DEFS[k].unit]}`;
  const buf = await buildXlsx([
    {
      name: "Hiệu suất",
      columns: [
        { header: "Hạng", kind: "number" },
        { header: "Nhân viên", kind: "text" },
        { header: "Đội", kind: "text" },
        { header: "Điểm hiệu suất", kind: "number" },
        { header: "Điểm kỳ trước", kind: "number" },
        ...METRIC_KEYS.flatMap((k) => [
          { header: head(k), kind: KIND[METRIC_DEFS[k].unit] },
          ...(METRIC_DEFS[k].snapshot ? [] : [{ header: `${METRIC_DEFS[k].label} kỳ trước`, kind: KIND[METRIC_DEFS[k].unit] }]),
        ]),
      ],
      rows: [
        ...b.rows.map((r) => [r.rank, r.who, r.teams.join(", "), r.score, r.scorePrev, ...METRIC_KEYS.flatMap((k) => [r.cells[k].v, ...(METRIC_DEFS[k].snapshot ? [] : [r.cells[k].prev])])]),
        ...(b.group ? [[null, b.group.label, "", null, null, ...METRIC_KEYS.flatMap((k) => [b.group!.cells[k].v, ...(METRIC_DEFS[k].snapshot ? [] : [b.group!.cells[k].prev])])]] : []),
        [null, "Trung vị nhóm so sánh", "", null, null, ...METRIC_KEYS.flatMap((k) => [b.median[k], ...(METRIC_DEFS[k].snapshot ? [] : [null])])],
      ],
    },
    {
      name: "Định nghĩa",
      columns: [
        { header: "Chỉ số", kind: "text" },
        { header: "Nhóm", kind: "text" },
        { header: "Càng cao càng tốt", kind: "text" },
        { header: "Cách tính", kind: "text" },
      ],
      rows: METRIC_KEYS.map((k) => [METRIC_DEFS[k].label, { result: "Kết quả", activity: "Hoạt động", speed: "Tốc độ", quality: "Chất lượng" }[METRIC_DEFS[k].group], METRIC_DEFS[k].higherBetter ? "Có" : "Không", METRIC_DEFS[k].formula]),
    },
  ]);
  const name = `hieu-suat-${vnDate(b.range.cur.from)}_${vnDate(b.range.cur.to - 1)}.xlsx`;
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${name}"` } });
}
