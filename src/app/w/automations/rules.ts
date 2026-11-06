// Định nghĩa luật tự động hoá dùng chung cho trình duyệt và server (không import db).
import { z } from "zod";
import { getObject, type AutomationDef, type WorkspaceConfig } from "@/lib/config/schema";
import { OUTCOMES } from "@/lib/calls-shared";
import { RFM_LABEL } from "@/lib/c360/rfm";

export const TRIGGER_TYPES = ["record_created", "status_changed", "field_changed", "score_above", "call_logged", "message_received", "date_arrived", "anniversary", "idle", "email_engaged", "form_submitted", "survey_answered", "rfm_changed", "voucher_used"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const Trigger = z.object({
  type: z.enum(TRIGGER_TYPES),
  object: z.string().min(1).max(40),
  /** status_changed: trạng thái mới (rỗng = bất kỳ). */
  to: z.string().max(80).optional(),
  /** status_changed: trạng thái cũ (tuỳ chọn). */
  from: z.string().max(80).optional(),
  /** field_changed / date_arrived: key trường. */
  field: z.string().max(80).optional(),
  /** field_changed: giá trị mới; call_logged: kết quả cuộc gọi; message_received: kênh. Rỗng = bất kỳ. */
  value: z.string().max(200).optional(),
  /** score_above: ngưỡng điểm; email_engaged: chạy khi khách mở/nhấp đủ N lần (tính mọi đợt gửi). */
  threshold: z.number().min(0).max(100).optional(),
  /** date_arrived: trường ngày = hôm nay + N ngày (N âm = đã qua N ngày); anniversary: trước N ngày; idle: số ngày không tương tác. */
  days: z.number().int().min(-365).max(365).optional(),
});
export type Trigger = z.infer<typeof Trigger>;

export const CONDITION_OPS = ["eq", "neq", "gt", "lt", "contains", "empty", "not_empty"] as const;
export const Condition = z.object({
  /** status | owner | channel | source | amount | score | title | f:<key trường> */
  field: z.string().min(1).max(80),
  op: z.enum(CONDITION_OPS),
  value: z.string().max(200).optional(),
});
export type Condition = z.infer<typeof Condition>;

export const ACTION_TYPES = ["create_task", "notify", "assign_owner", "set_status", "set_field", "send_message", "enroll_sequence", "webhook", "add_activity", "create_record", "issue_voucher", "send_survey", "add_tag", "add_score"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const Action = z.object({
  type: z.enum(ACTION_TYPES),
  /** Nội dung: việc, thông báo, tin nhắn, ghi chú, tên mục mới. Có biến {title}, {owner}, {status}, {amount}, {phone}... */
  text: z.string().max(2000).optional(),
  /** create_task: hạn sau N ngày. */
  days: z.number().int().min(0).max(365).optional(),
  /** create_task: "owner" | tên người; notify: "owner" | "all" | "user"; assign_owner: "round_robin" | "user" | "least_busy" | "team" | "territory". */
  mode: z.string().max(40).optional(),
  /** Tên người cụ thể (giao việc, thông báo, phân công). */
  user: z.string().max(80).optional(),
  /** set_status: key trạng thái; set_field: giá trị mới; add_tag: thẻ cần gắn. */
  value: z.string().max(500).optional(),
  /** set_field / add_tag: key trường; assign_owner "territory": trường khu vực (tỉnh/thành…). */
  field: z.string().max(80).optional(),
  /** send_message / issue_voucher / send_survey: zalo | zns | sms | email | auto (ZNS→Zalo→SMS→Email). Trống = không gửi (voucher) / chỉ tạo link (khảo sát). */
  channel: z.enum(["zalo", "zns", "sms", "email", "auto"]).optional(),
  subject: z.string().max(200).optional(),
  sequenceId: z.string().max(60).optional(),
  url: z.string().max(500).optional(),
  /** create_record: bảng đích (mặc định deals). */
  object: z.string().max(40).optional(),
  /** issue_voucher: chiến dịch voucher. */
  campaignId: z.string().max(60).optional(),
  /** send_survey: khảo sát. */
  surveyId: z.string().max(60).optional(),
  /** assign_owner "team": phòng ban/nhóm để chia xoay vòng. Vùng (territory) ghi trong text: mỗi dòng "Hà Nội, HN=Lan", "*=Minh" là mặc định. */
  teamId: z.string().max(60).optional(),
  /** add_score: cộng/trừ điểm (giữ trong 0–100). */
  points: z.number().int().min(-100).max(100).optional(),
});
export type Action = z.infer<typeof Action>;

export const Rule = z.object({
  name: z.string().max(120),
  trigger: Trigger,
  conditions: z.array(Condition).max(10),
  actions: z.array(Action).min(1).max(10),
});
export type Rule = z.infer<typeof Rule>;

/** Dạng một dòng Automation trong DB (đủ để đọc luật cũ và mới). */
export type AutomationRow = { id?: string; name: string; triggerType: string; triggerObject: string; triggerValue: string; actionType: string; actionValue: string; conditionsJson: string; actionsJson: string };

const parse = <T,>(s: string, fb: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fb;
  } catch {
    return fb;
  }
};

/** Luật cũ (một trigger, một hành động trong các cột cũ) → luật dạng mới. */
export function legacyActions(actionType: string, actionValue: string): Action[] {
  if (actionType === "create_task") {
    const [text, days] = actionValue.split("|");
    return [{ type: "create_task", text: text ?? "", days: Number(days) || 0 }];
  }
  if (actionType === "notify") return [{ type: "notify", mode: "owner", text: actionValue }];
  if (actionType === "assign_owner") return [{ type: "assign_owner", mode: "round_robin", value: "only_empty" }];
  return [];
}

/** Đọc một dòng Automation thành luật đầy đủ. Luật cũ có actionsJson rỗng vẫn đọc được như trước. */
export function ruleOf(row: AutomationRow): Rule & { legacy: boolean; lastRun?: string } {
  const actions = parse<Action[]>(row.actionsJson, []);
  const legacy = !Array.isArray(actions) || actions.length === 0;
  let trigger: Trigger & { lastRun?: string } = { type: (TRIGGER_TYPES as readonly string[]).includes(row.triggerType) ? (row.triggerType as TriggerType) : "record_created", object: row.triggerObject };
  if (row.triggerValue.startsWith("{")) trigger = { ...parse<Partial<Trigger>>(row.triggerValue, {}), ...trigger };
  else if (row.triggerValue) trigger.to = row.triggerValue;
  const { lastRun, ...t } = trigger;
  return {
    name: row.name,
    trigger: t,
    conditions: legacy ? [] : parse<Condition[]>(row.conditionsJson, []),
    actions: legacy ? legacyActions(row.actionType, row.actionValue) : actions,
    legacy,
    lastRun,
  };
}

/** Luật → các cột DB. Giữ triggerValue là key trạng thái khi chỉ có "to" để luật cũ và mới cùng đọc được. */
export function rowOf(rule: Rule, lastRun?: string) {
  const { type, object, ...rest } = rule.trigger;
  const extra = Object.fromEntries(Object.entries({ ...rest, lastRun }).filter(([, v]) => v !== undefined && v !== ""));
  const simple = Object.keys(extra).length === 0 || (Object.keys(extra).length === 1 && "to" in extra);
  const first = rule.actions[0];
  return {
    name: rule.name.trim() || "Luật mới",
    triggerType: type,
    triggerObject: object,
    triggerValue: simple ? String(extra.to ?? "") : JSON.stringify(extra),
    // Cột cũ giữ hành động đầu tiên để các màn hình cũ vẫn hiểu được.
    actionType: first?.type ?? "notify",
    actionValue: first?.type === "create_task" ? `${first.text ?? ""}|${first.days ?? 0}` : first?.text ?? "",
    conditionsJson: JSON.stringify(rule.conditions),
    actionsJson: JSON.stringify(rule.actions),
  };
}

// ---------- Nhãn tiếng Việt ----------
export const TRIGGER_LABEL: Record<TriggerType, string> = {
  record_created: "có mục mới",
  status_changed: "trạng thái thay đổi",
  field_changed: "một trường thay đổi",
  score_above: "điểm AI vượt ngưỡng",
  call_logged: "ghi nhận cuộc gọi",
  message_received: "khách nhắn Hộp thư",
  date_arrived: "đến ngày của trường ngày",
  anniversary: "đến ngày kỷ niệm hằng năm (sinh nhật…)",
  idle: "khách không tương tác N ngày",
  email_engaged: "khách mở/nhấp email",
  form_submitted: "khách điền form",
  survey_answered: "khách trả lời khảo sát",
  rfm_changed: "khách sang nhóm RFM mới",
  voucher_used: "khách dùng voucher",
};
export const OP_LABEL: Record<(typeof CONDITION_OPS)[number], string> = { eq: "là", neq: "không phải", gt: "lớn hơn", lt: "nhỏ hơn", contains: "chứa", empty: "đang trống", not_empty: "có giá trị" };
export const ACTION_LABEL: Record<ActionType, string> = {
  create_task: "tạo việc",
  notify: "gửi thông báo",
  assign_owner: "giao người phụ trách",
  set_status: "đổi trạng thái",
  set_field: "cập nhật trường",
  send_message: "gửi tin nhắn",
  enroll_sequence: "đưa vào kịch bản chăm sóc",
  webhook: "gọi webhook",
  add_activity: "ghi chú vào lịch sử",
  create_record: "tạo mục mới",
  issue_voucher: "tặng voucher",
  send_survey: "gửi khảo sát",
  add_tag: "gắn thẻ",
  add_score: "cộng/trừ điểm",
};
export const CHANNEL_LABEL: Record<string, string> = { zalo: "Zalo OA", zns: "Zalo ZNS", sms: "SMS", email: "Email", auto: "Tự chọn kênh (ZNS → Zalo → SMS → Email)" };
export const INBOX_CHANNEL: Record<string, string> = { zalo: "Zalo OA", messenger: "Messenger" };
export const VARIABLES = ["{title}", "{owner}", "{status}", "{amount}", "{phone}", "{email}", "{voucher}"];
/** Nhóm trả lời NPS: 9–10 ủng hộ, 7–8 trung lập, 0–6 không hài lòng. */
export const SURVEY_GROUP: Record<string, string> = { promoter: "ủng hộ (9–10 điểm)", passive: "trung lập (7–8 điểm)", detractor: "không hài lòng (0–6 điểm)" };
export const ENGAGE_LABEL: Record<string, string> = { open: "mở", click: "nhấp link trong" };
/** Nhóm RFM (key → nhãn) lấy từ module Customer 360. */
export const RFM_SUGGEST: Record<string, string> = RFM_LABEL;
export type Lists = { sequences?: { id: string; name: string }[]; campaigns?: { id: string; name: string }[]; surveys?: { id: string; name: string }[]; teams?: { id: string; name: string }[]; forms?: { id: string; name: string }[]; rfm?: Record<string, string> };

// ---------- Phần thuần dùng chung (có kiểm thử) ----------
const foldVi = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

/** "Hà Nội, HN=Lan" mỗi dòng → bảng khu vực → người. Dòng "*=Minh" là người mặc định. Bỏ dòng sai. */
export function parseTerritory(text: string): { rules: { keys: string[]; owner: string }[]; fallback: string } {
  const rules: { keys: string[]; owner: string }[] = [];
  let fallback = "";
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const i = line.lastIndexOf("=");
    if (i < 1) continue;
    const owner = line.slice(i + 1).trim();
    const keys = line.slice(0, i).split(/[,;|]/).map(foldVi).filter(Boolean);
    if (!owner || !keys.length) continue;
    if (keys.includes("*")) fallback = owner;
    else rules.push({ keys, owner });
  }
  return { rules, fallback };
}

