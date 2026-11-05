import type { Record as DbRecord, Sequence } from "@prisma/client";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { db, parseJson } from "../db";
import { ai, MODEL } from "../ai";
import { wonLost } from "../metrics";
import { sendMessage } from "./messaging";
import { contactInfo, loadCfg } from "./store";
import { SEQ_TEMPLATES, normCampaign, type MsgChannel, type SeqTemplate, type Step } from "./shared";
import { buildAdReport } from "./report";
import { upsertSpend, type SpendRow } from "./ads";

const CHANNELS: MsgChannel[] = ["zalo", "zns", "sms", "email", "messenger"];

/** Đọc và làm sạch danh sách bước. delayHours là thời gian chờ tính từ bước trước (bước đầu: từ lúc vào kịch bản). */
export function parseSteps(json: string | unknown): Step[] {
  const raw = typeof json === "string" ? parseJson<unknown[]>(json, []) : json;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => x as Partial<Step>)
    .filter((s) => s && typeof s.body === "string" && CHANNELS.includes(s.channel as MsgChannel))
    .slice(0, 20)
    .map((s) => ({
      delayHours: Math.max(0, Math.min(24 * 365, Math.round(Number(s.delayHours) || 0))),
      channel: s.channel as MsgChannel,
      subject: s.subject ? String(s.subject).slice(0, 200) : undefined,
      body: String(s.body).slice(0, 2000),
      templateId: s.templateId ? String(s.templateId).slice(0, 60) : undefined,
      condition: s.condition === "no_reply" ? "no_reply" : "any",
    }));
}

/** Đổi "open"/"won" trong mẫu thành key trạng thái thật của bảng bán hàng. */
export function resolveTemplate(t: SeqTemplate, cfg: WorkspaceConfig) {
  const deals = getObject(cfg, "deals");
  const { won, lost } = wonLost(cfg);
  let v = t.triggerValue;
  if (v === "open") v = deals?.statuses.find((s) => !won.has(s.key) && !lost.has(s.key))?.key ?? "";
  if (v === "won") v = deals?.statuses.find((s) => won.has(s.key))?.key ?? "";
  return { name: t.name, triggerType: t.triggerType, objectKey: t.objectKey, triggerValue: v, steps: t.steps };
}

const hours = (h: number) => h * 3600e3;

async function addActivity(recordId: string, body: string, kind = "sequence") {
  await db.activity.create({ data: { recordId, kind, body, author: "Kịch bản chăm sóc" } }).catch(() => undefined);
}

async function enroll(seq: Sequence, recordId: string, opts: { restart: boolean }) {
  const steps = parseSteps(seq.stepsJson);
  if (!steps.length) return false;
  const old = await db.enrollment.findUnique({ where: { sequenceId_recordId: { sequenceId: seq.id, recordId } } });
  if (old && (old.status === "active" || !opts.restart)) return false;
  const nextAt = new Date(Date.now() + hours(steps[0].delayHours));
  if (old) await db.enrollment.update({ where: { id: old.id }, data: { status: "active", step: 0, nextAt, createdAt: new Date() } });
  else await db.enrollment.create({ data: { sequenceId: seq.id, workspaceId: seq.workspaceId, recordId, nextAt } });
  await addActivity(recordId, `Bắt đầu kịch bản “${seq.name}” (${steps.length} bước)`);
  return true;
}

/** Sự kiện từ records.ts: tạo Enrollment cho các kịch bản đang bật khớp sự kiện. */
export async function onSequenceEvent(workspaceId: string, ev: { kind: "record_created" | "status_changed"; record: DbRecord }): Promise<void> {
  const seqs = await db.sequence.findMany({ where: { workspaceId, enabled: true, triggerType: ev.kind, objectKey: ev.record.objectKey } });
  for (const s of seqs) {
    if (ev.kind === "status_changed" && s.triggerValue && s.triggerValue !== ev.record.status) continue;
    // Đổi trạng thái lần nữa (vd. quay lại "đang tư vấn") thì chạy lại từ đầu; tạo mới thì chỉ chạy một lần.
    await enroll(s, ev.record.id, { restart: ev.kind === "status_changed" });
  }
}

