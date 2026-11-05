// Khôi phục bằng dòng lệnh.
// Cách dùng:
//   npm run restore -- <file.json.gz> <workspaceId> [--from <workspaceId nguồn>]
//       → thay dữ liệu của một workspace bằng dữ liệu trong file (tự sao lưu bản hiện tại trước).
//   npm run restore -- <file.json.gz> --all --yes
//       → GHI ĐÈ TOÀN BỘ hệ thống (người dùng, mọi workspace) bằng bản sao lưu toàn hệ thống.
// Mẹo: chạy `npm run backup -- --list` để xem id workspace.
import { db } from "../src/lib/db";
import { createBackup, readBackup, restoreAll, restoreBackup } from "../src/lib/backup";
import { audit } from "../src/lib/audit";

async function main() {
  const [file, target, ...rest] = process.argv.slice(2);
  if (!file || !target) {
    console.log("Cách dùng:\n  npm run restore -- <file.json.gz> <workspaceId> [--from <id nguồn>]\n  npm run restore -- <file.json.gz> --all --yes");
    process.exit(1);
  }
  const info = await readBackup(file);
  console.log(`Bản sao lưu: ${info.scope === "all" ? "toàn hệ thống" : `workspace “${info.workspaceName}”`}, tạo lúc ${new Date(info.createdAt).toLocaleString("vi-VN")}, ${info.counts.record ?? 0} mục.`);

  if (target === "--all") {
    if (!rest.includes("--yes")) {
      console.error("Lệnh này ghi đè TOÀN BỘ dữ liệu. Thêm --yes nếu chắc chắn.");
      process.exit(1);
    }
    const safety = await createBackup();
    console.log(`Đã sao lưu dữ liệu hiện tại: ${safety.path}`);
    const r = await restoreAll(file);
    console.log(`✓ Đã khôi phục toàn hệ thống: ${Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(", ")}`);
    if (r.schemaMismatch) console.log("  Lưu ý: bản sao lưu tạo từ phiên bản schema khác. Cột mới nhận giá trị mặc định.");
    return;
  }

  const ws = await db.workspace.findUnique({ where: { id: target } });
  if (!ws) {
    console.error(`Không có workspace id "${target}". Xem danh sách: npm run backup -- --list`);
    process.exit(1);
  }
  const fromIdx = rest.indexOf("--from");
  const safety = await createBackup(ws.id);
  console.log(`Đã sao lưu dữ liệu hiện tại của “${ws.name}”: ${safety.path}`);
  const r = await restoreBackup(file, ws.id, { fromWorkspaceId: fromIdx >= 0 ? rest[fromIdx + 1] : undefined });
  await audit({ workspaceId: ws.id }, "backup.restore", "backup", file.split(/[\\/]/).pop() ?? file, `Khôi phục bằng dòng lệnh (${r.counts.record ?? 0} mục). Bản trước khi khôi phục: ${safety.name}`, r.counts);
  console.log(`✓ Đã khôi phục vào “${ws.name}”: ${Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(", ")}`);
  if (r.remapped) console.log(`  Dữ liệu lấy từ workspace “${r.sourceWorkspace}”, đã cấp id mới cho mọi mục.`);
  if (r.schemaMismatch) console.log("  Lưu ý: bản sao lưu tạo từ phiên bản schema khác. Cột mới nhận giá trị mặc định.");
}

main()
  .catch((e) => {
    console.error("✗ Khôi phục lỗi, dữ liệu giữ nguyên:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
