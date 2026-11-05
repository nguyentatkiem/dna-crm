import type { Automation, Record as DbRecord } from "@prisma/client";
import { db, parseJson } from "./db";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { notify, userIdByName } from "./notify";
import { vnd } from "./format";
import { sendMessage } from "./marketing/messaging";
import { enrollRecord, onSequenceEvent } from "./marketing/sequences";
import { scoreContact, type FieldValue } from "./records";
import { ruleOf, rowOf, sentenceText, type Action, type Condition, type Rule, type Trigger, type TriggerType } from "@/app/w/automations/rules";

export * from "@/app/w/automations/rules";

export const AUTOMATION_AGENT = "Tự động hoá";
/** Độ sâu tối đa khi một hành động (đổi trạng thái, cập nhật trường, tạo mục) kích hoạt luật khác. */
const MAX_DEPTH = 3;

export type RuleEvent = {
  kind: TriggerType;
  record: DbRecord;
  /** status_changed: trạng thái cũ. */
  from?: string;
  /** field_changed: key trường, giá trị cũ, giá trị mới. */
  field?: string;
  prev?: FieldValue;
  value?: FieldValue;
  /** score_above: điểm mới và điểm cũ (nếu biết, chỉ chạy khi vừa vượt ngưỡng). */
  score?: number;
  prevScore?: number;
  /** call_logged: kết quả cuộc gọi (key trong OUTCOMES). */
  outcome?: string;
  /** message_received: kênh (zalo/messenger) và nội dung tin. */
  channel?: string;
  text?: string;
};

const dataOf = (r: DbRecord) => parseJson<Record<string, FieldValue>>(r.dataJson, {});
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Điền biến {title}, {owner}, {status}, {amount}, {phone}, {email}, {score}, {key trường} vào nội dung. */
export function fillVars(text: string, r: DbRecord, cfg: WorkspaceConfig) {
  const obj = getObject(cfg, r.objectKey);
  const data = dataOf(r);
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
  const emailKey = obj?.fields.find((f) => f.type === "email")?.key;
  const vars: Record<string, string> = {
    title: r.title,
    owner: r.ownerName || "chưa giao",
    status: obj?.statuses.find((s) => s.key === r.status)?.label ?? r.status,
    amount: vnd(r.amount),
    score: String(r.score),
    phone: String((phoneKey && data[phoneKey]) || data.phone || ""),
    email: String((emailKey && data[emailKey]) || data.email || ""),
  };
  return text.replace(/\{([\w]+)\}/g, (m, k: string) => (k in vars ? vars[k] : k in data ? String(data[k]) : m));
}

function valueOf(field: string, r: DbRecord): FieldValue {
  const data = dataOf(r);
  if (field === "status") return r.status;
  if (field === "owner") return r.ownerName;
  if (field === "channel") return data._kenh ?? "";
  if (field === "source") return data._nguon ?? data.nguon ?? "";
  if (field === "amount") return r.amount;
  if (field === "score") return r.score;
  if (field === "title") return r.title;
  return data[field.startsWith("f:") ? field.slice(2) : field] ?? "";
}

/** Kiểm tra một điều kiện. Trạng thái so được cả theo key và nhãn. */
export function checkCondition(c: Condition, r: DbRecord, cfg: WorkspaceConfig) {
  const v = valueOf(c.field, r);
  const target = c.value ?? "";
  const num = (x: unknown) => Number(String(x).replace(/[^\d.-]/g, ""));
  const same = () => {
    if (lower(v) === lower(target)) return true;
    if (c.field === "status") return lower(getObject(cfg, r.objectKey)?.statuses.find((s) => s.key === v)?.label) === lower(target);
    return typeof v === "number" && v === num(target);
  };
  switch (c.op) {
    case "eq":
      return same();
    case "neq":
      return !same();
    case "gt":
      return num(v) > num(target);
    case "lt":
      return num(v) < num(target);
    case "contains":
      return lower(v).includes(lower(target));
    case "empty":
      return lower(v) === "";
    case "not_empty":
      return lower(v) !== "";
  }
}

