// Phễu chuyển đổi: khách mới → đã liên hệ → có giao dịch → chốt → mua lại, theo kênh/nguồn và theo tháng (cohort).
import type { Prisma } from "@prisma/client";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { wonLost } from "../metrics";
import { CHANNELS, normPhone, type Channel } from "../sources/ingest";
import { linkDealToContact, nameIndex } from "./store";

export const STAGES = [
  ["new", "Khách mới"],
  ["contacted", "Đã liên hệ"],
  ["deal", "Có giao dịch"],
  ["won", "Chốt"],
  ["repeat", "Mua lại"],
] as const;
export type StageKey = (typeof STAGES)[number][0];

export type FContact = { id: string; createdAt: Date; channel: string; source: string; contacted: boolean };
export type FDeal = { contactId: string | null; won: boolean; at: Date };
export type FOrder = { contactId: string | null };

export type Counts = Record<StageKey, number>;
export type GroupRow = { key: string; label: string; counts: Counts; winRate: number };
export type Cohort = { month: string; size: number; cells: (number | null)[] };
export type FunnelResult = {
  stages: { key: StageKey; label: string; count: number; stepRate: number | null; ofTotal: number }[];
  byChannel: GroupRow[];
  bySource: GroupRow[];
  cohorts: Cohort[];
};

// ---------------- Thuần: phân loại ----------------

/**
 * Hoạt động nào được tính là "đã liên hệ": gọi điện, khách trả lời kịch bản, tin đã gửi thật,
 * khách nhấp link email, hoặc ghi chú do nhân viên viết. Tin bị bỏ qua/chạy thử/lỗi và ghi chú hệ thống không tính.
 */
export function isContactActivity(a: { kind: string; author: string; body: string }, members: Set<string>) {
  if (a.kind === "call" || a.kind === "sequence_reply" || a.kind === "email_click") return true;
  if (a.kind === "message") return /^Đã gửi/.test(a.body);
  if (a.kind === "update") return members.has(a.author);
  return false;
}

const emptyCounts = (): Counts => ({ new: 0, contacted: 0, deal: 0, won: 0, repeat: 0 });
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** Mỗi tầng bao hàm tầng trước: có giao dịch thì coi như đã liên hệ, mua lại thì chắc chắn đã chốt. */
export function stagesOf(c: FContact, deals: FDeal[], orders: number): Record<StageKey, boolean> {
  const won = deals.filter((d) => d.won).length;
  const repeat = won >= 2 || orders >= 2;
  const isWon = won >= 1 || orders >= 1 || repeat;
  const hasDeal = deals.length > 0 || isWon;
  return { new: true, contacted: c.contacted || hasDeal, deal: hasDeal, won: isWon, repeat };
}

/** Tính phễu trên dữ liệu đã chuẩn hoá. contacts = khách tạo trong khoảng thời gian; deals/orders = mọi giao dịch của họ. */
export function computeFunnel(contacts: FContact[], deals: FDeal[], orders: FOrder[], opts: { now?: Date; cohortCols?: number; channelLabel?: (k: string) => string } = {}): FunnelResult {
  const now = opts.now ?? new Date();
  const cols = opts.cohortCols ?? 6;
  const dealsBy = new Map<string, FDeal[]>();
  for (const d of deals) if (d.contactId) dealsBy.set(d.contactId, [...(dealsBy.get(d.contactId) ?? []), d]);
  const ordersBy = new Map<string, number>();
  for (const o of orders) if (o.contactId) ordersBy.set(o.contactId, (ordersBy.get(o.contactId) ?? 0) + 1);

  const total = emptyCounts();
  const ch = new Map<string, Counts>();
  const src = new Map<string, Counts>();
  const cohort = new Map<string, { size: number; offsets: number[]; start: number }>();
  const add = (m: Map<string, Counts>, k: string, s: Record<StageKey, boolean>) => {
    const c = m.get(k) ?? emptyCounts();
    for (const [key] of STAGES) if (s[key]) c[key]++;
    m.set(k, c);
  };

  for (const c of contacts) {
    const ds = dealsBy.get(c.id) ?? [];
    const s = stagesOf(c, ds, ordersBy.get(c.id) ?? 0);
    for (const [key] of STAGES) if (s[key]) total[key]++;
    add(ch, c.channel || "other", s);
    add(src, c.source || "Nhập tay", s);

    const mk = monthKey(c.createdAt);
    const co = cohort.get(mk) ?? { size: 0, offsets: [], start: monthIndex(c.createdAt) };
    co.size++;
    const wonDates = ds.filter((d) => d.won).map((d) => d.at.getTime());
    if (wonDates.length) co.offsets.push(Math.max(0, monthIndex(new Date(Math.min(...wonDates))) - co.start));
    else if (s.won) co.offsets.push(0); // chốt qua đơn hàng, không rõ ngày: tính vào tháng đầu
    cohort.set(mk, co);
  }

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const stages = STAGES.map(([key, label], i) => ({
    key,
    label,
    count: total[key],
    stepRate: i === 0 ? null : pct(total[key], total[STAGES[i - 1][0]]),
    ofTotal: pct(total[key], total.new),
  }));
  const rows = (m: Map<string, Counts>, label: (k: string) => string): GroupRow[] =>
    [...m.entries()].map(([key, counts]) => ({ key, label: label(key), counts, winRate: pct(counts.won, counts.new) })).sort((a, b) => b.counts.new - a.counts.new || b.counts.won - a.counts.won);

  const nowIdx = monthIndex(now);
  const cohorts: Cohort[] = [...cohort.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, co]) => ({
      month,
      size: co.size,
      // Ô k = % khách của tháng đó đã chốt trong k tháng đầu (cộng dồn); tháng chưa tới thì để trống.
      cells: Array.from({ length: cols }, (_, k) => (co.start + k > nowIdx ? null : pct(co.offsets.filter((o) => o <= k).length, co.size))),
    }));

  return { stages, byChannel: rows(ch, opts.channelLabel ?? ((k) => k)), bySource: rows(src, (k) => k), cohorts };
}

