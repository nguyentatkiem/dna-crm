// Chạy sau scripts/demo.ts trên database E2E: thêm nhân viên (member) và đánh dấu đã xem lời chào
// cho các tài khoản dùng chung (bài kiểm thử hướng dẫn tự tạo người dùng mới riêng).
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { USERS } from "./env";

const db = new PrismaClient();

async function main() {
  const owner = await db.user.findUniqueOrThrow({ where: { email: USERS.owner.email }, include: { memberships: true } });
  const workspaceId = owner.memberships[0].workspaceId;
  const staff = await db.user.create({ data: { email: USERS.staff.email, name: USERS.staff.name, passwordHash: await bcrypt.hash(USERS.staff.password, 10) } });
  await db.membership.create({ data: { userId: staff.id, workspaceId, role: "member" } });
  for (const u of [owner.id, staff.id]) {
    await db.pref.create({ data: { workspaceId, key: `tutorial:${u}`, valueJson: JSON.stringify({ welcomeSeen: true, checklistHidden: true }) } });
  }
  console.log(`E2E: workspace ${workspaceId}, nhân viên ${USERS.staff.email}`);
}

main().finally(() => db.$disconnect());
