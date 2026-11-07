// Dữ liệu cho trình dựng báo cáo phía client: danh mục trường theo nguồn (đã tính theo cấu hình workspace).
import type { WorkspaceConfig } from "@/lib/config/schema";
import { DATASETS, datasetFields, datasetLabel, type DatasetKey, type FieldMeta } from "@/lib/reports/shared";

export type BuilderMeta = { datasets: { key: DatasetKey; label: string; fields: FieldMeta[] }[] };

export function builderMeta(cfg: WorkspaceConfig | null): BuilderMeta {
  return { datasets: DATASETS.map((k) => ({ key: k, label: datasetLabel(k, cfg), fields: datasetFields(k, cfg) })) };
}
