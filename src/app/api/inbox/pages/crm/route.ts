import { z } from "zod";
import { audit } from "@/lib/audit";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { setPref } from "@/lib/prefs";
import { inboxCrmPref } from "@/lib/fb/pages";

/** Pref "inboxCrm": tự tạo khách từ SĐT trong chat, cập nhật SĐT/địa chỉ, chữ ký chung. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const acc = await accessOf(a.ctx);
  return ok({ value: await inboxCrmPref(a.ctx.workspace.id), canEdit: allow(acc, "inbox_settings") || allow(acc, "integrations_manage") });
}

const Body = z.object({
  autoCreateContact: z.boolean().optional(),
  autoUpdatePhone: z.boolean().optional(),
  autoAddress: z.boolean().optional(),
  signature: z.string().max(150, "Chữ ký tối đa 150 ký tự").optional(),
});

export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const acc = await accessOf(a.ctx);
  if (!allow(acc, "inbox_settings") && !allow(acc, "integrations_manage")) return fail("Bạn không có quyền cài đặt hộp thư", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const next = { ...(await inboxCrmPref(a.ctx.workspace.id)), ...p.data };
  next.signature = next.signature.trim();
  await setPref(a.ctx.workspace.id, "inboxCrm", next);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "pref", "inboxCrm", "Cài đặt CRM từ chat");
  return ok({ value: next });
}
