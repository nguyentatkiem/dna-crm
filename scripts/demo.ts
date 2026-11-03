// Tạo một workspace demo đã điền DNA và có dữ liệu mẫu, để xem thử ngay không cần đi qua wizard.
// Cách dùng: npm run demo -- [ngành]   (spa | bds | edu | retail | b2b | dental | fnb | auto | insurance | interior)
// Tài khoản demo: demo@dnacrm.local / demo12345 (chỉ dùng trên máy của bạn).
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { INDUSTRIES, defaultDna, type IndustryKey } from "../src/lib/dna";
import { buildTemplate } from "../src/lib/config/templates";
import { AGENTS } from "../src/lib/agents";
import { seedSample } from "../src/lib/sample";

const DEMO_EMAIL = "demo@dnacrm.local";
const DEMO_PASSWORD = "demo12345";

async function main() {
  const industry = (process.argv[2] ?? "spa") as IndustryKey;
  if (!INDUSTRIES[industry]) {
    console.log(`Ngành không hợp lệ. Chọn một trong: ${Object.keys(INDUSTRIES).join(", ")}`);
    process.exit(1);
  }
  const old = await db.user.findUnique({ where: { email: DEMO_EMAIL }, include: { memberships: true } });
  if (old) {
    await db.workspace.deleteMany({ where: { id: { in: old.memberships.map((m) => m.workspaceId) } } });
    await db.user.delete({ where: { id: old.id } });
  }
  const dna = defaultDna(industry);
  const cfg = buildTemplate(dna);
  const user = await db.user.create({ data: { email: DEMO_EMAIL, name: "Chủ Demo", passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) } });
  const ws = await db.workspace.create({ data: { name: cfg.businessName, industry, onboarded: true } });
  await db.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "owner" } });
  await db.dna.create({ data: { workspaceId: ws.id, dataJson: JSON.stringify(dna) } });
  await db.workspaceConfig.create({ data: { workspaceId: ws.id, version: 1, configJson: JSON.stringify(cfg), isActive: true } });
  await db.automation.createMany({ data: cfg.automations.map((a) => ({ workspaceId: ws.id, ...a, runs: Math.floor(Math.random() * 40) })) });
  for (const a of AGENTS) {
    await db.agentSetting.create({ data: { workspaceId: ws.id, agentKey: a.key, enabled: cfg.agents.includes(a.key) || a.key === "builder", autonomy: a.key === "copilot" ? "auto" : "suggest" } });
  }
  await db.agentLog.createMany({
    data: [
      { workspaceId: ws.id, agent: "DNA Architect", message: `Sinh cấu hình v1 cho ${cfg.businessName}` },
      { workspaceId: ws.id, agent: "Lead Qualifier", message: "Chấm điểm 14 khách mới" },
      { workspaceId: ws.id, agent: "Tự động hoá", message: "Tạo 3 việc gọi lại theo công thức" },
    ],
  });
  await seedSample(ws.id, cfg);
  console.log(`Đã tạo workspace demo "${cfg.businessName}" (${INDUSTRIES[industry].label}).`);
  console.log(`Đăng nhập: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().finally(() => db.$disconnect());
