import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Home() {
  const ctx = await getContext();
  if (!ctx) redirect((await db.user.count()) === 0 ? "/register" : "/login");
  redirect(ctx.workspace.onboarded ? "/w" : "/onboarding");
}
