import type { Record as DbRecord } from "@prisma/client";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { normCampaign } from "./shared";

// ---------------- Ánh xạ chiến dịch thủ công ----------------
// Lưu trong Workspace.settingsJson dưới khoá "campaignMap": { [tên chiến dịch QC đã chuẩn hoá]: tên chiến dịch trong CRM }.
// Đọc/ghi thẳng JSON để không đụng type Integrations của settings.ts.

export type CampaignMap = Record<string, string>;

export async function getCampaignMap(workspaceId: string): Promise<CampaignMap> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settingsJson: true } });
  const s = parseJson<Record<string, unknown>>(ws?.settingsJson, {});
  const m = s.campaignMap;
  return m && typeof m === "object" ? (m as CampaignMap) : {};
}

/** crmCampaign rỗng = bỏ ánh xạ, quay về so khớp tự động. */
export async function setCampaignMapping(workspaceId: string, adCampaign: string, crmCampaign: string) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { settingsJson: true } });
  const s = parseJson<Record<string, unknown>>(ws.settingsJson, {});
  const map = { ...((s.campaignMap as CampaignMap) ?? {}) };
  const k = normCampaign(adCampaign);
  if (!k) return map;
  if (crmCampaign.trim()) map[k] = crmCampaign.trim().slice(0, 200);
  else delete map[k];
  s.campaignMap = map;
  await db.workspace.update({ where: { id: workspaceId }, data: { settingsJson: JSON.stringify(s) } });
  return map;
}

// ---------------- Liên kết đơn hàng ↔ khách ----------------

/** Khoá so khớp tên khách: bỏ dấu, chữ thường. */
const nk = (s: string) => normCampaign(s);

/** Tìm khách (contacts) ứng với một mục bán hàng: theo trường văn bản chứa tên khách, hoặc tên mục ("Đơn X · Tên khách"). */
export function linkDealToContact<T extends Pick<DbRecord, "id" | "title">>(deal: Pick<DbRecord, "title" | "dataJson">, byName: Map<string, T>, cfg: WorkspaceConfig): T | undefined {
  const d = parseJson<Record<string, unknown>>(deal.dataJson, {});
  const textKeys = getObject(cfg, "deals")?.fields.filter((f) => f.type === "text").map((f) => f.key) ?? [];
  for (const k of textKeys) {
    const v = d[k];
    if (typeof v === "string" && v && byName.has(nk(v))) return byName.get(nk(v));
  }
  const t = deal.title.includes("·") ? deal.title.split("·").pop()!.trim() : deal.title;
  return byName.get(nk(t));
}

export function nameIndex<T extends Pick<DbRecord, "title">>(contacts: T[]) {
  const m = new Map<string, T>();
  for (const c of contacts) if (!m.has(nk(c.title))) m.set(nk(c.title), c);
  return m;
}

/** Thông tin liên lạc của một record: nếu là mục bán hàng thì lấy từ khách liên quan. */
export async function contactInfo(workspaceId: string, cfg: WorkspaceConfig, record: DbRecord) {
  let contact: DbRecord | null = record.objectKey === "contacts" ? record : null;
  if (!contact) {
    const d = parseJson<Record<string, unknown>>(record.dataJson, {});
    const textKeys = getObject(cfg, "deals")?.fields.filter((f) => f.type === "text").map((f) => f.key) ?? [];
    const names = [...textKeys.map((k) => d[k]).filter((v): v is string => typeof v === "string" && !!v), record.title.includes("·") ? record.title.split("·").pop()!.trim() : record.title];
    for (const n of names) {
      contact = await db.record.findFirst({ where: { workspaceId, objectKey: "contacts", title: n } });
      if (contact) break;
    }
  }
  const obj = getObject(cfg, "contacts");
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
  const emailKey = obj?.fields.find((f) => f.type === "email")?.key;
  const cd = parseJson<Record<string, unknown>>(contact?.dataJson ?? record.dataJson, {});
  return {
    contact,
    name: contact?.title ?? record.title,
    phone: phoneKey ? String(cd[phoneKey] ?? "") : "",
    email: emailKey ? String(cd[emailKey] ?? "") : "",
    zaloUid: typeof cd._zalo_uid === "string" ? cd._zalo_uid : "",
    owner: record.ownerName || contact?.ownerName || "",
  };
}

/** Cấu hình đang dùng (viết lại ở đây để tránh vòng import records ↔ sequences). */
export async function loadCfg(workspaceId: string) {
  const row = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  return parseJson<WorkspaceConfig | null>(row?.configJson, null);
}
