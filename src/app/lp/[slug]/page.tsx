import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isBot, pageBlocks } from "@/lib/marketing/landing";
import { LpBlocks } from "../Blocks";
import { themeColor } from "../model";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return db.landingPage.findFirst({ where: { slug, published: true }, include: { workspace: { select: { name: true } } } });
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return { title: "Không tìm thấy trang" };
  const hero = pageBlocks(p).find((b) => b.type === "hero");
  return { title: p.title, description: hero && "subtitle" in hero ? hero.subtitle.slice(0, 160) : undefined, openGraph: { title: p.title } };
}

/** Trang công khai: vẽ sẵn ở server, chỉ form có JS. Đếm lượt xem (bỏ qua bot). */
export default async function PublicLanding({ params }: P) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  const h = await headers();
  // Không đếm lượt xem từ bot và từ prefetch của trình duyệt.
  if (!isBot(h.get("user-agent")) && h.get("purpose") !== "prefetch" && h.get("sec-purpose") !== "prefetch") {
    await db.landingPage.update({ where: { id: p.id }, data: { views: { increment: 1 } } }).catch(() => undefined);
  }
  return (
    <main className="min-h-screen bg-white">
      <LpBlocks blocks={pageBlocks(p)} color={themeColor(p.theme)} slug={p.slug} />
      <footer className="border-t border-[#e6e9f2] bg-white py-6 text-center text-[13px] text-[#8a8fa3]">© {new Date().getFullYear()} {p.workspace.name}</footer>
    </main>
  );
}
