// Báo cáo mẫu cho workspace demo: 3 báo cáo từ mẫu dựng sẵn (một cái hẹn gửi hằng tuần). Chạy lại không tạo trùng.
import { db } from "../db";
import { activeConfig } from "./engine";
import { reportTemplates } from "./templates";

export async function seedReports(workspaceId: string, ownerId: string) {
  const cfg = await activeConfig(workspaceId);
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  const ts = reportTemplates(cfg);
  const plan = [
    { key: "revenue_monthly", shared: true, schedule: { freq: "weekly", hour: 8, weekday: 1, day: 1 }, recipients: owner?.email ? [owner.email] : [] },
    { key: "win_rate_owner", shared: true, schedule: { freq: "off", hour: 8, weekday: 1, day: 1 }, recipients: [] },
    { key: "calls_outcome", shared: false, schedule: { freq: "off", hour: 8, weekday: 1, day: 1 }, recipients: [] },
  ];
  let created = 0;
  for (const p of plan) {
    const t = ts.find((x) => x.key === p.key)!;
    if (await db.report.findFirst({ where: { workspaceId, name: t.name, createdBy: ownerId }, select: { id: true } })) continue;
    await db.report.create({ data: { workspaceId, name: t.name, configJson: JSON.stringify(t.config), scheduleJson: JSON.stringify(p.schedule), recipientsJson: JSON.stringify(p.recipients), shared: p.shared, createdBy: ownerId } });
    created++;
  }
  return created;
}
