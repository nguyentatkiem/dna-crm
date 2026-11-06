import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { can, getRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getPrivacy, maskRecord } from "@/lib/privacy";
import { toDTO } from "@/lib/records";
import { contactKeys } from "@/lib/c360/common";
import { ignoreGroup, mergeContacts, mergeHistory, scanDuplicates } from "@/lib/c360/dupes";
import { parseJson } from "@/lib/db";

/** Quét nhóm hồ sơ trùng. Chỉ chủ/quản lý (quyền xoá). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const role = await getRole(a.ctx.user.id, a.ctx.workspace.id);
  if (!can(role, "delete")) return fail("Chỉ chủ hoặc quản lý được gộp hồ sơ trùng", 403);
  const { groups, rows } = await scanDuplicates(a.ctx.workspace.id, a.ctx.config);
  const { obj } = contactKeys(a.ctx.config);
  const prefs = await getPrivacy(a.ctx.workspace.id);
  const history = await mergeHistory(a.ctx.workspace.id);
  return ok({
    fields: (obj?.fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type })),
    statuses: (obj?.statuses ?? []).map((s) => ({ key: s.key, label: s.label, color: s.color })),
    groups: groups.slice(0, 200).map((g) => ({
      ...g,
      records: g.ids.map((id) => {
        const r = rows.get(id)!;
        return maskRecord(toDTO(r), obj, role, prefs);
      }),
    })),
    total: groups.length,
    history: history.map((h) => ({ id: h.id, survivorId: h.survivorId, merged: parseJson<string[]>(h.mergedIds, []).length, names: parseJson<{ title: string }[]>(h.snapshotJson, []).map((s) => s.title), moved: parseJson<Record<string, number>>(h.movedJson, {}), by: h.by, at: h.createdAt.toISOString() })),
  });
}

const Body = z.union([
  z.object({ action: z.literal("merge"), survivorId: z.string().min(1), loserIds: z.array(z.string().min(1)).min(1).max(20) }),
  z.object({ action: z.literal("ignore"), ids: z.array(z.string().min(1)).min(2).max(50) }),
]);

/** Gộp một nhóm vào hồ sơ giữ lại, hoặc đánh dấu "không phải trùng". */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "delete")) return fail("Chỉ chủ hoặc quản lý được gộp hồ sơ trùng", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  if (p.data.action === "ignore") {
    await ignoreGroup(a.ctx.workspace.id, p.data.ids);
    await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "merge.ignore", "record", p.data.ids[0], `Đánh dấu ${p.data.ids.length} hồ sơ không phải trùng`);
    return ok({ ok: true });
  }
  try {
    return ok(await mergeContacts(a.ctx, p.data.survivorId, p.data.loserIds));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Không gộp được");
  }
}
