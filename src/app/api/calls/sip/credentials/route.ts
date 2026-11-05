import { NextResponse } from "next/server";
import { appApi, fail } from "@/lib/http";
import { getSettings } from "@/lib/settings";

/**
 * Thông tin đăng ký máy nhánh cho softphone trên trình duyệt (JsSIP cần mật khẩu để REGISTER).
 * Chỉ thành viên đã đăng nhập, không lưu cache. Mật khẩu máy nhánh vì vậy có mặt ở trình duyệt của nhân viên.
 */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const s = getSettings(a.ctx.workspace).sip ?? {};
  if (!(s.wsUri && s.domain && s.extension && s.password)) return fail("Chưa cấu hình tổng đài", 404);
  return NextResponse.json(
    { wsUri: s.wsUri, domain: s.domain, extension: s.extension, password: s.password, displayName: s.displayName || a.ctx.user.name },
    { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
  );
}
