import type { Automation, Record as DbRecord } from "@prisma/client";
import { db, parseJson } from "./db";
import { NUMERIC_TYPES, getObject, type WorkspaceConfig } from "./config/schema";
import { notify, userIdByName } from "./notify";
import { vnd } from "./format";
import { channelReady, sendMessage } from "./marketing/messaging";
import { contactInfo } from "./marketing/store";
import { enrollRecord, onSequenceEvent } from "./marketing/sequences";
import { getSettings } from "./settings";
import { getPref, setPref } from "./prefs";
import { issueVoucher } from "./voucher/service";
import { sendSurvey } from "./survey/service";
import { teamMembers } from "./perf/teams";
import { isAnniversaryToday } from "./voucher/occasions";
import { scoreContact, type FieldValue } from "./records";
import { CHANNEL_LABEL, addTag, clampScore, idleDue, pickAutoChannel, ruleOf, rowOf, sentenceText, territoryOwner, type Action, type AutoChannel, type Condition, type Rule, type Trigger, type TriggerType } from "@/app/w/automations/rules";

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
  /** email_engaged: tổng số lần mở/nhấp của khách tới thời điểm này (để chạy "mở email lần thứ N"). */
  count?: number;
};

const dataOf = (r: DbRecord) => parseJson<Record<string, FieldValue>>(r.dataJson, {});
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Điền biến {title}, {owner}, {status}, {amount}, {phone}, {email}, {score}, {key trường} vào nội dung. */
export function fillVars(text: string, r: DbRecord, cfg: WorkspaceConfig, extra?: Record<string, string>) {
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
    voucher: "",
    ...extra,
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
    case "email_engaged": {
      const n = t.threshold ?? 0;
      return (!t.value || lower(t.value) === lower(ev.value)) && (n <= 1 || ev.count === n);
    }
    case "survey_answered":
      return !t.value || t.value === "any" || lower(t.value) === lower(ev.value);
    case "form_submitted":
    case "rfm_changed":
    case "voucher_used":
      return !t.value || lower(t.value) === lower(ev.value);
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
type RunCtx = { workspaceId: string; cfg: WorkspaceConfig; depth: number; ruleName: string; kind: TriggerType; ruleId?: string; vars?: Record<string, string> };

/** Kênh tự chọn: ZNS → Zalo OA → SMS → Email, kênh nào đã cấu hình và khách có thông tin liên hệ. */
async function autoChannel(workspaceId: string, cfg: WorkspaceConfig, rec: DbRecord): Promise<AutoChannel | null> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return null;
  const s = getSettings(ws);
  const info = await contactInfo(workspaceId, cfg, rec);
  return pickAutoChannel((ch) => channelReady(s, ch) === null, info);
}

/** Xoay vòng trong một nhóm: con trỏ lưu ở Pref "assignCursor" theo id nhóm. */
async function nextInTeam(workspaceId: string, teamId: string) {
  const members = (await teamMembers(workspaceId, teamId)).filter(Boolean);
  if (!members.length) return "";
  const cur = await getPref<Record<string, number>>(workspaceId, "assignCursor", {});
  const i = (cur[teamId] ?? 0) % members.length;
  await setPref(workspaceId, "assignCursor", { ...cur, [teamId]: i + 1 });
  return members[i];
}

async function teamOf(workspaceId: string, cfg: WorkspaceConfig) {
  const members = await db.membership.findMany({ where: { workspaceId }, select: { user: { select: { name: true } } } });
  const team = cfg.team.length ? cfg.team : members.map((m) => m.user.name);
  return team.filter(Boolean);
}

