export async function register() {
  // Import nằm trong if để bản Edge bỏ hẳn nhánh này (jobs kéo theo module node:*).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobs } = await import("./lib/jobs");
    startJobs();
  }
}

/**
 * Next.js gọi hàm này khi trang / route handler / server action ném lỗi chưa bắt.
 * Ghi vào ErrorLog (trang Cài đặt → Kiểm tra kết nối), gắn workspace lấy từ cookie phiên nếu có.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // redirect() / notFound() dùng lỗi đặc biệt để điều hướng, không phải lỗi thật.
  const digest = (err as { digest?: string } | null)?.digest ?? "";
  if (/^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE)/.test(digest)) return;
  try {
    const { logError } = await import("./lib/errors");
    let workspaceId: string | undefined;
    const cookie = String(request.headers?.cookie ?? "");
    const tok = cookie.match(/(?:^|;\s*)crm_session=([^;]+)/)?.[1];
    if (tok) {
      const { verifySession } = await import("./lib/auth");
      workspaceId = (await verifySession(decodeURIComponent(tok)))?.wid;
    }
    await logError(err, { path: `${request.method} ${context.routePath || request.path}`, workspaceId });
  } catch (e) {
    console.error("[onRequestError]", e instanceof Error ? e.message : e);
  }
}
