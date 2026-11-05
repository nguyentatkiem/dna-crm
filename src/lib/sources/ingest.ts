import type { Workspace } from "@prisma/client";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { wonLost } from "../metrics";
import { createRecord, type FieldValue } from "../records";

export const CHANNELS = {
  ads: "Quảng cáo",
  organic: "Tự nhiên (SEO, mạng xã hội)",
  zalo: "Zalo OA",
  ecommerce: "Sàn TMĐT & web bán hàng",
  website: "Website & landing page",
  call: "Tổng đài",
  other: "Khác",
} as const;
export type Channel = keyof typeof CHANNELS;

/** Lead đã chuẩn hoá: mọi nguồn (Facebook, Google, Zalo, Shopee...) đều đổi về dạng này. */
export type Lead = {
  provider: string;
  providerLabel: string;
  channel: Channel;
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  campaign?: string;
  externalId?: string;
  zaloUid?: string;
  extra?: Record<string, string>;
  order?: { code: string; amount: number; items: string; state: "open" | "won" | "lost" };
};

/** Đổi số Việt Nam về dạng 0xxxxxxxxx để so trùng: +84 912... / 84912... / 0912.345.678 → 0912345678. */
export function normPhone(p?: string) {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d.length >= 9 && d.length <= 11 ? d : "";
}

export async function loadConfig(workspaceId: string) {
  const row = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  return parseJson<WorkspaceConfig | null>(row?.configJson, null);
}

/** Tìm khách cũ theo số điện thoại (hoặc Zalo user id). SQLite không có JSON index nên lọc thô bằng contains rồi so lại. */
export async function findContact(workspaceId: string, cfg: WorkspaceConfig, phone: string, zaloUid?: string) {
  const obj = getObject(cfg, "contacts");
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
  const needle = zaloUid || phone.slice(-9);
  if (!needle) return null;
  const rows = await db.record.findMany({ where: { workspaceId, objectKey: "contacts", dataJson: { contains: needle } }, take: 20 });
  return (
    rows.find((r) => {
      const d = parseJson<Record<string, FieldValue>>(r.dataJson, {});
      if (zaloUid && d._zalo_uid === zaloUid) return true;
      return !!phone && !!phoneKey && normPhone(String(d[phoneKey] ?? "")) === phone;
    }) ?? null
  );
}

type Result = { status: "created" | "merged" | "duplicate" | "error"; recordId?: string; message?: string };

