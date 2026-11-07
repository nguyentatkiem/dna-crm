// Job nền của kho kiến thức (đăng ký trong src/lib/jobs.ts, ví dụ:
//   { name: "Đồng bộ sản phẩm vào kho kiến thức", everyMin: 60, run: () => tickKbProducts().then(() => undefined) }).
import { db } from "../db";
import { syncProducts } from "./store";

/** Đồng bộ bảng Product → kho kiến thức cho mọi workspace đã có kho (có ít nhất một KbDoc). */
export async function tickKbProducts(): Promise<{ workspaces: number; changed: number }> {
  const rows = await db.kbDoc.groupBy({ by: ["workspaceId"] });
  let changed = 0;
  for (const r of rows) {
    try {
      const s = await syncProducts(r.workspaceId);
      changed += s.added + s.updated + s.removed;
    } catch (e) {
      console.error("[kb jobs]", e instanceof Error ? e.message : e);
    }
  }
  return { workspaces: rows.length, changed };
}