function triggerMatches(t: Trigger, ev: RuleEvent) {
  switch (t.type) {
    case "status_changed":
      return (!t.to || t.to === ev.record.status) && (!t.from || t.from === ev.from);
    case "field_changed":
      return (!t.field || t.field === ev.field) && (!t.value || lower(t.value) === lower(ev.value));
    case "score_above": {
      const th = t.threshold ?? 70;
      const score = ev.score ?? ev.record.score;
      return score >= th && (ev.prevScore == null || ev.prevScore < th);
    }
    case "call_logged":
      return !t.value || t.value === ev.outcome;
    case "message_received":
      return !t.value || t.value === ev.channel;
    default:
      return true;
  }
}

// ---------- Webhook an toàn: chỉ http/https, chặn localhost và IP nội bộ ----------
// Không import tĩnh "node:dns" để file này vẫn bundle được ở mọi nơi (instrumentation/edge).
const isIP = (s: string) => (/^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split(".").every((x) => Number(x) <= 255) ? 4 : s.includes(":") && /^[0-9a-f:.]+$/i.test(s) ? 6 : 0);
async function lookupAll(host: string): Promise<string[]> {
  const dns = (await import(/* webpackIgnore: true */ "node:dns/promises")) as typeof import("node:dns/promises");
  return (await dns.lookup(host, { all: true })).map((a) => a.address);
}
function privateIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
}

export async function checkWebhookUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("URL webhook không hợp lệ");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Webhook chỉ nhận http hoặc https");
  if (u.username || u.password) throw new Error("URL webhook không được chứa tài khoản");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(host)) throw new Error("Không gọi webhook tới máy nội bộ");
  const addrs = isIP(host) ? [host] : await lookupAll(host).catch(() => [] as string[]);
  if (!addrs.length) throw new Error("Không phân giải được tên miền webhook");
  if (addrs.some(privateIp)) throw new Error("Không gọi webhook tới địa chỉ IP nội bộ");
  return u;
}

async function postWebhook(url: string, payload: unknown) {
  const u = await checkWebhookUrl(url);
  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "DNA-CRM-Automation/1.0" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
    redirect: "manual",
  });
  if (res.status >= 300) throw new Error(`Webhook trả mã ${res.status}`);
}

// ---------- Hành động ----------
type RunCtx = { workspaceId: string; cfg: WorkspaceConfig; depth: number; ruleName: string; kind: TriggerType };

async function teamOf(workspaceId: string, cfg: WorkspaceConfig) {
  const members = await db.membership.findMany({ where: { workspaceId }, select: { user: { select: { name: true } } } });
  const team = cfg.team.length ? cfg.team : members.map((m) => m.user.name);
  return team.filter(Boolean);
}