/** Ghi một lead vào CRM: chống trùng theo mã sự kiện, gộp khách cũ theo SĐT, tạo đơn hàng nếu có, ghi nhật ký. */
export async function ingestLead(ws: Workspace, lead: Lead, payload: unknown): Promise<Result> {
  const log = (r: Result) =>
    db.leadEvent
      .create({
        data: {
          workspaceId: ws.id,
          provider: lead.provider,
          channel: lead.channel,
          externalId: lead.externalId ?? "",
          status: r.status,
          message: r.message ?? "",
          recordId: r.recordId,
          payloadJson: JSON.stringify(payload ?? {}).slice(0, 20000),
        },
      })
      .then(() => r);

  if (lead.externalId) {
    const seen = await db.leadEvent.findFirst({ where: { workspaceId: ws.id, provider: lead.provider, externalId: lead.externalId, status: { in: ["created", "merged"] } } });
    if (seen) return { status: "duplicate", recordId: seen.recordId ?? undefined };
  }
  const cfg = await loadConfig(ws.id);
  const obj = cfg && getObject(cfg, "contacts");
  if (!cfg || !obj) return log({ status: "error", message: "Workspace chưa điền DNA" });

  const phone = normPhone(lead.phone);
  const phoneKey = obj.fields.find((f) => f.type === "phone")?.key;
  const emailKey = obj.fields.find((f) => f.type === "email")?.key;
  const sourceField = obj.fields.find((f) => f.key === "nguon");
  const sourceOpt = sourceField?.options.find((o) => {
    const a = o.label.toLowerCase();
    const b = lead.providerLabel.toLowerCase();
    return a.includes(b) || b.includes(a) || (lead.channel === "zalo" && a.includes("zalo"));
  });

  const meta: Record<string, string> = { _kenh: lead.channel, _nguon: lead.providerLabel };
  if (lead.campaign) meta._chien_dich = lead.campaign;
  if (lead.zaloUid) meta._zalo_uid = lead.zaloUid;

  const lines = [
    lead.note,
    lead.campaign && `Chiến dịch: ${lead.campaign}`,
    ...Object.entries(lead.extra ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);

  // Đơn sàn TMĐT không có SĐT/email người mua: chỉ ghi đơn hàng, không tạo khách ảo.
  if (lead.order && !phone && !lead.email && !lead.zaloUid) {
    const id = await upsertOrder(ws.id, cfg, lead, lead.name);
    return log({ status: "created", recordId: id, message: "Đơn hàng (sàn che thông tin người mua)" });
  }

  let existing = await findContact(ws.id, cfg, phone, lead.zaloUid);
  let status: Result["status"] = "merged";
  if (existing) {
    const d = parseJson<Record<string, FieldValue>>(existing.dataJson, {});
    const merged = { ...d };
    if (phoneKey && phone && !d[phoneKey]) merged[phoneKey] = phone;
    if (emailKey && lead.email && !d[emailKey]) merged[emailKey] = lead.email;
    if (lead.zaloUid && !d._zalo_uid) merged._zalo_uid = lead.zaloUid;
    await db.record.update({ where: { id: existing.id }, data: { dataJson: JSON.stringify(merged) } });
    await db.activity.create({
      data: { recordId: existing.id, kind: "system", body: `Khách quay lại qua ${lead.providerLabel}.${lines.length ? "\n" + lines.join("\n") : ""}`, author: lead.providerLabel },
    });
  } else {
    status = "created";
    const data: Record<string, FieldValue> = { ...meta };
    if (phoneKey && phone) data[phoneKey] = phone;
    if (emailKey && lead.email) data[emailKey] = lead.email;
    if (sourceOpt) data.nguon = sourceOpt.label;
    existing = await createRecord(ws.id, cfg, { objectKey: "contacts", title: lead.name || phone || "Khách mới", data }, lead.providerLabel);
    if (lines.length) await db.activity.create({ data: { recordId: existing.id, kind: "update", body: lines.join("\n"), author: lead.providerLabel } });
  }

  if (lead.order) await upsertOrder(ws.id, cfg, lead, existing.title);
  await db.agentLog.create({
    data: { workspaceId: ws.id, agent: "Hub nguồn khách", message: `${status === "created" ? "Lead mới" : "Khách cũ quay lại"} từ ${lead.providerLabel}: ${existing.title}` },
  });
  return log({ status, recordId: existing.id });
}

/** Đơn từ sàn/web bán hàng thành một mục ở bảng bán hàng; cùng mã đơn thì chỉ cập nhật trạng thái. */
async function upsertOrder(workspaceId: string, cfg: WorkspaceConfig, lead: Lead, customer: string): Promise<string | undefined> {
  const deals = getObject(cfg, "deals");
  if (!deals || !lead.order) return;
  const { won, lost } = wonLost(cfg);
  const status =
    lead.order.state === "won" ? deals.statuses.find((s) => won.has(s.key))?.key : lead.order.state === "lost" ? deals.statuses.find((s) => lost.has(s.key))?.key : undefined;
  const tag = `${lead.provider}:${lead.order.code}`;
  const old = await db.record.findFirst({ where: { workspaceId, objectKey: "deals", dataJson: { contains: tag } } });
  if (old) {
    if (status && old.status !== status) await db.record.update({ where: { id: old.id }, data: { status, amount: lead.order.amount || old.amount } });
    return old.id;
  }
  const custKey = deals.fields.find((f) => f.type === "text")?.key;
  const data: Record<string, FieldValue> = { _don: tag, _kenh: lead.channel, _nguon: lead.providerLabel };
  if (custKey) data[custKey] = customer;
  const rec = await createRecord(workspaceId, cfg, { objectKey: "deals", title: `Đơn ${lead.order.code} · ${customer}`, status, amount: lead.order.amount, data }, lead.providerLabel);
  if (lead.order.items) await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Sản phẩm: ${lead.order.items}`, author: lead.providerLabel } });
  return rec.id;
}