/** Người phụ trách theo khu vực: khớp nguyên văn (không dấu), rồi khớp "chứa" (vd. "TP. Hà Nội" chứa "ha noi"). */
export function territoryOwner(text: string, value: unknown): string {
  const { rules, fallback } = parseTerritory(text);
  const v = foldVi(String(value ?? ""));
  if (!v) return fallback;
  return rules.find((r) => r.keys.includes(v))?.owner ?? rules.find((r) => r.keys.some((k) => k.length >= 2 && v.includes(k)))?.owner ?? fallback;
}

export const AUTO_CHANNELS = ["zns", "zalo", "sms", "email"] as const;
export type AutoChannel = (typeof AUTO_CHANNELS)[number];
/** Kênh đầu tiên vừa đã cấu hình vừa có thông tin liên hệ của khách. null = không kênh nào gửi được. */
export function pickAutoChannel(ready: (ch: AutoChannel) => boolean, info: { phone?: string; email?: string; zaloUid?: string }): AutoChannel | null {
  const has: Record<AutoChannel, boolean> = { zns: !!info.phone?.trim(), zalo: !!info.zaloUid?.trim(), sms: !!info.phone?.trim(), email: !!info.email?.trim() };
  return AUTO_CHANNELS.find((ch) => has[ch] && ready(ch)) ?? null;
}

