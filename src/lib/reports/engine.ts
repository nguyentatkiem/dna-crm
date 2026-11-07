// Engine báo cáo tự tạo: dựng truy vấn Prisma từ cấu hình đã kiểm tra (chỉ các trường đã khai báo trong
// datasetFields — không bao giờ ghép SQL từ dữ liệu người dùng), LUÔN ghép phạm vi quyền của người xem,
// lấy tối đa MAX_ROWS dòng rồi lọc/nhóm/tính chỉ số trong JS.
import type { Prisma } from "@prisma/client";
import { db, parseJson } from "../db";
import type { WorkspaceConfig } from "../config/schema";
import { wonLost } from "../metrics";
import { callScope, recordScope } from "../permissions";
import { docScope } from "../sales/access";
import { ticketScope } from "../care/server";
import { conversationWhere } from "../chat/visibility";
import { POSITIVE, TALKED } from "../calls-shared";
import { aggregate, coerce, datasetFields, rangeOf, type DateRange, type FieldMeta, type ReportConfig, type ReportFilter, type ReportResult, type Row } from "./shared";

export type ReportCtx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

/** Trần số dòng quét mỗi lần chạy (tránh làm nặng máy chủ). Vượt trần → kết quả đánh dấu truncated. */
export const MAX_ROWS = 20000;

type Where = Record<string, unknown>;

/** Đẩy bộ lọc trên cột thật xuống Prisma. Trả phần where và các bộ lọc còn lại phải lọc trong JS. */
export function pushDown(filters: ReportFilter[], fields: FieldMeta[]): { where: Where[]; rest: ReportFilter[] } {
  const where: Where[] = [];
  const rest: ReportFilter[] = [];
  for (const flt of filters) {
    const f = fields.find((x) => x.key === flt.field);
    if (!f?.col || f.type === "bool") {
      rest.push(flt);
      continue;
    }
    const col = f.col;
    const v = coerce(f, Array.isArray(flt.value) ? flt.value[0] : flt.value);
    const isStr = f.type === "text" || f.type === "enum" || f.type === "owner";
    switch (flt.op) {
      case "eq":
        if (f.type === "date") rest.push(flt);
        else where.push({ [col]: v });
        break;
      case "neq":
        if (f.type === "date") rest.push(flt);
        else where.push({ NOT: { [col]: v } });
        break;
      case "in": {
        const list = (Array.isArray(flt.value) ? flt.value : String(flt.value ?? "").split(",")).map((s) => String(s).trim()).slice(0, 50);
        if (isStr) where.push({ [col]: { in: list } });
        else rest.push(flt);
        break;
      }
      case "gt":
      case "gte":
      case "lt":
      case "lte":
        if (f.type === "date" || v === null) rest.push(flt);
        else where.push({ [col]: { [flt.op]: v } });
        break;
      default:
        // contains (cần so khớp không dấu), empty / not_empty: lọc trong JS cho nhất quán.
        rest.push(flt);
    }
  }
  return { where, rest };
}

const dateWhere = (col: string | undefined, r: DateRange): Where[] => (col && (r.from || r.to) ? [{ [col]: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lt: r.to } : {}) } }] : []);

/** Lọc khoảng ngày cho trường ngày không có cột thật (trường tuỳ biến trong dataJson). */
function inRange(v: unknown, r: DateRange) {
  if (!r.from && !r.to) return true;
  if (!(v instanceof Date) || isNaN(v.getTime())) return false;
  return (!r.from || v >= r.from) && (!r.to || v < r.to);
}

function customValue(f: FieldMeta, raw: unknown): Row[string] {
  if (raw === undefined || raw === null || raw === "") return null;
  if (f.type === "date") {
    const d = coerce(f, String(raw).slice(0, 10));
    return d instanceof Date ? d : null;
  }
  if (f.type === "bool") return raw === true || raw === 1 || raw === "1" || raw === "true";
  if (f.type === "number" || f.type === "money") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return String(raw);
}

