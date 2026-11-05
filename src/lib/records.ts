import type { Record as DbRecord } from "@prisma/client";
import { db, parseJson } from "./db";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { onSequenceEvent } from "./marketing/sequences";
import { runRules } from "./automation";

export type FieldValue = string | number;
export type RecordDTO = {
  id: string;
  objectKey: string;
  title: string;
  status: string;
  ownerName: string;
  amount: number;
  score: number;
  winProb: number | null;
  data: Record<string, FieldValue>;
  createdAt: string;
  updatedAt: string;
  updates: number;
};

export function toDTO(r: DbRecord & { _count?: { activities: number } }): RecordDTO {
  return {
    id: r.id,
    objectKey: r.objectKey,
    title: r.title,
    status: r.status,
    ownerName: r.ownerName,
    amount: r.amount,
    score: r.score,
    winProb: r.winProb ?? null,
    data: parseJson<Record<string, FieldValue>>(r.dataJson, {}),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    updates: r._count?.activities ?? 0,
  };
}

/** Lead Qualifier (bản luật): chấm điểm dựa trên độ đầy đủ thông tin và nguồn khách. */
export function scoreContact(data: Record<string, FieldValue>, cfg: WorkspaceConfig) {
  const obj = getObject(cfg, "contacts");
  let s = 30;
  const filled = obj ? obj.fields.filter((f) => String(data[f.key] ?? "").trim() !== "").length : 0;
  s += Math.min(filled * 8, 32);
  const src = String(data["nguon"] ?? "");
  s += src === "Giới thiệu" ? 25 : src === "Zalo" || src === "Hotline" ? 15 : src ? 8 : 0;
  return Math.max(5, Math.min(98, s));
}

type Event = { kind: "record_created" | "status_changed"; record: DbRecord; from?: string };

/** Chạy các công thức tự động hoá khớp sự kiện (luật cũ và luật nhiều điều kiện/hành động, xem src/lib/automation.ts). */
export async function runAutomations(workspaceId: string, cfg: WorkspaceConfig, ev: Event) {
  await onSequenceEvent(workspaceId, ev).catch((e) => console.error("[sequences]", e instanceof Error ? e.message : e));
  await runRules(workspaceId, cfg, ev).catch((e) => console.error("[automation]", e instanceof Error ? e.message : e));
}

export async function createRecord(
  workspaceId: string,
  cfg: WorkspaceConfig,
  input: { objectKey: string; title: string; status?: string; ownerName?: string; amount?: number; data?: Record<string, FieldValue> },
  author = "Bạn",
) {
  const obj = getObject(cfg, input.objectKey);
  if (!obj) throw new Error("Không có bảng này");
  const data = input.data ?? {};
  const score = input.objectKey === "contacts" ? scoreContact(data, cfg) : 0;
  const rec = await db.record.create({
    data: {
      workspaceId,
      objectKey: input.objectKey,
      title: input.title.trim() || `${obj.itemLabel} mới`,
      status: input.status && obj.statuses.some((s) => s.key === input.status) ? input.status : obj.statuses[0].key,
      ownerName: input.ownerName ?? "",
      amount: input.amount ?? 0,
      score,
      dataJson: JSON.stringify(data),
    },
  });
  await db.activity.create({ data: { recordId: rec.id, kind: "system", body: `${author} đã tạo mục này`, author } });
  if (score) {
    await db.activity.create({ data: { recordId: rec.id, kind: "ai", body: `Lead Qualifier chấm ${score}/100 dựa trên độ đầy đủ thông tin và nguồn khách.`, author: "Lead Qualifier" } });
  }
  await runAutomations(workspaceId, cfg, { kind: "record_created", record: rec });
  return db.record.findUniqueOrThrow({ where: { id: rec.id }, include: { _count: { select: { activities: true } } } });
}