/** Đã "im lặng" đủ N ngày và chưa báo trong N ngày gần nhất (không bắn lại liên tục cho cùng một khách). */
export function idleDue(lastInteraction: Date, lastFired: Date | null, days: number, now = new Date()) {
  const n = Math.max(1, days) * 864e5;
  return now.getTime() - lastInteraction.getTime() >= n && (!lastFired || now.getTime() - lastFired.getTime() >= n);
}

/** Thêm một thẻ vào chuỗi thẻ "a, b" (không trùng, không phân biệt hoa thường). */
export function addTag(current: unknown, tag: string) {
  const list = String(current ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const t = tag.trim();
  if (!t || list.some((x) => x.toLowerCase() === t.toLowerCase())) return list.join(", ");
  return [...list, t].join(", ");
}
export const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Trường có thể dùng trong điều kiện cho một bảng. */
export function conditionFields(cfg: WorkspaceConfig, objectKey: string) {
  const obj = getObject(cfg, objectKey);
  return [
    { key: "status", label: obj?.statusLabel ?? "Trạng thái" },
    { key: "owner", label: "Người phụ trách" },
    { key: "channel", label: "Kênh" },
    { key: "source", label: "Nguồn khách" },
    { key: "amount", label: obj?.amountLabel || "Giá trị" },
    { key: "score", label: "Điểm" },
    { key: "title", label: "Tên" },
    ...(obj?.fields ?? []).filter((f) => f.type !== "formula").map((f) => ({ key: `f:${f.key}`, label: f.label })),
  ];
}

export type Part = { text: string; chip?: string };

/** Biến luật thành câu "Khi … và … thì … và …". chip = định danh phần để bấm sửa. */
export function sentence(rule: Rule, cfg: WorkspaceConfig, extra?: Lists): { trigger: Part[]; conditions: Part[][]; actions: Part[][] } {
  const t = rule.trigger;
  const obj = getObject(cfg, t.object);
  const item = obj?.itemLabel.toLowerCase() ?? t.object;
  const st = (k?: string) => obj?.statuses.find((s) => s.key === k)?.label ?? k ?? "";
  const fieldLabel = (k?: string) => obj?.fields.find((f) => f.key === k)?.label ?? k ?? "trường";
  let trigger: Part[];
  switch (t.type) {
    case "record_created":
      trigger = [{ text: `có ${item} mới` }];
      break;
    case "status_changed":
      trigger = [{ text: `${(obj?.statusLabel ?? "trạng thái").toLowerCase()} của ${item}` }, { text: t.from ? ` đổi từ ${st(t.from)}` : "" }, { text: ` sang ${t.to ? st(t.to) : "bất kỳ"}` }];
      break;
    case "field_changed":
      trigger = [{ text: `${fieldLabel(t.field)} của ${item} đổi${t.value ? ` thành “${t.value}”` : ""}` }];
      break;
    case "score_above":
      trigger = [{ text: `điểm của ${item} vượt ${t.threshold ?? 70}` }];
      break;
    case "call_logged":
      trigger = [{ text: `ghi nhận cuộc gọi với ${item}${t.value ? ` có kết quả “${OUTCOMES.find((o) => o.key === t.value)?.label ?? t.value}”` : ""}` }];
      break;
    case "message_received":
      trigger = [{ text: `${item} nhắn tới Hộp thư${t.value ? ` qua ${INBOX_CHANNEL[t.value] ?? t.value}` : ""}` }];
      break;
    case "date_arrived": {
      const d = t.days ?? 0;
      trigger = [{ text: `${d === 0 ? "đến" : d > 0 ? `còn ${d} ngày tới` : `đã qua ${-d} ngày sau`} ${fieldLabel(t.field)} của ${item}` }];
      break;
    }
    case "anniversary": {
      const d = t.days ?? 0;
      trigger = [{ text: `${d > 0 ? `còn ${d} ngày nữa đến` : "đến"} ${t.field ? fieldLabel(t.field) : "ngày kỷ niệm (chưa chọn trường)"} của ${item} (hằng năm)` }];
      break;
    }
    case "idle":
      trigger = [{ text: `${item} ${t.days ?? 30} ngày không có tương tác nào` }];
      break;
    case "email_engaged": {
      const verb = t.value ? ENGAGE_LABEL[t.value] ?? t.value : "mở hoặc nhấp";
      const n = t.threshold ?? 0;
      trigger = [{ text: `${item} ${verb} email${n > 1 ? ` lần thứ ${n}` : ""}` }];
      break;
    }
    case "form_submitted": {
      const f = extra?.forms?.find((x) => x.id === t.value)?.name ?? t.value;
      trigger = [{ text: `${item} gửi thông tin qua ${t.value ? `form “${f}”` : "form hoặc landing page bất kỳ"}` }];
      break;
    }
    case "survey_answered":
      trigger = [{ text: `${item} trả lời khảo sát${t.value ? ` và thuộc nhóm ${SURVEY_GROUP[t.value] ?? t.value}` : ""}` }];
      break;
    case "rfm_changed": {
      const g = t.value ? extra?.rfm?.[t.value] ?? RFM_SUGGEST[t.value] ?? t.value : "";
      trigger = [{ text: `${item} chuyển sang nhóm RFM ${g ? `“${g}”` : "mới"}` }];
      break;
    }
    case "voucher_used": {
      const c = t.value ? extra?.campaigns?.find((x) => x.id === t.value)?.name ?? t.value : "";
      trigger = [{ text: `${item} dùng voucher${c ? ` của chiến dịch “${c}”` : ""}` }];
      break;
    }
    default:
      trigger = [{ text: TRIGGER_LABEL[t.type] }];
  }
  const fields = conditionFields(cfg, t.object);
  const conditions = rule.conditions.map((c): Part[] => {
    const f = fields.find((x) => x.key === c.field)?.label ?? c.field;
    const v = c.field === "status" ? st(c.value) : c.value ?? "";
    return [{ text: `${f} ${OP_LABEL[c.op]}${c.op === "empty" || c.op === "not_empty" ? "" : ` “${v}”`}` }];
  });
  const actions = rule.actions.map((a): Part[] => {
    const short = (s?: string, n = 40) => (s && s.length > n ? s.slice(0, n) + "…" : s ?? "");
    switch (a.type) {
      case "create_task":
        return [{ text: `tạo việc “${short(a.text)}”${a.days ? ` hạn ${a.days} ngày` : " hạn hôm nay"}${a.mode && a.mode !== "owner" ? ` giao ${a.user || a.mode}` : ""}` }];
      case "notify":
        return [{ text: `thông báo ${a.mode === "all" ? "cả đội" : a.mode === "user" ? a.user || "một người" : "người phụ trách"}: “${short(a.text)}”` }];
      case "assign_owner":
        return [
          {
            text:
              a.mode === "user"
                ? `giao cho ${a.user || "…"}`
                : a.mode === "least_busy"
                  ? "giao người ít việc nhất"
                  : a.mode === "team"
                    ? `chia xoay vòng trong nhóm “${extra?.teams?.find((x) => x.id === a.teamId)?.name ?? (a.teamId ? "đã chọn" : "…")}”`
                    : a.mode === "territory"
                      ? `giao theo khu vực (${fieldLabel(a.field)}, ${parseTerritory(a.text ?? "").rules.length} vùng)`
                      : "chia người phụ trách xoay vòng",
          },
        ];
      case "set_status":
        return [{ text: `đổi ${(obj?.statusLabel ?? "trạng thái").toLowerCase()} thành ${st(a.value) || "…"}` }];
      case "set_field":
        return [{ text: `đặt ${fieldLabel(a.field)} = “${short(a.value, 24)}”` }];
      case "send_message":
        return [{ text: `gửi ${a.channel === "auto" ? "tin qua kênh phù hợp nhất" : CHANNEL_LABEL[a.channel ?? "zalo"]}: “${short(a.text, 32)}”` }];
      case "issue_voucher": {
        const c = extra?.campaigns?.find((x) => x.id === a.campaignId)?.name ?? (a.campaignId ? "đã chọn" : "…");
        return [{ text: `tặng voucher “${c}”${a.channel ? ` (gửi mã ${a.channel === "auto" ? "qua kênh phù hợp nhất" : `qua ${CHANNEL_LABEL[a.channel]}`})` : ""}` }];
      }
      case "send_survey": {
        const sv = extra?.surveys?.find((x) => x.id === a.surveyId)?.name ?? (a.surveyId ? "đã chọn" : "…");
        return [{ text: `gửi khảo sát “${sv}”${a.channel ? ` ${a.channel === "auto" ? "qua kênh phù hợp" : `qua ${CHANNEL_LABEL[a.channel]}`}` : " (tạo link)"}` }];
      }
      case "add_tag":
        return [{ text: `gắn thẻ “${short(a.value, 24) || "…"}” vào ${fieldLabel(a.field)}` }];
      case "add_score": {
        const p = a.points ?? 0;
        return [{ text: `${p >= 0 ? "cộng" : "trừ"} ${Math.abs(p)} điểm` }];
      }
      case "enroll_sequence":
        return [{ text: `đưa vào kịch bản “${extra?.sequences?.find((s) => s.id === a.sequenceId)?.name ?? (a.sequenceId ? "đã chọn" : "…")}”` }];
      case "webhook":
        return [{ text: `gọi webhook ${short(a.url?.replace(/^https?:\/\//, ""), 30) || "…"}` }];
      case "add_activity":
        return [{ text: `ghi chú “${short(a.text)}”` }];
      case "create_record": {
        const target = getObject(cfg, a.object || "deals");
        return [{ text: `tạo ${target?.itemLabel.toLowerCase() ?? "mục"} mới “${short(a.text, 30) || "{title}"}”` }];
      }
    }
  });
  return { trigger, conditions, actions };
}

/** Câu đầy đủ dạng chữ (dùng cho nhật ký, thông báo). */
export function sentenceText(rule: Rule, cfg: WorkspaceConfig) {
  const s = sentence(rule, cfg);
  const j = (p: Part[]) => p.map((x) => x.text).join("");
  return `Khi ${j(s.trigger)}${s.conditions.map((c) => ` và ${j(c)}`).join("")} thì ${s.actions.map(j).join(" và ")}`;
}

/** Thư viện mẫu: luật gợi ý theo ngành (config.automations) + 10 mẫu chung. */
export function templates(cfg: WorkspaceConfig): { group: string; rule: Rule }[] {
  const deals = getObject(cfg, "deals");
  const won = [...(deals?.statuses ?? [])].reverse().find((s) => s.color === "green")?.key ?? deals?.statuses.at(-1)?.key ?? "";
  const lost = deals?.statuses.find((s) => s.color === "red" || s.color === "berry")?.key ?? "";
  const firstDeal = deals?.statuses[0]?.key ?? "";
  const term = cfg.terminology;
  const fromConfig = cfg.automations.map((a: AutomationDef) => {
    const r = ruleOf({ name: "", triggerType: a.triggerType, triggerObject: a.triggerObject, triggerValue: a.triggerValue, actionType: a.actionType, actionValue: a.actionValue, conditionsJson: "[]", actionsJson: "[]" });
    const rule: Rule = { name: "", trigger: r.trigger, conditions: [], actions: r.actions };
    rule.name = sentenceText(rule, cfg).slice(0, 80);
    return { group: "Gợi ý cho ngành của bạn", rule };
  });
  const g = "Mẫu chung";
  const general: Rule[] = [
    {
      name: `Chào ${term.contact.toLowerCase()} mới và chia người`,
      trigger: { type: "record_created", object: "contacts" },
      conditions: [],
      actions: [
        { type: "assign_owner", mode: "round_robin" },
        { type: "create_task", text: "Gọi chào {title} trong ngày", days: 0, mode: "owner" },
        { type: "notify", mode: "owner", text: "Bạn vừa được giao {title}" },
      ],
    },
    {
      name: "Khách nóng: báo ngay và ưu tiên gọi",
      trigger: { type: "score_above", object: "contacts", threshold: 70 },
      conditions: [],
      actions: [
        { type: "notify", mode: "owner", text: "{title} vừa thành khách nóng (điểm {score})" },
        { type: "create_task", text: "Gọi ngay cho khách nóng {title}", days: 0, mode: "owner" },
      ],
    },
    {
      name: "Lead quảng cáo: gửi Zalo cảm ơn",
      trigger: { type: "record_created", object: "contacts" },
      conditions: [{ field: "channel", op: "eq", value: "ads" }],
      actions: [{ type: "send_message", channel: "zalo", text: "Chào {title}, cảm ơn anh/chị đã quan tâm. Nhân viên {owner} sẽ liên hệ trong ít phút ạ." }],
    },
    {
      name: "Không nghe máy: hẹn gọi lại hôm sau",
      trigger: { type: "call_logged", object: "contacts", value: "no_answer" },
      conditions: [],
      actions: [
        { type: "create_task", text: "Gọi lại {title} (lần trước không nghe máy)", days: 1, mode: "owner" },
        { type: "send_message", channel: "sms", text: "Chào {title}, em vừa gọi nhưng chưa liên lạc được. Anh/chị tiện lúc nào em gọi lại ạ?" },
      ],
    },
    {
      name: "Khách nhắn tin: giao việc phản hồi",
      trigger: { type: "message_received", object: "contacts" },
      conditions: [],
      actions: [
        { type: "notify", mode: "owner", text: "{title} vừa nhắn tin, phản hồi trong 5 phút nhé" },
        { type: "create_task", text: "Phản hồi tin nhắn của {title}", days: 0, mode: "owner" },
      ],
    },
    {
      name: `${term.deal} chốt thành công: cảm ơn và báo cả đội`,
      trigger: { type: "status_changed", object: "deals", to: won },
      conditions: [],
      actions: [
        { type: "notify", mode: "all", text: "🎉 {owner} vừa chốt {title} – {amount}" },
        { type: "send_message", channel: "zns", text: "Cảm ơn {title} đã tin tưởng. Chúng tôi sẽ liên hệ để hướng dẫn bước tiếp theo." },
        { type: "create_task", text: "Xin đánh giá từ {title}", days: 7, mode: "owner" },
      ],
    },
    {
      name: `${term.deal} thất bại: ghi lý do và hẹn chăm sóc lại`,
      trigger: { type: "status_changed", object: "deals", to: lost },
      conditions: [],
      actions: [
        { type: "add_activity", text: "Đánh dấu thất bại – nhớ ghi lý do để rút kinh nghiệm" },
        { type: "create_task", text: "Chăm sóc lại {title} sau 30 ngày", days: 30, mode: "owner" },
      ],
    },
    {
      name: `${term.deal} giá trị lớn: báo quản lý`,
      trigger: { type: "record_created", object: "deals" },
      conditions: [{ field: "amount", op: "gt", value: "50000000" }],
      actions: [
        { type: "notify", mode: "all", text: "Có {title} giá trị lớn {amount}, cần quản lý hỗ trợ" },
        { type: "add_activity", text: "Giao dịch giá trị lớn – đã báo quản lý" },
      ],
    },
    {
      name: `Hẹn thành công: tạo ${term.deal.toLowerCase()} từ ${term.contact.toLowerCase()}`,
      trigger: { type: "call_logged", object: "contacts", value: "appointment" },
      conditions: [],
      actions: [
        { type: "create_record", object: "deals", text: "{title}", value: firstDeal },
        { type: "create_task", text: "Chuẩn bị buổi hẹn với {title}", days: 1, mode: "owner" },
      ],
    },
    {
      name: "Chưa có người phụ trách: giao người ít việc nhất",
      trigger: { type: "record_created", object: "deals" },
      conditions: [{ field: "owner", op: "empty" }],
      actions: [
        { type: "assign_owner", mode: "least_busy" },
        { type: "notify", mode: "owner", text: "Bạn được giao {title}" },
      ],
    },
  ];
  // Mẫu chăm sóc nâng cao: sinh nhật, khách im lặng, NPS, email, RFM.
  const contacts = getObject(cfg, "contacts");
  // Chưa có trường ngày sinh thì để trống: người dùng chọn trường khi dùng mẫu.
  const birthday = contacts?.fields.find((f) => f.type === "date" && /sinh|birth/i.test(`${f.key} ${f.label}`));
  const tags = contacts?.fields.find((f) => f.type === "tags");
  const tag = (value: string): Action[] => (tags ? [{ type: "add_tag", field: tags.key, value }] : []);
  const care: Rule[] = [
    {
      name: "Chúc mừng sinh nhật + voucher",
      trigger: { type: "anniversary", object: "contacts", field: birthday?.key, days: 0 },
      conditions: [],
      actions: [
        { type: "issue_voucher", campaignId: "" },
        { type: "send_message", channel: "auto", text: "Chúc mừng sinh nhật {title}! Gửi anh/chị mã ưu đãi {voucher} – chúc một năm thật nhiều niềm vui." },
        { type: "notify", mode: "owner", text: "Hôm nay là sinh nhật {title}, đã gửi voucher {voucher}" },
      ],
    },
    {
      name: `${term.contact} không tương tác 30 ngày → giao việc gọi lại`,
      trigger: { type: "idle", object: "contacts", days: 30 },
      conditions: [],
      actions: [
        { type: "create_task", text: "Gọi hỏi thăm {title} (30 ngày chưa tương tác)", days: 0, mode: "owner" },
        ...tag("Cần chăm sóc lại"),
      ],
    },
    {
      name: "NPS thấp → giao quản lý xử lý",
      trigger: { type: "survey_answered", object: "contacts", value: "detractor" },
      conditions: [],
      actions: [
        { type: "notify", mode: "all", text: "⚠️ {title} chấm NPS thấp, cần quản lý gọi xử lý trong hôm nay" },
        { type: "create_task", text: "Gọi xử lý phản hồi không hài lòng của {title}", days: 0, mode: "owner" },
        ...tag("NPS thấp"),
        { type: "add_score", points: -10 },
      ],
    },
    {
      name: "Khách mở email 2 lần → báo sale",
      trigger: { type: "email_engaged", object: "contacts", value: "open", threshold: 2 },
      conditions: [],
      actions: [
        { type: "notify", mode: "owner", text: "{title} vừa mở email lần thứ 2, đang quan tâm – gọi ngay nhé" },
        { type: "add_score", points: 10 },
        { type: "create_task", text: "Gọi tư vấn {title} (đã mở email 2 lần)", days: 0, mode: "owner" },
      ],
    },
    {
      name: "Khách sang nhóm Sắp rời bỏ → gửi ưu đãi",
      trigger: { type: "rfm_changed", object: "contacts", value: "sleeping" },
      conditions: [],
      actions: [
        { type: "issue_voucher", campaignId: "" },
        { type: "send_message", channel: "auto", text: "Lâu rồi chưa gặp {title}! Tặng anh/chị mã {voucher} cho lần mua tới ạ." },
        ...tag("Sắp rời bỏ"),
      ],
    },
  ];
  // Bỏ mẫu tham chiếu bảng không có trong cấu hình (ví dụ không có trạng thái thua).
  const ok = (r: Rule) => !!getObject(cfg, r.trigger.object) && !(r.trigger.type === "status_changed" && !r.trigger.to);
  return [...fromConfig, ...general.filter(ok).map((rule) => ({ group: g, rule })), ...care.filter(ok).map((rule) => ({ group: "Chăm sóc nâng cao", rule }))];
}