export async function enrollRecord(workspaceId: string, sequenceId: string, recordId: string): Promise<void> {
  const seq = await db.sequence.findFirst({ where: { id: sequenceId, workspaceId } });
  const rec = await db.record.findFirst({ where: { id: recordId, workspaceId }, select: { id: true } });
  if (!seq || !rec) throw new Error("Không tìm thấy kịch bản hoặc khách");
  await enroll(seq, recordId, { restart: true });
}

export const isReplyReason = (reason: string) => /trả lời|phản hồi|nhắn lại|reply/i.test(reason);

/** Dừng mọi kịch bản đang chạy của một record. Lý do có chữ "trả lời" được tính vào tỉ lệ phản hồi. */
export async function stopEnrollmentsForRecord(workspaceId: string, recordId: string, reason: string): Promise<void> {
  const list = await db.enrollment.findMany({ where: { workspaceId, recordId, status: "active" }, include: { sequence: { select: { name: true } } } });
  if (!list.length) return;
  await db.enrollment.updateMany({ where: { id: { in: list.map((e) => e.id) } }, data: { status: "stopped" } });
  await addActivity(recordId, `Dừng ${list.map((e) => `“${e.sequence.name}”`).join(", ")}: ${reason}`, isReplyReason(reason) ? "sequence_reply" : "sequence");
}

/** Khách đã nhắn lại (Hộp thư) kể từ một thời điểm chưa. */
async function hasReplied(contactId: string | undefined, since: Date) {
  if (!contactId) return false;
  const m = await db.message.findFirst({ where: { direction: { in: ["in", "inbound"] }, createdAt: { gt: since }, conversation: { recordId: contactId } }, select: { id: true } });
  return !!m;
}

const g = globalThis as unknown as { crmSeqInactiveAt?: number };

/** Kịch bản "im lặng N ngày": tìm khách không có hoạt động N ngày, mỗi giờ quét một lần. */
export async function scanInactive(force = false) {
  if (!force && Date.now() - (g.crmSeqInactiveAt ?? 0) < 3600e3) return 0;
  g.crmSeqInactiveAt = Date.now();
  let n = 0;
  const seqs = await db.sequence.findMany({ where: { enabled: true, triggerType: "inactive_days" } });
  for (const s of seqs) {
    const days = Math.max(1, Number(s.triggerValue) || 14);
    const cut = new Date(Date.now() - days * 864e5);
    const candidates = await db.record.findMany({
      where: { workspaceId: s.workspaceId, objectKey: s.objectKey, createdAt: { lt: cut }, activities: { none: { createdAt: { gte: cut } } } },
      select: { id: true },
      take: 200,
    });
    if (!candidates.length) continue;
    const existing = await db.enrollment.findMany({ where: { sequenceId: s.id, recordId: { in: candidates.map((c) => c.id) } } });
    const ex = new Map(existing.map((e) => [e.recordId, e]));
    for (const c of candidates) {
      const e = ex.get(c.id);
      // Đã chạy rồi: chỉ chạy lại khi lần trước kết thúc đã quá N ngày.
      if (e && (e.status === "active" || e.updatedAt >= cut)) continue;
      if (await enroll(s, c.id, { restart: true })) n++;
    }
  }
  return n;
}

