import { SESSION_COOKIE } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  const res = ok({ redirect: "/login" });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