// ---------------- Đọc từ CRM ----------------

/** Gom dữ liệu CRM rồi tính phễu. Giao dịch nối với khách qua _lien_he, tên khách trong mục bán hàng, hoặc SĐT. */
export async function loadFunnel(workspaceId: string, cfg: WorkspaceConfig, from: Date, to: Date, scope: Prisma.RecordWhereInput = { workspaceId }) {
  const contactsObj = getObject(cfg, "contacts");
  const dealsObj = getObject(cfg, "deals");
  const phoneKey = contactsObj?.fields.find((f) => f.type === "phone")?.key;
  const dealPhoneKey = dealsObj?.fields.find((f) => f.type === "phone")?.key;
  const { won } = wonLost(cfg);

  const [all, deals, orders, members] = await Promise.all([
    db.record.findMany({ where: { AND: [scope, { workspaceId, objectKey: "contacts" }] }, select: { id: true, title: true, dataJson: true, createdAt: true } }),
    db.record.findMany({ where: { workspaceId, objectKey: "deals" }, select: { id: true, title: true, dataJson: true, status: true, updatedAt: true, createdAt: true } }),
    db.order.findMany({ where: { workspaceId, status: { not: "cancelled" } }, select: { contactId: true, recordId: true, customerPhone: true } }),
    db.membership.findMany({ where: { workspaceId }, select: { user: { select: { name: true } } } }),
  ]);
  const ids = new Set(all.map((c) => c.id));
  const byName = nameIndex(all);
  const byPhone = new Map<string, string>();
  for (const c of all) {
    const p = phoneKey ? normPhone(String(parseJson<Record<string, unknown>>(c.dataJson, {})[phoneKey] ?? "")) : "";
    if (p && !byPhone.has(p)) byPhone.set(p, c.id);
  }

  const fDeals: FDeal[] = deals.map((d) => {
    const x = parseJson<Record<string, unknown>>(d.dataJson, {});
    let cid: string | null = typeof x._lien_he === "string" && ids.has(x._lien_he) ? x._lien_he : null;
    cid ??= linkDealToContact(d, byName, cfg)?.id ?? null;
    if (!cid && dealPhoneKey) cid = byPhone.get(normPhone(String(x[dealPhoneKey] ?? ""))) ?? null;
    // Không có ngày chốt riêng: lấy lần sửa cuối của mục đã thắng.
    return { contactId: cid, won: won.has(d.status), at: won.has(d.status) ? d.updatedAt : d.createdAt };
  });
  const fOrders: FOrder[] = orders.map((o) => ({ contactId: (o.contactId && ids.has(o.contactId) ? o.contactId : o.recordId && ids.has(o.recordId) ? o.recordId : byPhone.get(normPhone(o.customerPhone))) ?? null }));

  const inRange = all.filter((c) => c.createdAt >= from && c.createdAt <= to);
  const rangeIds = inRange.map((c) => c.id);
  const memberNames = new Set(members.map((m) => m.user.name));
  const contacted = new Set<string>();
  // SQLite giới hạn số tham số: chia nhỏ danh sách id.
  for (let i = 0; i < rangeIds.length; i += 500) {
    const chunk = rangeIds.slice(i, i + 500);
    const [acts, calls, convs] = await Promise.all([
      db.activity.findMany({ where: { recordId: { in: chunk }, kind: { in: ["call", "sequence_reply", "email_click", "message", "update"] } }, select: { recordId: true, kind: true, author: true, body: true } }),
      db.call.findMany({ where: { workspaceId, recordId: { in: chunk } }, select: { recordId: true } }),
      db.conversation.findMany({ where: { workspaceId, recordId: { in: chunk } }, select: { recordId: true } }),
    ]);
    for (const a of acts) if (isContactActivity(a, memberNames)) contacted.add(a.recordId);
    for (const c of calls) if (c.recordId) contacted.add(c.recordId);
    for (const c of convs) if (c.recordId) contacted.add(c.recordId);
  }

  const fContacts: FContact[] = inRange.map((c) => {
    const d = parseJson<Record<string, string>>(c.dataJson, {});
    return { id: c.id, createdAt: c.createdAt, channel: d._kenh || "other", source: d._nguon || d.nguon || "Nhập tay", contacted: contacted.has(c.id) };
  });
  return computeFunnel(fContacts, fDeals, fOrders, { now: to < new Date() ? to : new Date(), channelLabel: (k) => CHANNELS[k as Channel] ?? k });
}

/** Đọc khoảng ngày từ query (?from=YYYY-MM-DD&to=YYYY-MM-DD), mặc định 90 ngày qua. */
export function parseRange(from?: string | null, to?: string | null) {
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999`) : new Date();
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00`) : new Date(end.getTime() - 90 * 864e5);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    const e = new Date();
    return { from: new Date(e.getTime() - 90 * 864e5), to: e };
  }
  return { from: start, to: end };
}
