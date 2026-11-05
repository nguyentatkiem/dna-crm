// Sao lưu bằng dòng lệnh.
// Cách dùng:
//   npm run backup                 → sao lưu toàn hệ thống vào backups/ (kèm file .db khi dùng SQLite)
//   npm run backup -- <workspaceId> → chỉ một workspace, vào backups/<workspaceId>/
//   npm run backup -- --list       → liệt kê workspace và các bản đã có
// Thư mục lưu: biến BACKUP_DIR (mặc định ./backups).
import { db } from "../src/lib/db";
import { BACKUP_DIR, createBackup, fmtSize, listBackups, pruneBackups } from "../src/lib/backup";

async function main() {
  const arg = process.argv[2];
  if (arg === "--list") {
    const wss = await db.workspace.findMany({ select: { id: true, name: true } });
    console.log(`Thư mục sao lưu: ${BACKUP_DIR()}`);
    console.log(`\nToàn hệ thống: ${(await listBackups()).map((b) => b.name).join(", ") || "chưa có"}`);
    for (const w of wss) console.log(`\n${w.name}  (id: ${w.id})\n  ${(await listBackups(w.id)).map((b) => `${b.name} ${fmtSize(b.size)}`).join("\n  ") || "chưa có"}`);
    return;
  }
  if (arg && !(await db.workspace.findUnique({ where: { id: arg } }))) {
    console.error(`Không có workspace id "${arg}". Xem danh sách: npm run backup -- --list`);
    process.exit(1);
  }
  const b = await createBackup(arg || undefined);
  const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
  const removed = await pruneBackups(arg || undefined, keep);
  console.log(`✓ Đã sao lưu: ${b.path} (${fmtSize(b.size)})`);
  if (b.dbFile) console.log(`✓ Bản sao file SQLite: ${b.dbFile}`);
  console.log(`  ${Object.entries(b.counts).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(", ")}`);
  if (removed) console.log(`  Đã xoá ${removed} bản cũ (giữ ${keep} bản, đổi bằng BACKUP_KEEP).`);
}

main()
  .catch((e) => {
    console.error("✗ Sao lưu lỗi:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
