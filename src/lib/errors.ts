// Ghi lỗi máy chủ vào ErrorLog, gộp theo dấu vân tay (thông điệp + dòng stack đầu + đường dẫn).
// - Che bí mật trong thông điệp: email, số điện thoại, token, khoá API.
// - Lỗi MỚI (dấu vân tay chưa từng thấy, hoặc đã đánh dấu xử lý rồi tái phát): báo chủ workspace (kind "system_error")
//   và POST JSON tới ERROR_WEBHOOK_URL nếu có đặt.
// - Không bao giờ ném lỗi ra ngoài, không gọi lại chính nó.
//
// Module Node lấy lúc chạy: file này được gọi từ instrumentation (onRequestError).

type Level = "error" | "warn";
export type ErrorCtx = { path?: string; workspaceId?: string; level?: Level };

const MAX_STACK = 4000;
const MAX_MSG = 1000;

/** Che thông tin nhạy cảm trong chuỗi lỗi. */
export function scrubMessage(s: string) {
  return String(s ?? "")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 ••••")
    .replace(/((?:access_?token|refresh_?token|token|secret|password|passwd|pass|api_?key|apikey|key|signature|authorization|sig)["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi, "$1••••")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, "[sđt]")
    .replace(/\b(?:sk-ant-|sk-|EAA|xox[bap]-)[A-Za-z0-9_-]{8,}/g, "[khoá]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[chuỗi dài]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://••••");
}

/** Bỏ phần thay đổi (số, id) để cùng loại lỗi gộp một dòng. */
const normalize = (s: string) => s.replace(/\b[a-z0-9]{20,}\b/gi, "~").replace(/\d+/g, "#");

export function fingerprintOf(message: string, firstFrame: string, path: string) {
  const crypto = process.getBuiltinModule("node:crypto");
  return crypto.createHash("sha256").update(`${normalize(message)}\n${normalize(firstFrame.replace(/:\d+:\d+\)?$/, ""))}\n${path}`).digest("hex").slice(0, 32);
}

const g = globalThis as unknown as { crmLogging?: number };

export async function logError(e: unknown, ctx: ErrorCtx = {}): Promise<void> {
  const err = e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e ?? "Lỗi không rõ"));
  const path = String(ctx.path ?? "").split("?")[0].slice(0, 300);
  const level: Level = ctx.level === "warn" ? "warn" : "error";
  console.error(`[${level}]`, path, scrubMessage(err.message).slice(0, 300));
  // Chặn đệ quy (lỗi khi ghi lỗi) và bão lỗi.
  if ((g.crmLogging ?? 0) > 5) return;
  g.crmLogging = (g.crmLogging ?? 0) + 1;
  try {
    const message = scrubMessage(`${err.name && err.name !== "Error" ? `${err.name}: ` : ""}${err.message}`).slice(0, MAX_MSG);
    const stack = scrubMessage(err.stack ?? "").slice(0, MAX_STACK);
    const firstFrame = (err.stack ?? "").split("\n").find((l) => l.trim().startsWith("at ")) ?? "";
    const fingerprint = fingerprintOf(message, firstFrame.trim(), path);
    const workspaceId = ctx.workspaceId ?? "";
    const { dbRaw: db } = await import("./db");
    const prev = await db.errorLog.findUnique({ where: { fingerprint }, select: { id: true, resolved: true } });
    const now = new Date();
    if (prev) await db.errorLog.update({ where: { fingerprint }, data: { count: { increment: 1 }, lastAt: now, resolved: false, stack, ...(workspaceId ? { workspaceId } : {}) } });
    else await db.errorLog.create({ data: { fingerprint, message, stack, path, level, workspaceId } });
    if (!prev || prev.resolved) await announce({ message, path, level, workspaceId, fingerprint, reopened: !!prev });
  } catch (x) {
    console.error("[logError] không ghi được:", x instanceof Error ? x.message : x);
  } finally {
    g.crmLogging = Math.max(0, (g.crmLogging ?? 1) - 1);
  }
}

async function announce(i: { message: string; path: string; level: Level; workspaceId: string; fingerprint: string; reopened: boolean }) {
  if (i.level === "error") {
    try {
      const { dbRaw: db } = await import("./db");
      const { notifyOnce } = await import("./notify");
      // Lỗi gắn workspace: báo chủ workspace đó. Lỗi hệ thống: báo chủ mọi workspace (bản tự cài thường chỉ có một).
      const owners = await db.membership.findMany({ where: { role: "owner", ...(i.workspaceId ? { workspaceId: i.workspaceId } : {}) }, select: { userId: true, workspaceId: true }, take: 50 });
      const text = `${i.reopened ? "Lỗi tái phát" : "Lỗi mới"}${i.path ? ` ở ${i.path}` : ""}: ${i.message}`.slice(0, 300);
      for (const o of owners) await notifyOnce(o.workspaceId, { userId: o.userId, kind: "system_error", text, href: "/w/settings/health#errors" });
    } catch (x) {
      console.error("[logError] không báo được:", x instanceof Error ? x.message : x);
    }
  }
  const hook = process.env.ERROR_WEBHOOK_URL?.trim();
  if (hook && /^https?:\/\//.test(hook)) {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "dna-crm", level: i.level, message: i.message, path: i.path, fingerprint: i.fingerprint, reopened: i.reopened, at: new Date().toISOString(), url: process.env.APP_URL || "" }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // webhook hỏng thì thôi, không ghi lỗi đệ quy
    }
  }
}
