import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess } from "@/lib/permissions";
import { pageBlocks } from "@/lib/marketing/landing";
import { Editor } from "./Editor";

export default async function LandingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace } = await requireApp();
  const manage = allow(await getAccess(user.id, workspace.id), "landing_manage");
  const p = await db.landingPage.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!p) notFound();
  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <Editor
      manage={manage}
      origin={origin}
      aiOn={!!process.env.ANTHROPIC_API_KEY}
      initial={{ id: p.id, title: p.title, slug: p.slug, theme: p.theme, published: p.published, views: p.views, conversions: p.conversions, blocks: pageBlocks(p) }}
    />
  );
}
