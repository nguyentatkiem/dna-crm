import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { getRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { ViewInput } from "@/lib/views";
import { viewDTO } from "./shared";

/** Dạng xem của một bảng: của tôi + được chia sẻ với cả đội. ?object=contacts */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const object = new URL(req.url).searchParams.get("object") ?? "";
  if (!getObject(a.ctx.config, object)) return fail("Không có bảng này", 404);
  const [rows, role] = await Promise.all([
    db.boardView.findMany({ where: { workspaceId: a.ctx.workspace.id, objectKey: object, OR: [{ ownerId: a.ctx.user.id }, { shared: true }] }, orderBy: [{ shared: "asc" }, { name: "asc" }] }),
    getRole(a.ctx.user.id, a.ctx.workspace.id),
  ]);
  return ok(rows.map((v) => viewDTO(v, a.ctx.user.id, role)));
}

/** Lưu dạng xem mới từ trạng thái bảng hiện tại. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = ViewInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const { objectKey, name, shared = false, isDefault = false, state } = p.data;
  if (!getObject(a.ctx.config, objectKey)) return fail("Không có bảng này", 404);
  const wid = a.ctx.workspace.id;
  const count = await db.boardView.count({ where: { workspaceId: wid, objectKey, ownerId: a.ctx.user.id } });
  if (count >= 50) return fail("Mỗi bảng lưu tối đa 50 dạng xem cho mỗi người");
  // Mỗi người chỉ có một dạng xem mặc định cho mỗi bảng.
  if (isDefault) await db.boardView.updateMany({ where: { workspaceId: wid, objectKey, ownerId: a.ctx.user.id }, data: { isDefault: false } });
  const v = await db.boardView.create({ data: { workspaceId: wid, objectKey, name, ownerId: a.ctx.user.id, ownerName: a.ctx.user.name, shared, isDefault, stateJson: JSON.stringify(state) } });
  if (shared) await audit({ workspaceId: wid, user: a.ctx.user }, "view.create", "view", v.id, `Chia sẻ dạng xem “${name}” (${objectKey}) với cả đội`);
  return ok(viewDTO(v, a.ctx.user.id, await getRole(a.ctx.user.id, wid)), 201);
}