/** Chạy mỗi phút: gửi bước đến hạn (tối đa 50 lượt), tăng bước, tính lần gửi kế tiếp. */
export async function tickSequences(): Promise<void> {
  await scanInactive().catch((e) => console.error("[sequences] quét khách im lặng:", e instanceof Error ? e.message : e));
  const due = await db.enrollment.findMany({
    where: { status: "active", nextAt: { lte: new Date() }, sequence: { enabled: true } },
    include: { sequence: true },
    orderBy: { nextAt: "asc" },
    take: 50,
  });
  const cfgs = new Map<string, WorkspaceConfig | null>();
  for (const e of due) {
    try {
      await runStep(e, e.sequence, cfgs);
    } catch (err) {
      console.error("[sequences]", err instanceof Error ? err.message : err);
      // Lỗi bất ngờ: thử lại sau 1 giờ thay vì kẹt cả hàng.
      await db.enrollment.update({ where: { id: e.id }, data: { nextAt: new Date(Date.now() + 3600e3) } }).catch(() => undefined);
    }
  }
}

async function runStep(e: { id: string; recordId: string; step: number; createdAt: Date; workspaceId: string }, seq: Sequence, cfgs: Map<string, WorkspaceConfig | null>) {
  const stop = (status: "stopped" | "done") => db.enrollment.update({ where: { id: e.id }, data: { status } });
  const steps = parseSteps(seq.stepsJson);
  const record = await db.record.findFirst({ where: { id: e.recordId, workspaceId: e.workspaceId } });
  if (!record) return stop("stopped");
  if (!cfgs.has(e.workspaceId)) cfgs.set(e.workspaceId, await loadCfg(e.workspaceId));
  const cfg = cfgs.get(e.workspaceId);
  // Kịch bản theo trạng thái: record đã đổi sang trạng thái khác (vd. đã chốt) thì dừng.
  if (seq.triggerType === "status_changed" && seq.triggerValue && record.status !== seq.triggerValue) {
    await addActivity(record.id, `Dừng “${seq.name}”: trạng thái đã đổi`);
    return stop("stopped");
  }
  const contactId = record.objectKey === "contacts" ? record.id : cfg ? (await contactInfo(e.workspaceId, cfg, record)).contact?.id : undefined;
  const replied = await hasReplied(contactId, e.createdAt);
  if (replied && seq.stopOnReply) {
    await addActivity(record.id, `Khách đã trả lời, dừng “${seq.name}”`, "sequence_reply");
    return stop("stopped");
  }
  const step = steps[e.step];
  if (!step) return stop("done");
  if (!(step.condition === "no_reply" && replied)) {
    await sendMessage(e.workspaceId, { channel: step.channel, recordId: record.id, sequenceId: seq.id, subject: step.subject, body: step.body, templateId: step.templateId });
  }
  const next = e.step + 1;
  if (next >= steps.length) return db.enrollment.update({ where: { id: e.id }, data: { step: next, status: "done" } });
  await db.enrollment.update({ where: { id: e.id }, data: { step: next, nextAt: new Date(Date.now() + hours(steps[next].delayHours)) } });
}

/** Số liệu từng kịch bản cho danh sách. */
export async function sequenceStats(workspaceId: string) {
  const [enr, sent, replies] = await Promise.all([
    db.enrollment.groupBy({ by: ["sequenceId", "status"], where: { workspaceId }, _count: { _all: true } }),
    db.outMessage.groupBy({ by: ["sequenceId"], where: { workspaceId, status: { in: ["sent", "dry_run"] }, sequenceId: { not: null } }, _count: { _all: true } }),
    db.enrollment.findMany({ where: { workspaceId, status: "stopped" }, select: { sequenceId: true, recordId: true, createdAt: true } }),
  ]);
  const replyActs = replies.length
    ? await db.activity.findMany({ where: { kind: "sequence_reply", recordId: { in: [...new Set(replies.map((r) => r.recordId))] } }, select: { recordId: true, createdAt: true } })
    : [];
  const out: Record<string, { active: number; total: number; done: number; sent: number; replied: number }> = {};
  const get = (id: string) => (out[id] ??= { active: 0, total: 0, done: 0, sent: 0, replied: 0 });
  for (const r of enr) {
    const x = get(r.sequenceId);
    x.total += r._count._all;
    if (r.status === "active") x.active += r._count._all;
    if (r.status === "done") x.done += r._count._all;
  }
  for (const s of sent) if (s.sequenceId) get(s.sequenceId).sent += s._count._all;
  for (const r of replies) if (replyActs.some((a) => a.recordId === r.recordId && a.createdAt >= r.createdAt)) get(r.sequenceId).replied++;
  return out;
}

