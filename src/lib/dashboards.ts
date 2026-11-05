import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db, parseJson } from "./db";
import type { WorkspaceConfig } from "./config/schema";
import { ai, MODEL } from "./ai";
import {
  GROUP_KEYS,
  KPI_KEYS,
  KPI_LABEL,
  RANGES,
  RANK_KEYS,
  SERIES_KEYS,
  SERIES_LABEL,
  TEMPLATES,
  WIDGET_TYPES,
  Widget,
  buildWidgets,
  libraryOf,
  matchTemplate,
  pack,
  newId,
} from "@/app/w/dashboards/catalog";

/** Đọc widgetsJson an toàn: bỏ phần tử hỏng thay vì làm vỡ cả dashboard. */
export function parseWidgets(json: string): Widget[] {
  const raw = parseJson<unknown[]>(json, []);
  return (Array.isArray(raw) ? raw : []).flatMap((w) => {
    const p = Widget.safeParse(w);
    return p.success ? [p.data] : [];
  });
}

/** Tạo 3 dashboard mẫu cho workspace mới: Tổng quan kinh doanh (mặc định), Telesales, Marketing & ROAS. */
export async function seedDashboards(workspaceId: string, _cfg: WorkspaceConfig): Promise<void> {
  const existing = await db.dashboard.count({ where: { workspaceId } });
  if (existing) return;
  for (const [i, t] of TEMPLATES.entries()) {
    await db.dashboard.create({ data: { workspaceId, name: t.name, isDefault: i === 0, widgetsJson: JSON.stringify(buildWidgets(t.widgets)) } });
  }
}

const AiWidget = z.object({
  type: z.enum(WIDGET_TYPES),
  title: z.string(),
  w: z.number().int(),
  h: z.number().int(),
  metric: z.enum(KPI_KEYS).optional(),
  series: z.enum(SERIES_KEYS).optional(),
  groupBy: z.enum(GROUP_KEYS).optional(),
  rankBy: z.enum(RANK_KEYS).optional(),
  objectKey: z.enum(["contacts", "deals", "appointments"]).optional(),
  range: z.enum(RANGES).optional(),
  target: z.number().optional(),
  limit: z.number().int().optional(),
});
const AiDashboard = z.object({ name: z.string(), widgets: z.array(AiWidget) });

/** "AI tạo dashboard": Claude chọn widget theo mô tả. Không có AI thì chọn mẫu khớp từ khoá. */
export async function generateDashboard(prompt: string, cfg: WorkspaceConfig): Promise<{ name: string; widgets: Widget[]; source: "ai" | "template" }> {
  const c = ai();
  if (c) {
    try {
      const res = await c.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(AiDashboard) },
        system: "Bạn thiết kế dashboard CRM cho doanh nghiệp nhỏ Việt Nam. Chọn 6–12 widget hữu ích nhất, tiêu đề tiếng Việt ngắn gọn. Lưới rộng 12 cột: KPI và mục tiêu rộng 3–4, cao 2; biểu đồ rộng 4–8, cao 4.",
        messages: [
          {
            role: "user",
            content: `Doanh nghiệp: ${cfg.businessName} (ngành ${cfg.industry}). Bảng: ${cfg.objects.map((o) => `${o.key}="${o.label}"`).join(", ")}.
Loại widget: kpi/goal (metric: ${KPI_KEYS.map((k) => `${k}=${KPI_LABEL[k]}`).join(", ")}; goal cần target là số), bar/line/area (series: ${SERIES_KEYS.map((k) => `${k}=${SERIES_LABEL[k]}`).join(", ")}), pie/donut (groupBy: status/source/channel/owner + objectKey), funnel, leaderboard (rankBy: revenue/calls/score), table (objectKey, limit), overdue (việc quá hạn), activity (hoạt động gần đây).
range: 7d/30d/90d/month/quarter/all.
Mô tả người dùng: "${prompt}"`,
          },
        ],
      });
      const out = res.parsed_output;
      if (res.stop_reason !== "refusal" && out && out.widgets.length) {
        const specs = out.widgets.slice(0, 16).map((w) => {
          const lib = libraryOf(w.type);
          const { type, title, w: width, h, ...rest } = w;
          const config = Object.fromEntries(Object.entries({ ...lib.config, ...rest }).filter(([, v]) => v !== undefined && v !== null));
          const objOk = !config.objectKey || cfg.objects.some((o) => o.key === config.objectKey);
          return { type, title: title.slice(0, 80) || lib.title, w: Math.max(2, Math.min(12, width || lib.w)), h: Math.max(2, Math.min(8, h || lib.h)), config: objOk ? config : { ...config, objectKey: lib.config.objectKey } };
        });
        const widgets = pack(specs.map((s) => ({ ...s, id: newId() }))).flatMap((w) => {
          const p = Widget.safeParse(w);
          return p.success ? [p.data] : [];
        });
        if (widgets.length) return { name: out.name.slice(0, 80) || "Dashboard mới", widgets, source: "ai" };
      }
    } catch (e) {
      console.error("[Dashboard AI] dùng mẫu vì AI lỗi:", e instanceof Error ? e.message : e);
    }
  }
  const t = matchTemplate(prompt);
  return { name: t.name, widgets: buildWidgets(t.widgets), source: "template" };
}
