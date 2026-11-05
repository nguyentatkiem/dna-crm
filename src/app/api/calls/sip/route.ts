import { z } from "zod";
import { isOwner } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appApi, fail, ok } from "@/lib/http";
import { getSettings, saveSettings, type Integrations } from "@/lib/settings";

type Sip = NonNullable<Integrations["sip"]>;

/** Bản trả về trình duyệt: mọi trường hiện rõ trừ mật khẩu (chỉ báo đã điền). */
const view = (s: Sip) => ({
  wsUri: s.wsUri ?? "",
  domain: s.domain ?? "",
  extension: s.extension ?? "",
  displayName: s.displayName ?? "",
  password: s.password ? `••••${s.password.slice(-2)}` : "",
  configured: !!(s.wsUri && s.domain && s.extension && s.password),
});

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(view(getSettings(a.ctx.workspace).sip ?? {}));
}

const Body = z.object({
  wsUri: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^wss?:\/\//i.test(v), "Địa chỉ WebSocket phải bắt đầu bằng wss:// (hoặc ws:// khi thử trong mạng nội bộ)"),
  domain: z.string().trim().max(200),
  extension: z.string().trim().max(60),
  password: z.string().max(200).optional(),
  displayName: z.string().trim().max(100).default(""),
});

/** Chủ workspace cấu hình tổng đài SIP dùng chung cho cả đội. Để trống mật khẩu = giữ mật khẩu cũ; xoá trắng cả form = tắt. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await isOwner(a.ctx.user.id, a.ctx.workspace.id))) return fail("Chỉ chủ workspace được cấu hình tổng đài", 403);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ");
  const b = parsed.data;
  const patch: Sip = { wsUri: b.wsUri, domain: b.domain.replace(/^sip:/i, ""), extension: b.extension, displayName: b.displayName };
  if (b.password && !b.password.startsWith("••••")) patch.password = b.password;
  // Xoá trắng địa chỉ, tên miền, máy nhánh = tắt softphone, xoá luôn mật khẩu.
  if (!b.wsUri && !b.domain && !b.extension) patch.password = "";
  const next = await saveSettings(a.ctx.workspace.id, { sip: patch });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "settings", "sip", `Cập nhật tổng đài SIP: ${patch.extension}@${patch.domain}`);
  return ok(view(next.sip ?? {}));
}