// ---------------- AI viết nội dung ----------------

const WriteOut = z.object({ subject: z.string(), body: z.string() });

const FALLBACK: Record<string, Record<MsgChannel, string>> = {
  welcome: {
    zalo: "Chào {ten}, cảm ơn anh/chị đã quan tâm {ten_doanh_nghiep}! Em là {nguoi_phu_trach}, anh/chị đang cần tư vấn về sản phẩm nào để em gửi thông tin chi tiết ạ?",
    zns: "Cảm ơn {ten} đã đăng ký nhận tư vấn tại {ten_doanh_nghiep}. {nguoi_phu_trach} sẽ liên hệ anh/chị trong hôm nay.",
    sms: "{ten_doanh_nghiep}: Cam on {ten} da quan tam. {nguoi_phu_trach} se lien he tu van som nhat.",
    email: "Chào {ten},\n\nCảm ơn anh/chị đã quan tâm {ten_doanh_nghiep}. Em là {nguoi_phu_trach}, em sẽ gửi anh/chị thông tin chi tiết và ưu đãi dành cho khách mới.\n\nTrân trọng,\n{nguoi_phu_trach}",
    messenger: "Chào {ten}, cảm ơn anh/chị đã nhắn {ten_doanh_nghiep}!",
  },
  offer: {
    zalo: "{ten} ơi, {ten_doanh_nghiep} đang giữ ưu đãi riêng cho anh/chị đến hết tuần này. Anh/chị nhắn lại để {nguoi_phu_trach} giữ suất nhé!",
    zns: "Ưu đãi dành riêng cho {ten} tại {ten_doanh_nghiep}, áp dụng đến hết tuần.",
    sms: "{ten_doanh_nghiep}: Uu dai rieng cho {ten} den het tuan. Lien he {nguoi_phu_trach} de giu suat.",
    email: "Chào {ten},\n\n{ten_doanh_nghiep} gửi anh/chị ưu đãi riêng, áp dụng đến hết tuần này. Anh/chị trả lời email này để giữ suất nhé.\n\nTrân trọng,\n{nguoi_phu_trach}",
    messenger: "{ten} ơi, bên em có ưu đãi riêng cho anh/chị tuần này!",
  },
  review: {
    zalo: "Chào {ten}, cảm ơn anh/chị đã tin chọn {ten_doanh_nghiep}. Anh/chị thấy trải nghiệm thế nào ạ? Một đánh giá ngắn sẽ giúp bên em phục vụ tốt hơn!",
    zns: "{ten_doanh_nghiep} cảm ơn {ten}. Mời anh/chị đánh giá trải nghiệm để nhận quà tri ân.",
    sms: "{ten_doanh_nghiep}: Cam on {ten}. Moi anh/chi danh gia trai nghiem de nhan qua tri an.",
    email: "Chào {ten},\n\nCảm ơn anh/chị đã sử dụng dịch vụ của {ten_doanh_nghiep}. Anh/chị dành 1 phút đánh giá giúp bên em nhé.\n\nTrân trọng,\n{nguoi_phu_trach}",
    messenger: "Anh/chị thấy dịch vụ bên em thế nào ạ?",
  },
  winback: {
    zalo: "Lâu rồi không gặp {ten}! {ten_doanh_nghiep} vừa có nhiều điều mới, anh/chị ghé xem nhé. Em {nguoi_phu_trach} luôn sẵn sàng hỗ trợ.",
    zns: "{ten_doanh_nghiep} nhớ {ten}! Ưu đãi quay lại dành riêng cho anh/chị trong tháng này.",
    sms: "{ten_doanh_nghiep}: Lau roi khong gap {ten}. Uu dai quay lai danh rieng cho anh/chi thang nay.",
    email: "Chào {ten},\n\nĐã lâu {ten_doanh_nghiep} chưa gặp anh/chị. Bên em gửi ưu đãi quay lại dành riêng cho anh/chị trong tháng này.\n\nTrân trọng,\n{nguoi_phu_trach}",
    messenger: "Lâu rồi không gặp anh/chị!",
  },
};

