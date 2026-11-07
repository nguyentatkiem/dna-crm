import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { accessOf } from "@/lib/permissions";
import { qrSvg } from "@/lib/security/qr";
import { newRecoveryCodes, newTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from "@/lib/security/totp";
import { checkSecondFactor, hashRecovery, needs2fa, securityPref } from "@/lib/security/sessions";

/**
 * Xác thực 2 lớp của chính mình.
 *   { action: "setup" }                      → tạo bí mật mới (chưa bật), trả mã QR + khoá nhập tay
 *   { action: "enable", code }               → xác nhận mã 6 số, bật, trả 10 mã khôi phục (chỉ hiện một lần)
 *   { action: "recovery", code }             → tạo lại 10 mã khôi phục (cần mã 6 số)
 *   { action: "disable", password, code }    → tắt (cần mật khẩu + mã 6 số hoặc mã khôi phục)
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { user, workspace } = a.ctx;
  const who = { workspaceId: workspace.id, user };
  const b = (await req.json().catch(() => ({}))) as { action?: string; code?: string; password?: string };

  if (b.action === "setup") {
    if (user.totpEnabled) return fail("Xác thực 2 lớp đang bật. Hãy tắt trước nếu muốn đổi điện thoại.");
    const secret = newTotpSecret();
    await db.user.update({ where: { id: user.id }, data: { totpSecret: sealSecret(secret) } });
    const uri = otpauthUri(secret, user.email);
    return ok({ qr: qrSvg(uri, 200), secret: secret.replace(/(.{4})/g, "$1 ").trim(), uri });
  }

  if (b.action === "enable") {
    if (user.totpEnabled) return fail("Xác thực 2 lớp đã bật rồi");
    const secret = user.totpSecret ? openSecret(user.totpSecret) : null;
    if (!secret) return fail("Hãy bấm Bắt đầu để tạo mã QR trước");
    if (!verifyTotp(secret, String(b.code ?? ""))) return fail("Mã chưa đúng. Kiểm tra giờ trên điện thoại rồi nhập mã mới nhất.");
    const codes = newRecoveryCodes();
    await db.user.update({ where: { id: user.id }, data: { totpEnabled: true, recoveryJson: JSON.stringify(await hashRecovery(codes)) } });
    await audit(who, "auth.2fa_on", "user", user.id, `${user.name} bật xác thực 2 lớp`);
    return ok({ enabled: true, codes });
  }

  if (b.action === "recovery") {
    if (!user.totpEnabled) return fail("Chưa bật xác thực 2 lớp");
    const secret = openSecret(user.totpSecret);
    if (!secret || !verifyTotp(secret, String(b.code ?? ""))) return fail("Mã xác thực chưa đúng");
    const codes = newRecoveryCodes();
    await db.user.update({ where: { id: user.id }, data: { recoveryJson: JSON.stringify(await hashRecovery(codes)) } });
    await audit(who, "auth.2fa_recovery", "user", user.id, `${user.name} tạo lại mã khôi phục`);
    return ok({ codes });
  }

  if (b.action === "disable") {
    if (!user.totpEnabled) return fail("Chưa bật xác thực 2 lớp");
    if (!(await bcrypt.compare(String(b.password ?? ""), user.passwordHash))) return fail("Mật khẩu chưa đúng");
    if (!(await checkSecondFactor(user, String(b.code ?? "")))) return fail("Mã xác thực chưa đúng");
    const pref = await securityPref(workspace.id);
    if (needs2fa(pref, await accessOf(a.ctx))) return fail("Workspace bắt buộc vai trò của bạn bật xác thực 2 lớp. Nhờ chủ workspace đổi chính sách nếu cần tắt.", 403);
    await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: "", recoveryJson: "[]" } });
    await audit(who, "auth.2fa_off", "user", user.id, `${user.name} tắt xác thực 2 lớp`);
    return ok({ enabled: false });
  }
  return fail("Thao tác không hợp lệ");
}