async function runAction(a: Action, rec: DbRecord, x: RunCtx): Promise<{ record: DbRecord; note: string }> {
  const { workspaceId, cfg } = x;
  const obj = getObject(cfg, rec.objectKey);
  const href = `/w/b/${rec.objectKey}?open=${rec.id}`;
  const fill = (s?: string) => fillVars(s ?? "", rec, cfg, x.vars);
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
      else if (a.mode === "team") {
        if (!a.teamId) throw new Error("Chưa chọn nhóm để chia");
        owner = await nextInTeam(workspaceId, a.teamId);
        if (!owner) throw new Error("Nhóm chưa có thành viên");
      } else if (a.mode === "territory") {
        const key = a.field?.replace(/^f:/, "") ?? "";
        owner = territoryOwner(a.text ?? "", dataOf(rec)[key]);
        if (!owner) return { record: rec, note: `không có vùng khớp “${String(dataOf(rec)[key] ?? "")}”` };
      } else if (a.mode === "least_busy" && team.length) {
        const [tasks, owned] = await Promise.all([
          db.task.groupBy({ by: ["assignee"], where: { workspaceId, done: false, assignee: { in: team } }, _count: true }),
          db.record.groupBy({ by: ["ownerName"], where: { workspaceId, objectKey: rec.objectKey, ownerName: { in: team } }, _count: true }),
        ]);
        const load = (n: string) => (tasks.find((t) => t.assignee === n)?._count ?? 0) * 1000 + (owned.find((o) => o.ownerName === n)?._count ?? 0);
        owner = [...team].sort((p, q) => load(p) - load(q))[0];
      } else if (team.length) {
        // Xoay vòng bằng con trỏ lưu riêng theo bảng (đếm số mục thì lặp lại cùng một người khi có mục bị xoá/gộp).
        const key = `rr:${rec.objectKey}`;
        const cur = await getPref<Record<string, number>>(workspaceId, "assignCursor", {});
        const i = (((cur[key] ?? 0) % team.length) + team.length) % team.length;
        await setPref(workspaceId, "assignCursor", { ...cur, [key]: i + 1 });
        owner = team[i];
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
      const value: FieldValue = NUMERIC_TYPES.includes(def.type) ? Number(raw) || 0 : raw;
      const data = dataOf(rec);
      const prev = data[key];
      if (prev === value) return { record: rec, note: "giá trị đã đúng" };
      const record = await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify({ ...data, [key]: value }) } });
      await log(`Tự động cập nhật ${def.label}: “${value}”`);
      await nested(x, { kind: "field_changed", record, field: key, prev, value });
      return { record, note: `cập nhật ${def.label}` };
    }
    case "send_message": {
      // Tin có mã voucher mà bước tặng voucher trước đó không phát được mã: không gửi tin thiếu mã cho khách.
      if ((a.text ?? "").includes("{voucher}") && !x.vars?.voucher) throw new Error("Không có mã voucher để gửi (bước tặng voucher chưa phát được mã)");
      let channel = a.channel ?? "zalo";
      if (channel === "auto") {
        const picked = await autoChannel(workspaceId, cfg, rec);
        if (!picked) {
          await log("Bỏ qua tin tự động: chưa có kênh nào vừa cấu hình vừa có thông tin liên hệ của khách");
          return { record: rec, note: "bỏ qua: không có kênh phù hợp" };
        }
        channel = picked;
      }
      const res = await sendMessage(workspaceId, { channel, recordId: rec.id, body: fill(a.text), subject: a.subject ? fill(a.subject) : undefined });
      if (!res.ok && !res.skipped) throw new Error(res.error || "Gửi tin không thành công");
      const via = a.channel === "auto" ? `${CHANNEL_LABEL[channel]} (tự chọn)` : channel.toUpperCase();
      await log(`Tự động gửi ${via}${res.skipped ? " (bỏ qua: " + (res.error || "không đủ điều kiện") + ")" : ""}: ${fill(a.text).slice(0, 160)}`);
      return { record: rec, note: res.skipped ? `bỏ qua gửi ${via}` : `gửi ${via}` };
    }
    case "issue_voucher": {
      if (!a.campaignId) throw new Error("Chưa chọn chiến dịch voucher");
      let send: "" | AutoChannel = a.channel && a.channel !== "auto" ? a.channel : "";
      if (a.channel === "auto") send = (await autoChannel(workspaceId, cfg, rec)) ?? "";
      const v = await issueVoucher(workspaceId, { campaignId: a.campaignId, recordId: rec.id, reason: `Tự động hoá: ${x.ruleName}`.slice(0, 120), by: AUTOMATION_AGENT, send });
      if (!v) throw new Error("Không phát được voucher (chiến dịch tắt, hết lượt hoặc khách đã nhận)");
      x.vars = { ...x.vars, voucher: v.code };
      await log(`Tự động tặng voucher ${v.code}${send ? ` qua ${CHANNEL_LABEL[send]}` : ""}`);
      return { record: rec, note: `tặng voucher ${v.code}${send ? ` (${send})` : ""}` };
    }
    case "send_survey": {
      if (!a.surveyId) throw new Error("Chưa chọn khảo sát");
      let channel: "link" | AutoChannel = a.channel && a.channel !== "auto" ? a.channel : "link";
      if (a.channel === "auto") channel = (await autoChannel(workspaceId, cfg, rec)) ?? "link";
      const res = await sendSurvey(workspaceId, { surveyId: a.surveyId, recordId: rec.id, channel });
      if (!res.ok) throw new Error(res.error || "Không gửi được khảo sát");
      await log(`Tự động gửi khảo sát${channel === "link" ? " (tạo link)" : ` qua ${CHANNEL_LABEL[channel]}`}${res.url ? `: ${res.url}` : ""}`);
      return { record: rec, note: `gửi khảo sát (${channel})` };
    }
    case "add_tag": {
      const key = a.field?.replace(/^f:/, "") ?? "";
      const def = obj?.fields.find((f) => f.key === key);
      if (!def) throw new Error("Trường thẻ không có trong bảng này");
      const tag = fill(a.value).trim();
      if (!tag) throw new Error("Chưa nhập thẻ");
      const data = dataOf(rec);
      const prev = data[key];
      const value = def.type === "tags" ? addTag(prev, tag) : tag;
      if (String(prev ?? "") === value) return { record: rec, note: "đã có thẻ" };
      const record = await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify({ ...data, [key]: value }) } });
      await log(`Tự động gắn thẻ “${tag}” (${def.label})`);
      await nested(x, { kind: "field_changed", record, field: key, prev, value });
      return { record, note: `gắn thẻ ${tag}` };
    }
    case "add_score": {
      const score = clampScore(rec.score + (a.points ?? 0));
      if (score === rec.score) return { record: rec, note: "điểm giữ nguyên" };
      const record = await db.record.update({ where: { id: rec.id }, data: { score } });
      await log(`Tự động ${(a.points ?? 0) >= 0 ? "cộng" : "trừ"} ${Math.abs(a.points ?? 0)} điểm: ${rec.score} → ${score}`);
      await nested(x, { kind: "score_above", record, score, prevScore: rec.score });
      return { record, note: `điểm ${rec.score} → ${score}` };
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
  // Mục đã vào thùng rác thì không chạy luật (job theo ngày/không tương tác, sự kiện đến muộn).
  if (!rec || rec.deletedAt) return false;
  if (!rule.conditions.every((c) => checkCondition(c, rec!, x.cfg))) return false;
  const name = ruleName(rule, x.cfg);
  const ctx: RunCtx = { ...x, ruleName: name, ruleId: row.id, vars: {} };
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
    | { kind: "score_above"; record: DbRecord; score?: number; prevScore?: number }
    // Tín hiệu từ các module khác. value: email_engaged "open"|"click"; form_submitted mã form/landing;
    // survey_answered "promoter"|"passive"|"detractor"; rfm_changed key nhóm RFM; voucher_used mã chiến dịch.
    | { kind: "email_engaged" | "form_submitted" | "survey_answered" | "rfm_changed" | "voucher_used"; record: DbRecord; value?: string; count?: number },
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
    const recs = await db.record.findMany({ where: { workspaceId: row.workspaceId, objectKey: rule.trigger.object, deletedAt: null, dataJson: { contains: day } } });
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

async function activeCfg(workspaceId: string) {
  const c = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  return c ? parseJson<WorkspaceConfig | null>(c.configJson, null) : null;
}

/**
 * Phát sự kiện khi chỉ có id khách (route công khai, theo dõi email): tự nạp record và cấu hình.
 * Không bao giờ ném lỗi.
 */
export async function fireRecordEvent(recordId: string, ev: { kind: "email_engaged" | "form_submitted" | "survey_answered" | "rfm_changed" | "voucher_used"; value?: string; count?: number }) {
  try {
    const record = await db.record.findFirst({ where: { id: recordId, deletedAt: null } });
    if (!record) return 0;
    const cfg = await activeCfg(record.workspaceId);
    if (!cfg) return 0;
    return await fireEvent(record.workspaceId, cfg, { ...ev, record });
  } catch (e) {
    console.error("[automation] fireRecordEvent", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Đọc luật theo ngày: bỏ luật đã chạy hôm nay, đánh dấu trước khi chạy để lỗi giữa chừng không làm chạy lặp. */
async function dailyRules(type: TriggerType, today: string) {
  const rows = await db.automation.findMany({ where: { enabled: true, triggerType: type } });
  const out: { row: Automation; rule: ReturnType<typeof ruleOf>; cfg: WorkspaceConfig }[] = [];
  const cfgs = new Map<string, WorkspaceConfig | null>();
  for (const row of rows) {
    const rule = ruleOf(row);
    if (rule.lastRun === today) continue;
    if (!cfgs.has(row.workspaceId)) cfgs.set(row.workspaceId, await activeCfg(row.workspaceId));
    await db.automation.update({ where: { id: row.id }, data: { triggerValue: rowOf(rule, today).triggerValue } });
    const cfg = cfgs.get(row.workspaceId);
    if (cfg) out.push({ row, rule, cfg });
  }
  return out;
}

/**
 * Job (mỗi giờ, tự chạy một lần mỗi ngày cho từng luật): ngày kỷ niệm hằng năm — so ngày-tháng của trường ngày
 * (sinh nhật, ngày cưới, ngày mua đầu tiên…) với hôm nay + N ngày, không quan tâm năm. Ghép vào src/lib/jobs.ts.
 */
export async function tickAnniversaryAutomations(now = new Date()): Promise<number> {
  let ran = 0;
  for (const { row, rule, cfg } of await dailyRules("anniversary", ymd(now))) {
    const field = rule.trigger.field?.replace(/^f:/, "");
    if (!field) continue;
    const recs = await db.record.findMany({ where: { workspaceId: row.workspaceId, objectKey: rule.trigger.object, deletedAt: null } });
    for (const rec of recs) {
      const v = dataOf(rec)[field];
      if (!v || !isAnniversaryToday(String(v), now, rule.trigger.days ?? 0)) continue;
      try {
        if (await execute(row, rule, { workspaceId: row.workspaceId, cfg, depth: 0, kind: "anniversary" }, { kind: "anniversary", record: rec })) ran++;
      } catch (e) {
        console.error("[automation] anniversary", row.id, e instanceof Error ? e.message : e);
      }
    }
  }
  return ran;
}

const chunks = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/** Hoạt động tính là "có tương tác" (bỏ ghi chú hệ thống như đổi trạng thái, tự động giao người). */
const INTERACTION_KINDS = ["update", "call", "message", "email_open", "email_click", "ai"];

/**
 * Lần tương tác gần nhất của từng mục = mới nhất trong: ngày tạo mục, hoạt động không phải hệ thống
 * (cập nhật, ghi chú cuộc gọi, tin đã gửi, mở/nhấp email), cuộc gọi, hội thoại Hộp thư, đơn hàng.
 */
export async function lastInteractions(workspaceId: string, recs: { id: string; createdAt: Date }[]) {
  const last = new Map(recs.map((r) => [r.id, r.createdAt]));
  const bump = (id: string | null | undefined, d: Date | null | undefined) => {
    if (!id || !d) return;
    const cur = last.get(id);
    if (cur && d > cur) last.set(id, d);
  };
  for (const ids of chunks(recs.map((r) => r.id))) {
    const [acts, calls, convs, orders, orders2] = await Promise.all([
      db.activity.groupBy({ by: ["recordId"], where: { recordId: { in: ids }, kind: { in: INTERACTION_KINDS } }, _max: { createdAt: true } }),
      db.call.groupBy({ by: ["recordId"], where: { workspaceId, recordId: { in: ids } }, _max: { createdAt: true } }),
      db.conversation.groupBy({ by: ["recordId"], where: { workspaceId, recordId: { in: ids } }, _max: { lastAt: true } }),
      db.order.groupBy({ by: ["recordId"], where: { workspaceId, recordId: { in: ids } }, _max: { createdAt: true } }),
      db.order.groupBy({ by: ["contactId"], where: { workspaceId, contactId: { in: ids } }, _max: { createdAt: true } }),
    ]);
    for (const x of acts) bump(x.recordId, x._max.createdAt);
    for (const x of calls) bump(x.recordId, x._max.createdAt);
    for (const x of convs) bump(x.recordId, x._max.lastAt);
    for (const x of orders) bump(x.recordId, x._max.createdAt);
    for (const x of orders2) bump(x.contactId, x._max.createdAt);
  }
  return last;
}

/**
 * Job (mỗi giờ, mỗi luật chạy một lần mỗi ngày): khách không tương tác N ngày (xem lastInteractions).
 * Cùng một khách không bắn lại trong N ngày: dấu lần chạy lưu ở data._idle_<id luật> (ISO).
 */
export async function tickIdleAutomations(now = new Date()): Promise<number> {
  let ran = 0;
  for (const { row, rule, cfg } of await dailyRules("idle", ymd(now))) {
    const days = Math.max(1, rule.trigger.days ?? 30);
    const mark = `_idle_${row.id}`;
    const since = new Date(now.getTime() - days * 864e5);
    // Mục tạo sau mốc N ngày chắc chắn chưa "im lặng" đủ lâu.
    const recs = await db.record.findMany({ where: { workspaceId: row.workspaceId, objectKey: rule.trigger.object, deletedAt: null, createdAt: { lte: since } } });
    const last = await lastInteractions(row.workspaceId, recs);
    for (const rec of recs) {
      const data = dataOf(rec);
      const fired = typeof data[mark] === "string" ? new Date(String(data[mark])) : null;
      if (!idleDue(last.get(rec.id) ?? rec.createdAt, fired && !isNaN(fired.getTime()) ? fired : null, days, now)) continue;
      // Chỉ đánh dấu mục thật sự khớp điều kiện của luật; giữ nguyên updatedAt (dấu nội bộ, không phải người dùng sửa).
      if (!rule.conditions.every((c) => checkCondition(c, rec, cfg))) continue;
      await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify({ ...data, [mark]: now.toISOString() }), updatedAt: rec.updatedAt } });
      try {
        if (await execute(row, rule, { workspaceId: row.workspaceId, cfg, depth: 0, kind: "idle" }, { kind: "idle", record: rec })) ran++;
      } catch (e) {
        console.error("[automation] idle", row.id, e instanceof Error ? e.message : e);
      }
    }
  }
  return ran;
}

/** 20 lần chạy gần nhất của một luật (lưu trong AgentLog, agent "Tự động hoá", message bắt đầu bằng [tên luật]). */
export async function ruleHistory(workspaceId: string, name: string, take = 20) {
  return db.agentLog.findMany({ where: { workspaceId, agent: AUTOMATION_AGENT, message: { startsWith: `[${name}]` } }, orderBy: { createdAt: "desc" }, take });
}
