// 6 báo cáo mẫu dựng sẵn. Phụ thuộc cấu hình bảng (vd. trường "Nguồn" của Khách) nên dựng theo từng workspace.
import type { WorkspaceConfig } from "../config/schema";
import { datasetFields, type ReportConfig } from "./shared";

export type ReportTemplate = { key: string; name: string; description: string; icon: string; config: ReportConfig };

/** Trường "nguồn khách" của bảng Khách (trường chọn có khoá/nhãn chứa "nguon"/"nguồn"), không có thì theo trạng thái. */
function sourceField(cfg: WorkspaceConfig | null) {
  const fs = datasetFields("contacts", cfg).filter((f) => f.key.startsWith("d_") && f.type === "enum");
  const hit = fs.find((f) => /ngu[oồ]n|source/i.test(`${f.key} ${f.label}`));
  return hit?.key ?? "status";
}

export function reportTemplates(cfg: WorkspaceConfig | null): ReportTemplate[] {
  const base = { filters: [], columns: [], limit: 50 } as const;
  return [
    {
      key: "revenue_monthly",
      name: "Doanh thu theo tháng",
      description: "Tổng tiền, đã thu và số đơn (trừ đơn huỷ) theo từng tháng trong năm nay.",
      icon: "chart",
      config: {
        ...base,
        dataset: "orders",
        dateField: "createdAt",
        range: { preset: "this_year" },
        filters: [{ field: "status", op: "neq", value: "cancelled" }],
        groupBy: { field: "createdAt", bucket: "month" },
        metrics: [{ op: "sum", field: "total", label: "Doanh thu" }, { op: "sum", field: "paid", label: "Đã thu" }, { op: "count", label: "Số đơn" }],
        chart: "bar",
        columns: [],
      },
    },
    {
      key: "new_contacts_source",
      name: "Khách mới theo nguồn",
      description: "Số khách mới tạo trong 30 ngày qua, chia theo nguồn.",
      icon: "pie",
      config: { ...base, dataset: "contacts", dateField: "createdAt", range: { preset: "last30" }, groupBy: { field: sourceField(cfg) }, metrics: [{ op: "count", label: "Khách mới" }], chart: "pie", filters: [], columns: [] },
    },
    {
      key: "win_rate_owner",
      name: "Tỉ lệ chốt theo nhân viên",
      description: "Số giao dịch, tỉ lệ chốt và giá trị theo người phụ trách trong 90 ngày qua.",
      icon: "award",
      config: {
        ...base,
        dataset: "deals",
        dateField: "createdAt",
        range: { preset: "last90" },
        groupBy: { field: "ownerName" },
        metrics: [{ op: "count", label: "Giao dịch" }, { op: "rate", field: "won", label: "Tỉ lệ chốt" }, { op: "sum", field: "amount", label: "Giá trị" }],
        sort: { by: "m1", dir: "desc" },
        chart: "bar",
        filters: [],
        columns: [],
      },
    },
    {
      key: "orders_status",
      name: "Đơn theo trạng thái",
      description: "Số đơn và tổng tiền theo trạng thái trong tháng này.",
      icon: "cart",
      config: { ...base, dataset: "orders", dateField: "createdAt", range: { preset: "this_month" }, groupBy: { field: "status" }, metrics: [{ op: "count", label: "Số đơn" }, { op: "sum", field: "total", label: "Tổng tiền" }], chart: "pie", filters: [], columns: [] },
    },
    {
      key: "calls_outcome",
      name: "Cuộc gọi theo kết quả",
      description: "Số cuộc gọi và thời lượng trung bình theo kết quả trong 30 ngày qua.",
      icon: "phone",
      config: { ...base, dataset: "calls", dateField: "startedAt", range: { preset: "last30" }, groupBy: { field: "outcome" }, metrics: [{ op: "count", label: "Cuộc gọi" }, { op: "avg", field: "durationSec", label: "Thời lượng TB" }], chart: "bar", filters: [], columns: [] },
    },
    {
      key: "tickets_category",
      name: "Phiếu hỗ trợ theo loại",
      description: "Số phiếu, tỉ lệ đã xử lý và số giờ xử lý trung bình theo loại trong 90 ngày qua.",
      icon: "ticket",
      config: {
        ...base,
        dataset: "tickets",
        dateField: "createdAt",
        range: { preset: "last90" },
        groupBy: { field: "category" },
        metrics: [{ op: "count", label: "Số phiếu" }, { op: "rate", field: "resolved", label: "Đã xử lý" }, { op: "avg", field: "resolveHours", label: "Giờ xử lý TB" }],
        chart: "table",
        filters: [],
        columns: [],
      },
    },
  ];
}