export function guessPurpose(text: string): keyof typeof FALLBACK {
  const n = normCampaign(text);
  if (/danhgia|review|saumua/.test(n)) return "review";
  if (/imlang|quaylai|lauroi|winback/.test(n)) return "winback";
  if (/uudai|chuachot|khuyenmai|giam/.test(n)) return "offer";
  return "welcome";
}

/** Claude viết nội dung theo DNA/ngành; không có AI thì dùng mẫu câu. */
export async function writeStep(workspaceId: string, cfg: WorkspaceConfig, input: { channel: MsgChannel; purpose: string; stepIndex: number }) {
  const fallback = { subject: input.channel === "email" ? `Thông tin từ {ten_doanh_nghiep}` : "", body: FALLBACK[guessPurpose(input.purpose)][input.channel], source: "template" as const };
  const c = ai();
  if (!c) return fallback;
  const dna = await db.dna.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  const limits: Record<MsgChannel, string> = {
    zalo: "Tin Zalo OA thân thiện, tối đa 300 ký tự, có thể dùng 1 emoji.",
    zns: "Mô tả nội dung cho template ZNS, trang trọng, tối đa 200 ký tự.",
    sms: "SMS tiếng Việt KHÔNG DẤU (nhà mạng yêu cầu), tối đa 160 ký tự, bắt đầu bằng {ten_doanh_nghiep}:.",
    email: "Email ngắn 3–5 câu, có tiêu đề hấp dẫn.",
    messenger: "Tin nhắn ngắn.",
  };
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 1200,
      output_config: { effort: "low", format: zodOutputFormat(WriteOut) },
      system: `Bạn viết tin chăm sóc khách cho ${cfg.businessName} (ngành ${cfg.industry}). Giọng tự nhiên, lịch sự kiểu Việt Nam, không phóng đại. Dùng biến {ten}, {ten_doanh_nghiep}, {nguoi_phu_trach} thay cho tên thật. subject chỉ điền khi là email, còn lại để rỗng.`,
      messages: [{ role: "user", content: `DNA doanh nghiệp: ${dna?.dataJson.slice(0, 3000) ?? "(chưa có)"}\n\nMục đích kịch bản: ${input.purpose}\nĐây là bước thứ ${input.stepIndex + 1}.\nKênh: ${input.channel}. ${limits[input.channel]}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output?.body) return fallback;
    return { subject: res.parsed_output.subject, body: res.parsed_output.body, source: "ai" as const };
  } catch (e) {
    console.error("[sequences] AI viết nội dung lỗi:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

// ---------------- Dữ liệu mẫu ----------------

/** Chi phí/ngày gợi ý theo ngành (VND) và mục tiêu ROAS cho từng chiến dịch mẫu để bảng có đủ màu xanh/cam/đỏ. */
const DAILY: Record<string, number> = { spa: 250e3, bds: 3e6, edu: 600e3, retail: 200e3, b2b: 1.5e6, dental: 800e3, fnb: 300e3, auto: 2.5e6, insurance: 700e3, interior: 1.5e6 };
const PLAN: { campaign: string; provider: string; roas: number; ctr: number; cpm: number; share: number; rising?: boolean }[] = [
  { campaign: "Ưu đãi tháng này", provider: "facebook", roas: 4.2, ctr: 0.014, cpm: 45e3, share: 1.2 },
  { campaign: "Từ khoá thương hiệu", provider: "google", roas: 2.1, ctr: 0.065, cpm: 120e3, share: 0.8 },
  { campaign: "Video review", provider: "tiktok", roas: 0.6, ctr: 0.009, cpm: 30e3, share: 1, rising: true },
  { campaign: "Khách quay lại", provider: "facebook", roas: 5.5, ctr: 0.021, cpm: 60e3, share: 0.5 },
];

export async function seedMarketing(workspaceId: string, cfg: WorkspaceConfig): Promise<void> {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  await db.adSpend.deleteMany({ where: { workspaceId, source: "sample" } });
  await db.outMessage.deleteMany({ where: { workspaceId, provider: "sample" } });

  // Chiến dịch mẫu chưa có đơn thắng nào: thêm 1–2 đơn đã chốt từ lead của chiến dịch để ROAS có ý nghĩa.
  const dealsObj = getObject(cfg, "deals");
  const wonKey = dealsObj?.statuses.find((s) => wonLost(cfg).won.has(s.key))?.key;
  if (dealsObj && wonKey) {
    const rep0 = await buildAdReport(workspaceId, cfg, 30, { workspaceId });
    const amounts = (await db.record.findMany({ where: { workspaceId, objectKey: "deals", amount: { gt: 0 } }, select: { amount: true } })).map((d) => d.amount);
    const avg = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 5e6;
    const custKey = dealsObj.fields.find((f) => f.type === "text")?.key;
    for (const p of PLAN) {
      const row = rep0.rows.find((x) => x.key === normCampaign(p.campaign));
      if (!row || row.revenue > 0) continue;
      const leads = await db.record.findMany({ where: { workspaceId, objectKey: "contacts", dataJson: { contains: p.campaign } }, orderBy: { createdAt: "asc" }, take: p.roas >= 4 ? 2 : 1 });
      for (const c of leads) {
        const step = avg > 1e9 ? 1e8 : avg > 1e7 ? 1e6 : 1e5;
        await db.record.create({
          data: {
            workspaceId,
            objectKey: "deals",
            title: c.title,
            status: wonKey,
            ownerName: c.ownerName,
            amount: Math.round((avg * (0.9 + rnd() * 0.6)) / step) * step,
            dataJson: JSON.stringify(custKey ? { [custKey]: c.title } : {}),
            createdAt: new Date(Math.min(Date.now(), c.createdAt.getTime() + (1 + rnd() * 3) * 864e5)),
            activities: { create: [{ kind: "system", body: "Dữ liệu mẫu: đơn chốt từ khách quảng cáo", author: "Hệ thống" }] },
          },
        });
      }
    }
  }

  // Doanh thu đang gắn với từng chiến dịch (từ khách mẫu) → suy ra chi phí theo ROAS mục tiêu.
  const rep = await buildAdReport(workspaceId, cfg, 30, { workspaceId });
  const daily = DAILY[cfg.industry] ?? 400e3;
  const today = Date.parse(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) + "T00:00:00Z");
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, select: { dataJson: true, createdAt: true } });
  const rows: SpendRow[] = [];
  for (const p of PLAN) {
    const r = rep.rows.find((x) => x.key === normCampaign(p.campaign));
    const total = r?.revenue ? r.revenue / p.roas : daily * 30 * p.share;
    // Ngày có lead CRM thì nền tảng cũng báo lead; thêm vài lead nền tảng không về CRM (form bỏ dở, trùng).
    const leadDays = new Set(contacts.filter((c) => parseJson<Record<string, string>>(c.dataJson, {})._chien_dich === p.campaign).map((c) => new Date(c.createdAt.getTime() + 7 * 3600e3).toISOString().slice(0, 10)));
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today - i * 864e5).toISOString().slice(0, 10);
      const trend = p.rising ? 0.6 + ((29 - i) / 29) * 0.9 : 1;
      const spend = Math.round(((total / 30) * trend * (0.75 + rnd() * 0.5)) / 1000) * 1000;
      const impressions = Math.round((spend / p.cpm) * 1000);
      const clicks = Math.round(impressions * p.ctr * (0.8 + rnd() * 0.4));
      const leads = (leadDays.has(day) ? 1 : 0) + (rnd() < (p.rising && i < 15 ? 0.12 : 0.3) ? 1 : 0);
      rows.push({ date: day, provider: p.provider, campaign: p.campaign, spend, impressions, clicks, leads });
    }
  }
  await upsertSpend(workspaceId, rows, "sample");

  // Hai kịch bản bật sẵn.
  const has = await db.sequence.count({ where: { workspaceId } });
  if (!has) {
    for (const key of ["welcome", "review"]) {
      const t = resolveTemplate(SEQ_TEMPLATES.find((x) => x.key === key)!, cfg);
      await db.sequence.create({ data: { workspaceId, name: t.name, triggerType: t.triggerType, objectKey: t.objectKey, triggerValue: t.triggerValue, stepsJson: JSON.stringify(t.steps), enabled: true } });
    }
  }
  const welcome = await db.sequence.findFirst({ where: { workspaceId, triggerType: "record_created" }, orderBy: { createdAt: "asc" } });
  const list = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "desc" }, take: 6 });
  if (welcome) {
    const steps = parseSteps(welcome.stepsJson);
    for (const [i, r] of list.entries()) {
      // Khách mẫu ở các bước khác nhau: 2 đang chờ bước 2, 2 chờ bước 3, 1 xong, 1 dừng vì trả lời.
      const step = [1, 1, 2, 2, 3, 1][i];
      const status = i === 4 ? "done" : i === 5 ? "stopped" : "active";
      const nextAt = new Date(Date.now() + (step < steps.length ? hours(steps[step].delayHours) * (0.3 + rnd() * 0.6) : 0));
      await db.enrollment.upsert({
        where: { sequenceId_recordId: { sequenceId: welcome.id, recordId: r.id } },
        create: { sequenceId: welcome.id, workspaceId, recordId: r.id, step, status, nextAt, createdAt: new Date(r.createdAt.getTime() + 60e3) },
        update: {},
      });
      if (status === "stopped") await addActivity(r.id, `Khách đã trả lời, dừng “${welcome.name}”`, "sequence_reply");
      const info = await contactInfo(workspaceId, cfg, r);
      for (let s = 0; s < Math.min(step, steps.length); s++) {
        const st = steps[s];
        const skipped = st.channel === "zalo" && !info.zaloUid;
        await db.outMessage.create({
          data: {
            workspaceId,
            recordId: r.id,
            sequenceId: welcome.id,
            channel: skipped ? "zalo" : st.channel,
            to: st.channel === "zalo" ? info.zaloUid : info.phone,
            body: st.body.replace("{ten}", r.title).replace("{ten_doanh_nghiep}", cfg.businessName).replace("{nguoi_phu_trach}", r.ownerName || cfg.team[0] || ""),
            status: skipped ? "skipped" : "sent",
            error: skipped ? "Dữ liệu mẫu: khách chưa quan tâm OA" : "",
            provider: "sample",
            createdAt: new Date(Math.min(Date.now() - (step - s) * 60e3, r.createdAt.getTime() + (s ? steps.slice(0, s + 1).reduce((a, x) => a + hours(x.delayHours), 0) : 120e3))),
          },
        });
      }
    }
  }
  await db.agentLog.create({ data: { workspaceId, agent: "Marketing Analyst", message: "Đã tạo dữ liệu mẫu: chi phí quảng cáo 30 ngày, 2 kịch bản chăm sóc" } });
}
