import { NextResponse } from "next/server";
import { apiContext } from "./auth";

export const ok = (data: unknown, init?: number) => NextResponse.json(data, { status: init ?? 200 });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Cho route handler cần workspace đã onboard. */
export async function appApi() {
  const ctx = await apiContext();
  if (!ctx) return { error: fail("Bạn cần đăng nhập lại", 401) } as const;
  if (!ctx.config) return { error: fail("Workspace chưa có cấu hình. Hãy điền DNA trước.", 409) } as const;
  return { ctx: { ...ctx, config: ctx.config } } as const;
}
