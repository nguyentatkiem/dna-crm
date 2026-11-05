import { z } from "zod";

export const COLOR_KEYS = ["green", "orange", "red", "blue", "purple", "darkblue", "grass", "sky", "berry", "pink", "yellow", "gray"] as const;
export const ColorKey = z.enum(COLOR_KEYS);

export const OBJECT_KEYS = ["contacts", "deals", "appointments"] as const;
export const ObjectKey = z.enum(OBJECT_KEYS);

export const FIELD_TYPES = ["text", "longtext", "phone", "email", "number", "money", "date", "select", "rating", "formula"] as const;

export const Option = z.object({ key: z.string(), label: z.string(), color: ColorKey });

export const FieldDef = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(FIELD_TYPES),
  options: z.array(Option),
  // Chỉ dùng cho type = "formula": biểu thức kiểu Excel, ví dụ {so_luong} * {don_gia}.
  formula: z.string().optional(),
});

export const ObjectDef = z.object({
  key: ObjectKey,
  label: z.string(),
  itemLabel: z.string(),
  description: z.string(),
  statusLabel: z.string(),
  statuses: z.array(Option),
  fields: z.array(FieldDef),
  amountLabel: z.string(),
});

export const KPI_METRICS = ["won_amount", "open_amount", "new_contacts", "appointments", "win_rate", "hot_contacts"] as const;

export const AutomationDef = z.object({
  triggerType: z.enum(["record_created", "status_changed"]),
  triggerObject: ObjectKey,
  triggerValue: z.string(),
  actionType: z.enum(["create_task", "notify", "assign_owner"]),
  actionValue: z.string(),
});

export const WorkspaceConfigSchema = z.object({
  version: z.number(),
  industry: z.string(),
  businessName: z.string(),
  terminology: z.object({ contact: z.string(), deal: z.string(), appointment: z.string() }),
  modules: z.object({ appointments: z.boolean(), products: z.boolean(), invoices: z.boolean(), loyalty: z.boolean(), tickets: z.boolean() }),
  objects: z.array(ObjectDef),
  kpis: z.array(z.object({ label: z.string(), metric: z.enum(KPI_METRICS) })),
  automations: z.array(AutomationDef),
  team: z.array(z.string()),
  agents: z.array(z.string()),
});

export type ColorKey = z.infer<typeof ColorKey>;
export type ObjectKey = z.infer<typeof ObjectKey>;
export type Option = z.infer<typeof Option>;
export type FieldDef = z.infer<typeof FieldDef>;
export type ObjectDef = z.infer<typeof ObjectDef>;
export type AutomationDef = z.infer<typeof AutomationDef>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export function getObject(cfg: WorkspaceConfig, key: string) {
  return cfg.objects.find((o) => o.key === key);
}
