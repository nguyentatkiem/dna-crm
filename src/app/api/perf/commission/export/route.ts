import { apiContext } from "@/lib/auth";
import { currentPeriod, isPeriod } from "@/lib/kpi";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx";
import { commissionBoard } from "@/lib/perf/commission";
import { perfRole } from "@/lib/perf/server";

/** Xuất bảng hoa hồng tháng ra Excel. Nhân viên chỉ xuất được dòng của mình. */
export async function GET(req: Request) {
  const ctx = await apiContext();
  if (!ctx?.config) return new Response("Bạn cần đăng nhập lại", { status: 401 });
  const p = new URL(req.url).searchParams.get("period") ?? currentPeriod();
  if (!isPeriod(p)) return new Response("Tháng không hợp lệ", { status: 400 });
  const r = await perfRole(ctx);
  const b = await commissionBoard(ctx.workspace.id, ctx.config, p, r.manager ? undefined : ctx.user.name);
  const rows = b.rows.map((x) => [x.who, x.teams.join(", "), x.orders, x.revenue, x.commission, x.leaderOf.join(", "), x.leaderBonus, x.total]);
  if (r.manager) rows.push(["Tổng", "", b.rows.reduce((s, x) => s + x.orders, 0), b.rows.reduce((s, x) => s + x.revenue, 0), b.rows.reduce((s, x) => s + x.commission, 0), "", b.rows.reduce((s, x) => s + x.leaderBonus, 0), b.rows.reduce((s, x) => s + x.total, 0)]);
  const buf = await buildXlsx([
    {
      name: `Hoa hồng ${p}`,
      columns: [
        { header: "Nhân viên", kind: "text" },
        { header: "Đội", kind: "text" },
        { header: "Số đơn", kind: "number" },
        { header: b.rules.base === "paid" ? "Doanh thu đã thu" : "Doanh thu đơn hoàn tất", kind: "money" },
        { header: "Hoa hồng cá nhân", kind: "money" },
        { header: "Trưởng nhóm của", kind: "text" },
        { header: `Thưởng trưởng nhóm (${b.rules.teamLeaderPct}%)`, kind: "money" },
        { header: "Tổng nhận", kind: "money" },
      ],
      rows,
    },
  ]);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="hoa-hong-${p}.xlsx"` } });
}
