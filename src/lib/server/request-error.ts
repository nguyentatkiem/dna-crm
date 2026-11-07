// Ghi lỗi request vào ErrorLog, gắn workspace lấy từ cookie phiên nếu có. Chỉ chạy trên Node.
import { logError } from "../errors";
import { verifySession } from "../auth";

export async function reportRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: { routePath?: string }) {
  // redirect() / notFound() dùng lỗi đặc biệt để điều hướng, không phải lỗi thật.
  const digest = (err as { digest?: string } | null)?.digest ?? "";
  if (/^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE)/.test(digest)) return;
  try {
    let workspaceId: string | undefined;
    const tok = String(request.headers?.cookie ?? "").match(/(?:^|;\s*)crm_session=([^;]+)/)?.[1];
    if (tok) workspaceId = (await verifySession(decodeURIComponent(tok)))?.wid;
    await logError(err, { path: `${request.method} ${context.routePath || request.path}`, workspaceId });
  } catch (e) {
    console.error("[onRequestError]", e instanceof Error ? e.message : e);
  }
}
