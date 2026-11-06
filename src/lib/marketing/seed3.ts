// Dữ liệu mẫu Đợt 3 – Marketing: một landing page đang chạy, một đợt gửi đã xong, một đợt hẹn giờ.
import { db, parseJson } from "../db";
import type { Dna } from "../dna";
import { slugify } from "@/app/lp/model";
import { fallbackGen, uniqueSlug } from "./landing";
import { loadCfg } from "./store";

/** Bỏ qua nếu workspace đã có landing page (chạy nhiều lần không nhân đôi). */
export async function seedMarketing3(workspaceId: string): Promise<void> {
  if (await db.landingPage.findFirst({ where: { workspaceId }, select: { id: true } })) return;
  const cfg = await loadCfg(workspaceId);
  if (!cfg) return;
  const dnaRow = await db.dna.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  const dna = parseJson<Partial<Dna> | null>(dnaRow?.dataJson, null);
  const gen = fallbackGen(dna, cfg);
  const id = () => Math.random().toString(36).slice(2, 10);
  const blocks = [
    { id: id(), type: "hero", title: gen.hero.title, subtitle: gen.hero.subtitle, button: gen.hero.button, href: "#dang-ky", image: "" },
    { id: id(), type: "benefits", title: gen.benefitsTitle, items: gen.benefits },
    { id: id(), type: "testimonial", ...gen.testimonial },
    { id: id(), type: "form", title: gen.formTitle, subtitle: "Chỉ mất 30 giây", fields: { phone: true, email: false, note: true }, button: gen.formButton, thanks: gen.thanks },
    { id: id(), type: "faq", title: "Câu hỏi thường gặp", items: gen.faq },
    { id: id(), type: "cta", title: gen.cta.title, subtitle: gen.cta.subtitle, button: gen.cta.button, href: "#dang-ky" },
  ];
  const owner = cfg.team[0] ?? "";
  await db.landingPage.create({
    data: { workspaceId, title: `Ưu đãi tháng này – ${cfg.businessName}`, slug: await uniqueSlug(`uu-dai-${slugify(cfg.businessName)}`), blocksJson: JSON.stringify(blocks), theme: "pink", published: true, views: 412, conversions: 37, createdBy: owner },
  });

  // Đợt email đã gửi xong: số liệu khớp với số khách hiện có, vài tin mẫu để trang chi tiết có nội dung.
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, title: true } });
  const n = Math.max(contacts.length, 8);
  const failed = 1;
  const skipped = Math.max(1, Math.round(n * 0.1));
  const sent = n - failed - skipped;
  const day = 864e5;
  const start = new Date(Date.now() - 12 * day);
  const done = await db.broadcast.create({
    data: {
      workspaceId,
      name: "Bản tin tháng 10 – ưu đãi khách quen",
      channel: "email",
      subject: "{ten} ơi, ưu đãi riêng tháng 10 từ {ten_doanh_nghiep}",
      body: `Chào {ten},\n\n${cfg.businessName} gửi anh/chị ưu đãi dành riêng cho khách quen trong tháng 10.\n\nXem chi tiết: https://example.com/uu-dai-thang-10\n\nTrân trọng,\n{nguoi_phu_trach}`,
      status: "done",
      scheduledAt: start,
      startedAt: start,
      finishedAt: new Date(start.getTime() + 25 * 60e3),
      total: n,
      sent,
      failed,
      skipped,
      opened: Math.round(sent * 0.46),
      clicked: Math.round(sent * 0.12),
      createdBy: owner,
      createdAt: new Date(start.getTime() - day),
    },
  });
  const mail = (t: string) => `${slugify(t).replace(/-/g, ".") || "khach"}@example.com`;
  await db.outMessage.createMany({
    data: contacts.slice(0, 6).map((c, i) => ({
      workspaceId,
      recordId: c.id,
      broadcastId: done.id,
      channel: "email",
      to: mail(c.title),
      subject: `${c.title} ơi, ưu đãi riêng tháng 10 từ ${cfg.businessName}`,
      body: `Chào ${c.title}, ${cfg.businessName} gửi anh/chị ưu đãi dành riêng cho khách quen trong tháng 10.`,
      status: i === 4 ? "failed" : "sent",
      error: i === 4 ? "550 Mailbox không tồn tại" : "",
      provider: "sample",
      createdAt: new Date(start.getTime() + i * 60e3),
    })),
  });

  // Đợt SMS hẹn giờ cuối tuần sau.
  const at = new Date(Date.now() + 5 * day);
  at.setHours(9, 0, 0, 0);
  await db.broadcast.create({
    data: {
      workspaceId,
      name: "Nhắc lịch cuối tuần",
      channel: "sms",
      body: `${cfg.businessName}: Chao {ten}, cuoi tuan nay ben em con lich trong. Nhan lai de {nguoi_phu_trach} giu cho nhe.`,
      status: "scheduled",
      scheduledAt: at,
      createdBy: owner,
    },
  });
}