async function runAction(a: Action, rec: DbRecord, x: RunCtx): Promise<{ record: DbRecord; note: string }> {
  const { workspaceId, cfg } = x;
  const obj = getObject(cfg, rec.objectKey);
  const href = `/w/b/${rec.objectKey}?open=${rec.id}`;
  const fill = (s?: string) => fillVars(s ?? "", rec, cfg);
  const log = (body: string) => db.activity.create({ data: { recordId: rec.id, kind: "system", body, author: AUTOMATION_AGENT } });

  switch (a.type) {
    case "create_task": {
      const due = new Date();
      due.setDate(due.getDate() + (a.days ?? 0));
      const assignee = a.mode === "user" ? a.user ?? "" : a.mode && a.mode !== "owner" ? a.mode : rec.ownerName;
      const title = fill(a.text || "Theo dõi {title}");
      await db.task.create({ data: { workspaceId, recordId: rec.id, title, assignee, dueAt: due, source: AUTOMATION_AGENT } });
      return { record: rec, note: `tạo việc “${title}”` };
    }
    case "notify": {
      const text = fill(a.text || "Có cập nhật mới ở {title}");
      const userId = a.mode === "all" ? "" : await userIdByName(workspaceId, a.mode === "user" ? a.user ?? "" : rec.ownerName);
      await notify(workspaceId, { userId, kind: "automation", text, href });
      await log(`Thông báo tự động: ${text}`);
      return { record: rec, note: "gửi thông báo" };
    }
    case "assign_owner": {
      if (a.value === "only_empty" && rec.ownerName) return { record: rec, note: "đã có người phụ trách" };
      const team = await teamOf(workspaceId, cfg);
      let owner = "";
      if (a.mode === "user") owner = a.user ?? "";
      else if (a.mode === "least_busy" && team.length) {
        const [tasks, owned] = await Promise.all([
          db.task.groupBy({ by: ["assignee"], where: { workspaceId, done: false, assignee: { in: team } }, _count: true }),
          db.record.groupBy({ by: ["ownerName"], where: { workspaceId, objectKey: rec.objectKey, ownerName: { in: team } }, _count: true }),
        ]);
        const load = (n: string) => (tasks.find((t) => t.assignee === n)?._count ?? 0) * 1000 + (owned.find((o) => o.ownerName === n)?._count ?? 0);
        owner = [...team].sort((p, q) => load(p) - load(q))[0];
      } else {
        const count = await db.record.count({ where: { workspaceId, objectKey: rec.objectKey } });
        owner = team[count % Math.max(team.length, 1)] ?? "Bạn";
      }
      if (!owner) throw new Error("Không có người để giao");
      if (owner === rec.ownerName) return { record: rec, note: `giữ ${owner}` };
      const record = await db.record.update({ where: { id: rec.id }, data: { ownerName: owner } });
      await log(`Tự động giao cho ${owner}`);
      return { record, note: `giao cho ${owner}` };
    }
    case "set_status": {
      const st = obj?.statuses.find((s) => s.key === a.value || lower(s.label) === lower(a.value));
      if (!st) throw new Error("Trạng thái không có trong bảng này");
      if (st.key === rec.status) return { record: rec, note: "trạng thái đã đúng" };
      const from = rec.status;
      const record = await db.record.update({ where: { id: rec.id }, data: { status: st.key } });
      await log(`Tự động đổi ${obj?.statusLabel.toLowerCase() ?? "trạng thái"} từ “${obj?.statuses.find((s) => s.key === from)?.label ?? from}” sang “${st.label}”`);
      await nested(x, { kind: "status_changed", record, from });
      return { record, note: `đổi trạng thái sang ${st.label}` };
    }
    case "set_field": {
      const key = a.field?.replace(/^f:/, "") ?? "";
      const def = obj?.fields.find((f) => f.key === key);
      if (!def) throw new Error("Trường không có trong bảng này");
      const raw = fill(a.value);
      const value: FieldValue = ["number", "money", "rating"].includes(def.type) ? Number(raw) || 0 : raw;
      const data = dataOf(rec);
      const prev = data[key];
      if (prev === value) return { record: rec, note: "giá trị đã đúng" };
      const record = await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify({ ...data, [key]: value }) } });
      await log(`Tự động cập nhật ${def.label}: “${value}”`);
      await nested(x, { kind: "field_changed", record, field: key, prev, value });
      return { record, note: `cập nhật ${def.label}` };
    }
    case "send_message": {
      const channel = a.channel ?? "zalo";
      const res = await sendMessage(workspaceId, { channel, recordId: rec.id, body: fill(a.text), subject: a.subject ? fill(a.subject) : undefined });
      if (!res.ok && !res.skipped) throw new Error(res.error || "Gửi tin không thành công");
      await log(`Tự động gửi ${channel.toUpperCase()}${res.skipped ? " (bỏ qua: " + (res.error || "không đủ điều kiện") + ")" : ""}: ${fill(a.text).slice(0, 160)}`);
      return { record: rec, note: res.skipped ? `bỏ qua gửi ${channel}` : `gửi ${channel}` };
    }
    case "enroll_sequence": {
      if (!a.sequenceId) throw new Error("Chưa chọn kịch bản chăm sóc");
      const seq = await db.sequence.findFirst({ where: { id: a.sequenceId, workspaceId } });
      if (!seq) throw new Error("Kịch bản chăm sóc không còn tồn tại");
      await enrollRecord(workspaceId, seq.id, rec.id);
      return { record: rec, note: `đưa vào “${seq.name}”` };
    }
    case "webhook": {
      if (!a.url) throw new Error("Chưa nhập URL webhook");
      await postWebhook(a.url, {
        event: x.kind,
        rule: x.ruleName,
        at: new Date().toISOString(),
        record: { id: rec.id, objectKey: rec.objectKey, title: rec.title, status: rec.status, ownerName: rec.ownerName, amount: rec.amount, score: rec.score, data: dataOf(rec), createdAt: rec.createdAt.toISOString() },
      });
      return { record: rec, note: "gọi webhook" };
    }
    case "add_activity": {
      await log(fill(a.text || "Ghi chú tự động"));
      return { record: rec, note: "ghi chú" };
    }
    case "create_record": {
      const target = getObject(cfg, a.object || "deals");
      if (!target) throw new Error("Không có bảng đích");
      const src = dataOf(rec);
      const data: Record<string, FieldValue> = {};
      for (const f of target.fields) if (src[f.key] !== undefined) data[f.key] = src[f.key];
      for (const k of ["_kenh", "_nguon", "_chien_dich"]) if (src[k] !== undefined) data[k] = src[k];
      data._lien_he = rec.id;
      const status = target.statuses.find((s) => s.key === a.value)?.key ?? target.statuses[0].key;
      const created = await db.record.create({
        data: {
          workspaceId,
          objectKey: target.key,
          title: fill(a.text || "{title}").slice(0, 200) || `${target.itemLabel} mới`,
          status,
          ownerName: rec.ownerName,
          score: target.key === "contacts" ? scoreContact(data, cfg) : 0,
          dataJson: JSON.stringify(data),
        },
      });
      await db.activity.create({ data: { recordId: created.id, kind: "system", body: `Tự động tạo từ ${obj?.itemLabel.toLowerCase() ?? "mục"} “${rec.title}”`, author: AUTOMATION_AGENT } });
      await log(`Tự động tạo ${target.itemLabel.toLowerCase()} “${created.title}”`);
      await nested(x, { kind: "record_created", record: created });
      return { record: rec, note: `tạo ${target.itemLabel.toLowerCase()} “${created.title}”` };
    }
  }
}

