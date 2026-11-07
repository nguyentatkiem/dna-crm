export async function register() {
  // Import nằm trong if để bản Edge bỏ hẳn nhánh này (jobs kéo theo module node:*).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobs } = await import("./lib/jobs");
    startJobs();
  }
}

/**
 * Next.js gọi hàm này khi trang / route handler / server action ném lỗi chưa bắt.
 * Ghi vào ErrorLog (trang Cài đặt → Kiểm tra kết nối). Phần ghi lỗi nằm trong khối if để bản Edge
 * không kéo theo web-push, nodemailer… (bản Edge không có module http/net).
 */
export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportRequestError } = await import("./lib/server/request-error");
    await reportRequestError(err, request, context);
  }
}
