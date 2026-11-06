import { apiContext } from "@/lib/auth";
import { currentPeriod, isPeriod, prevPeriod } from "@/lib/kpi";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx";
import { perfBoard } from "@/lib/perf/review";
import { perfRole } from "@/lib/perf/server";
import { RANK_LABEL } from "@/lib/perf/shared";

const STATUS = { none: "Chưa đánh giá", draft: "Nháp", done: "Đã chốt" } as const;

/** Xuất bảng đánh giá tháng ra Excel. Nhân viên chỉ xuất được phiếu của mình. */
export async function GET(req: Request) {
  const ctx = await apiContext();
  if (!ctx?.config) return new Response("Bạn cần đăng nhập lại", { status: 401 });
  const p = new URL(req.url).searchParams.get("period") ?? prevPeriod(currentPeriod());
  if (!isPeriod(p)) return new Response("Tháng không hợp lệ", { status: 400 });
  const r = await perfRole(ctx);
  const board = await perfBoard(ctx.workspace.id, ctx.config, p, r.manager ? undefined : ctx.user.name);
  const buf = await buildXlsx([
    {
      name: `Đánh giá ${p}`,
      columns: [
        { header: "Hạng", kind: "number" },
        { header: "Nhân viên", kind: "text" },
        { header: "Đội", kind: "text" },
        ...board.criteria.map((c) => ({ header: `${c.label} (${c.weight}%)`, kind: "number" as const })),
        { header: "Tổng điểm", kind: "number" },
        { header: "Xếp loại", kind: "text" },
        { header: "Nhận xét", kind: "text" },
        { header: "Người đánh giá", kind: "text" },
        { header: "Trạng thái", kind: "text" },
      ],
      rows: board.rows.map((row, i) => [i + 1, row.who, row.teams.join(", "), ...board.criteria.map((c) => row.scores[c.id] ?? null), row.total, RANK_LABEL[row.rank], row.comment, row.reviewer, STATUS[row.status]]),
    },
  ]);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="danh-gia-${p}.xlsx"` } });
}