/** Sự kiện lồng do hành động gây ra: chỉ chạy tiếp khi chưa quá độ sâu cho phép (chống vòng lặp). */
async function nested(x: RunCtx, ev: RuleEvent) {
  if (x.depth + 1 > MAX_DEPTH) {
    await db.agentLog.create({ data: { workspaceId: x.workspaceId, agent: AUTOMATION_AGENT, message: `[${x.ruleName}] Dừng chuỗi luật lồng nhau ở độ sâu ${MAX_DEPTH} để tránh vòng lặp` } });
    return;
  }
  if (ev.kind === "record_created" || ev.kind === "status_changed") {
    await onSequenceEvent(x.workspaceId, { kind: ev.kind, record: ev.record }).catch((e) => console.error("[sequences]", e instanceof Error ? e.message : e));
  }
  await runRules(x.workspaceId, x.cfg, ev, x.depth + 1);
}

/** Tên hiển thị của luật; luật cũ chưa có tên thì dùng câu mô tả. */
export const ruleName = (rule: Rule, cfg: WorkspaceConfig) => (rule.name || sentenceText(rule, cfg)).slice(0, 80);

/** Chạy một luật đã khớp trigger: kiểm điều kiện rồi chạy lần lượt các hành động. Lỗi một hành động không chặn hành động sau. */
async function execute(row: Automation, rule: Rule, x: Omit<RunCtx, "ruleName">, ev: RuleEvent) {
  let rec = (await db.record.findUnique({ where: { id: ev.record.id } })) ?? null;
  if (!rec) return false;
  if (!rule.conditions.every((c) => checkCondition(c, rec!, x.cfg))) return false;
  const name = ruleName(rule, x.cfg);
  const ctx: RunCtx = { ...x, ruleName: name };
  const notes: string[] = [];
  const errors: string[] = [];
  for (const a of rule.actions) {
    try {
      const out = await runAction(a, rec, ctx);
      rec = out.record;
      notes.push(out.note);
    } catch (e) {
      errors.push(`${a.type}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await db.automation.update({ where: { id: row.id }, data: { runs: { increment: 1 } } });
  const okN = rule.actions.length - errors.length;
  await db.agentLog.create({
    data: {
      workspaceId: x.workspaceId,
      agent: AUTOMATION_AGENT,
      message: `[${name}] ${rec.title}: ${okN}/${rule.actions.length} hành động (${notes.join("; ") || "không có"})${errors.length ? ` · Lỗi: ${errors.join("; ")}` : ""}`.slice(0, 1000),
    },
  });
  return true;
}

/** Chạy mọi luật khớp sự kiện (luật cũ và mới). depth dùng nội bộ để chống vòng lặp. */
export async function runRules(workspaceId: string, cfg: WorkspaceConfig, ev: RuleEvent, depth = 0): Promise<number> {
  if (depth > MAX_DEPTH) return 0;
  const rows = await db.automation.findMany({ where: { workspaceId, enabled: true, triggerType: ev.kind, triggerObject: ev.record.objectKey }, orderBy: { createdAt: "asc" } });
  let ran = 0;
  for (const row of rows) {
    const rule = ruleOf(row);
    if (!triggerMatches(rule.trigger, ev)) continue;
    try {
      if (await execute(row, rule, { workspaceId, cfg, depth, kind: ev.kind }, ev)) ran++;
    } catch (e) {
      console.error("[automation]", row.id, e instanceof Error ? e.message : e);
    }
  }
  return ran;
}

/**
 * Điểm móc cho các module khác: gọi khi có cuộc gọi mới, tin nhắn đến, trường đổi, điểm AI đổi.
 * Không bao giờ ném lỗi ra ngoài.
 */
export async function fireEvent(
  workspaceId: string,
  cfg: WorkspaceConfig,
  ev:
    | { kind: "call_logged"; record: DbRecord; outcome: string }
    | { kind: "message_received"; record: DbRecord; channel?: string; text?: string }
    | { kind: "field_changed"; record: DbRecord; field: string; value: FieldValue; prev?: FieldValue }
    | { kind: "score_above"; record: DbRecord; score?: number; prevScore?: number },
) {
  try {
    return await runRules(workspaceId, cfg, ev);
  } catch (e) {
    console.error("[automation] fireEvent", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Tiện cho PATCH record: so trước/sau rồi phát field_changed cho từng trường đổi và score_above khi điểm vừa vượt ngưỡng. */
export async function fireRecordUpdate(workspaceId: string, cfg: WorkspaceConfig, before: DbRecord, after: DbRecord) {
  const a = dataOf(before);
  const b = dataOf(after);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k.startsWith("_") || String(a[k] ?? "") === String(b[k] ?? "")) continue;
    await fireEvent(workspaceId, cfg, { kind: "field_changed", record: after, field: k, value: b[k] ?? "", prev: a[k] });
  }
  if (after.score !== before.score) await fireEvent(workspaceId, cfg, { kind: "score_above", record: after, score: after.score, prevScore: before.score });
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Job: luật "đến ngày" — trường ngày = hôm nay + N ngày. Mỗi luật chạy tối đa một lần mỗi ngày. Ghép vào src/lib/jobs.ts. */
export async function tickDateAutomations(now = new Date()): Promise<void> {
  const rows = await db.automation.findMany({ where: { enabled: true, triggerType: "date_arrived" } });
  const today = ymd(now);
  const cfgs = new Map<string, WorkspaceConfig | null>();
  for (const row of rows) {
    const rule = ruleOf(row);
    if (rule.lastRun === today || !rule.trigger.field) continue;
    if (!cfgs.has(row.workspaceId)) {
      const c = await db.workspaceConfig.findFirst({ where: { workspaceId: row.workspaceId, isActive: true } });
      cfgs.set(row.workspaceId, c ? parseJson<WorkspaceConfig | null>(c.configJson, null) : null);
    }
    const cfg = cfgs.get(row.workspaceId);
    // Đánh dấu đã chạy hôm nay trước để lỗi giữa chừng không làm chạy lặp.
    await db.automation.update({ where: { id: row.id }, data: { triggerValue: rowOf(rule, today).triggerValue } });
    if (!cfg) continue;
    const target = new Date(now);
    target.setDate(target.getDate() + (rule.trigger.days ?? 0));
    const day = ymd(target);
    const field = rule.trigger.field.replace(/^f:/, "");
    const recs = await db.record.findMany({ where: { workspaceId: row.workspaceId, objectKey: rule.trigger.object, dataJson: { contains: day } } });
    for (const rec of recs) {
      if (!String(dataOf(rec)[field] ?? "").startsWith(day)) continue;
      try {
        await execute(row, rule, { workspaceId: row.workspaceId, cfg, depth: 0, kind: "date_arrived" }, { kind: "date_arrived", record: rec });
      } catch (e) {
        console.error("[automation] date", row.id, e instanceof Error ? e.message : e);
      }
    }
  }
}

/** 20 lần chạy gần nhất của một luật (lưu trong AgentLog, agent "Tự động hoá", message bắt đầu bằng [tên luật]). */
export async function ruleHistory(workspaceId: string, name: string, take = 20) {
  return db.agentLog.findMany({ where: { workspaceId, agent: AUTOMATION_AGENT, message: { startsWith: `[${name}]` } }, orderBy: { createdAt: "desc" }, take });
}
