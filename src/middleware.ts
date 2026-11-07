import { NextResponse, type NextRequest } from "next/server";

// Chỉ kiểm tra có cookie (Edge không đọc được DB). Phiên thật (chữ ký, chưa bị thu hồi) kiểm ở getContext/requireApp.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("crm_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // Cho trang server biết đường dẫn hiện tại (requireApp dùng để chuyển tới trang bật 2 lớp khi bị bắt buộc).
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/w/:path*", "/onboarding/:path*"] };
