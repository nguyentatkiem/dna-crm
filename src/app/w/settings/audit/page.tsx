import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getRole } from "@/lib/permissions";
import { Icon } from "@/components/Icon";
import { ACTION_LABEL, auditWhere, PAGE_SIZE, type AuditFilter } from "./shared";
import { AuditTable, type Labels } from "./AuditTable";

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilter> }) {
  const { user, workspace, config } = await requireApp();
  const sp = await searchParams;
  const role = await getRole(user.id, workspace.id);
  if (!can(role, "see_all")) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="lock" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Chỉ chủ và quản lý xem được nhật ký thao tác</p>
        <Link href="/w/settings" className="btn-outline mt-4">Về Cài đặt</Link>
      </div>
    );
  }

  const page = Math.max(1, Number(sp.page) || 1);
  const where = auditWhere(workspace.id, sp);
  const [rows, total, people] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["userName"], where: { workspaceId: workspace.id }, orderBy: { userName: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Nhãn tiếng Việt cho tên trường và trạng thái theo từng bảng.
  const labels: Labels = {};
  for (const o of config.objects) {
    labels[o.key] = {
      fields: { title: "Tên", status: o.statusLabel, ownerName: "Người phụ trách", amount: o.amountLabel || "Giá trị", ...Object.fromEntries(o.fields.map((f) => [`data.${f.key}`, f.label])) },
      statuses: Object.fromEntries(o.statuses.map((s) => [s.key, s.label])),
      item: o.itemLabel,
    };
  }

  const qs = (patch: Partial<AuditFilter>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const hasFilter = !!(sp.user || sp.action || sp.from || sp.to);

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <span aria-hidden>←</span> Cài đặt
      </Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold">Nhật ký thao tác</h1>
          <p className="mt-1 text-ink-2">Ai đã tạo, sửa, xoá gì và khi nào. Bấm một dòng để xem chi tiết trước → sau.</p>
        </div>
        <a href={`/w/settings/audit/export${qs({ page: undefined })}`} className="btn-outline">
          <Icon name="download" size={16} /> Xuất CSV
        </a>
      </div>

      <form method="get" className="card mt-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <label className="min-w-0">
          <span className="label">Người</span>
          <select name="user" defaultValue={sp.user ?? ""} className="input">
            <option value="">Tất cả</option>
            {people.map((p) => (
              <option key={p.userName} value={p.userName}>{p.userName}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">Hành động</span>
          <select name="action" defaultValue={sp.action ?? ""} className="input">
            <option value="">Tất cả</option>
            <option value="record.*">Mọi thao tác trên dữ liệu</option>
            <option value="member.*">Mọi thao tác thành viên</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">Từ ngày</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="input" />
        </label>
        <label className="min-w-0">
          <span className="label">Đến ngày</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="input" />
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button className="btn-primary h-9">
            <Icon name="filter" size={15} /> Lọc
          </button>
          {hasFilter && <Link href="/w/settings/audit" className="btn-ghost h-9">Xoá lọc</Link>}
        </div>
      </form>

      <p className="mt-4 text-[13px] text-ink-2">
        {total.toLocaleString("vi-VN")} thao tác{hasFilter ? " khớp bộ lọc" : ""} · trang {page}/{pages}
      </p>

      {rows.length === 0 ? (
        <div className="card mt-2 grid place-items-center gap-2 px-4 py-14 text-center">
          <Icon name="history" size={32} className="text-ink-2" />
          <p className="font-semibold">{hasFilter ? "Không có thao tác nào khớp bộ lọc" : "Chưa có thao tác nào được ghi"}</p>
          <p className="max-w-sm text-[14px] text-ink-2">Mỗi lần ai đó tạo, sửa, xoá khách, đổi vai trò hay đổi phân quyền, hệ thống sẽ ghi lại ở đây.</p>
        </div>
      ) : (
        <AuditTable
          labels={labels}
          rows={rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), userName: r.userName, action: r.action, entity: r.entity, entityId: r.entityId, summary: r.summary, diffJson: r.diffJson }))}
        />
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Phân trang">
          {page > 1 ? <Link href={`/w/settings/audit${qs({ page: String(page - 1) })}`} className="btn-outline h-8">← Trước</Link> : <span className="btn-outline h-8 opacity-40">← Trước</span>}
          <span className="text-[13px] text-ink-2 tnum">{page} / {pages}</span>
          {page < pages ? <Link href={`/w/settings/audit${qs({ page: String(page + 1) })}`} className="btn-outline h-8">Sau →</Link> : <span className="btn-outline h-8 opacity-40">Sau →</span>}
        </nav>
      )}
    </div>
  );
}