/** Lấy dòng của nguồn dữ liệu (đã ghép phạm vi quyền của người xem). */
async function fetchRows(ctx: ReportCtx, cfg: WorkspaceConfig | null, c: ReportConfig, fields: FieldMeta[], range: DateRange): Promise<{ rows: Row[]; truncated: boolean; rest: ReportFilter[] }> {
  const df = fields.find((f) => f.key === c.dateField);
  const { where: pd, rest } = pushDown(c.filters, fields);
  const and = [...pd, ...dateWhere(df?.col, range)];
  const take = MAX_ROWS + 1;
  const wid = ctx.workspace.id;
  let rows: Row[] = [];
  let n = 0;

  switch (c.dataset) {
    case "contacts":
    case "deals": {
      const scope = await recordScope(ctx);
      const where = { AND: [scope, { workspaceId: wid, objectKey: c.dataset, deletedAt: null }, ...and] } as Prisma.RecordWhereInput;
      const list = await db.record.findMany({ where, take, orderBy: { createdAt: "desc" } });
      n = list.length;
      const { won, lost } = cfg ? wonLost(cfg) : { won: new Set<string>(), lost: new Set<string>() };
      const custom = fields.filter((f) => f.key.startsWith("d_"));
      rows = list.slice(0, MAX_ROWS).map((r) => {
        const data = parseJson<Record<string, unknown>>(r.dataJson, {});
        const row: Row = { title: r.title, status: r.status, ownerName: r.ownerName, amount: r.amount, score: r.score, createdAt: r.createdAt, updatedAt: r.updatedAt, won: won.has(r.status), lost: lost.has(r.status) };
        for (const f of custom) row[f.key] = customValue(f, data[f.key.slice(2)]);
        return row;
      });
      break;
    }
    case "orders": {
      const s = await docScope(ctx);
      const list = await db.order.findMany({ where: { AND: [s.where, ...and] } as Prisma.OrderWhereInput, take, orderBy: { createdAt: "desc" } });
      n = list.length;
      rows = list.slice(0, MAX_ROWS).map((o) => ({ ...pick(o, ["number", "customerName", "status", "createdBy", "total", "paid", "discount", "salesChannel", "shipProvince", "createdAt", "dueAt"]), debt: o.status === "cancelled" ? 0 : Math.max(0, o.total - o.paid) }));
      break;
    }
    case "payments": {
      const s = await docScope(ctx);
      const list = await db.payment.findMany({ where: { AND: [{ workspaceId: wid }, { order: s.where as Prisma.OrderWhereInput }, ...and] } as Prisma.PaymentWhereInput, take, orderBy: { paidAt: "desc" }, include: { order: { select: { number: true } } } });
      n = list.length;
      rows = list.slice(0, MAX_ROWS).map((p) => ({ ...pick(p, ["amount", "method", "createdBy", "paidAt", "createdAt"]), orderNumber: p.order.number }));
      break;
    }
    case "calls": {
      const list = await db.call.findMany({ where: { AND: [await callScope(ctx), ...and] } as Prisma.CallWhereInput, take, orderBy: { startedAt: "desc" } });
      n = list.length;
      rows = list.slice(0, MAX_ROWS).map((x) => ({ ...pick(x, ["agentName", "outcome", "direction", "durationSec", "aiScore", "reviewScore", "provider", "startedAt"]), talked: TALKED.has(x.outcome), positive: POSITIVE.has(x.outcome) }));
      break;
    }
    case "tickets": {
      const list = await db.ticket.findMany({ where: { AND: [await ticketScope(ctx), ...and] } as Prisma.TicketWhereInput, take, orderBy: { createdAt: "desc" } });
      n = list.length;
      rows = list.slice(0, MAX_ROWS).map((t) => ({
        ...pick(t, ["subject", "status", "priority", "channel", "category", "assignee", "csat", "createdAt", "resolvedAt"]),
        resolved: t.status === "resolved" || t.status === "closed",
        resolveHours: t.resolvedAt ? Math.round(((t.resolvedAt.getTime() - t.createdAt.getTime()) / 3600e3) * 10) / 10 : null,
      }));
      break;
    }
    case "conversations": {
      const list = await db.conversation.findMany({ where: { AND: [await conversationWhere(ctx), ...and] } as Prisma.ConversationWhereInput, take, orderBy: { lastAt: "desc" } });
      n = list.length;
      rows = list.slice(0, MAX_ROWS).map((x) => ({
        ...pick(x, ["channel", "kind", "status", "assignee", "source", "sentiment", "quality", "orderMarked", "createdAt", "lastAt"]),
        firstReplyMin: x.firstReplyAt ? Math.max(0, Math.round((x.firstReplyAt.getTime() - x.createdAt.getTime()) / 60e3)) : null,
      }));
      break;
    }
    case "activities": {
      const scope = await recordScope(ctx);
      const list = await db.activity.findMany({
        where: { AND: [{ record: { AND: [scope, { deletedAt: null }] } }, ...and] } as Prisma.ActivityWhereInput,
        take,
        orderBy: { createdAt: "desc" },
        include: { record: { select: { objectKey: true, title: true } } },
      });
      n = list.length;
      rows = list.slice(0, MAX_ROWS).map((a) => ({ author: a.author, kind: a.kind, createdAt: a.createdAt, objectKey: a.record.objectKey, recordTitle: a.record.title }));
      break;
    }
  }
  // Trường ngày tuỳ biến (không có cột thật): lọc khoảng ngày trong JS.
  if (df && !df.col) rows = rows.filter((r) => inRange(r[df.key], range));
  return { rows, truncated: n > MAX_ROWS, rest };
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Row {
  const out: Row = {};
  for (const k of keys) out[k as string] = o[k] as Row[string];
  return out;
}

/** Chạy báo cáo cho người xem `ctx` (cấu hình phải qua validateConfig trước). */
export async function runReport(ctx: ReportCtx, cfg: WorkspaceConfig | null, c: ReportConfig, now = new Date()): Promise<ReportResult> {
  const fields = datasetFields(c.dataset, cfg);
  const range = rangeOf(c.range, now);
  const { rows, truncated, rest } = await fetchRows(ctx, cfg, c, fields, range);
  return aggregate(rows, c, fields, { range, truncated, jsFilters: rest });
}

/** Ngữ cảnh chạy báo cáo dưới quyền của một thành viên (gửi theo lịch, link tải): dùng phạm vi của người tạo. */
export async function ctxForUser(workspaceId: string, userId: string): Promise<ReportCtx | null> {
  const [m, ws] = await Promise.all([
    db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, include: { user: { select: { id: true, name: true, email: true } } } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, settingsJson: true } }),
  ]);
  if (!m || !ws) return null;
  return { user: { id: m.user.id, name: m.user.name }, workspace: ws };
}

export async function activeConfig(workspaceId: string): Promise<WorkspaceConfig | null> {
  const row = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  return row ? parseJson<WorkspaceConfig | null>(row.configJson, null) : null;
}
