// Định nghĩa luật tự động hoá dùng chung cho trình duyệt và server (không import db).
import { z } from "zod";
import { getObject, type AutomationDef, type WorkspaceConfig } from "@/lib/config/schema";
import { OUTCOMES } from "@/lib/calls-shared";

export const TRIGGER_TYPES = ["record_created", "status_changed", "field_changed", "score_above", "call_logged", "message_received", "date_arrived"] as const;
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
  /** score_above: ngưỡng điểm. */
  threshold: z.number().min(0).max(100).optional(),
  /** date_arrived: trường ngày = hôm nay + N ngày (N âm = đã qua N ngày). */
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

export const ACTION_TYPES = ["create_task", "notify", "assign_owner", "set_status", "set_field", "send_message", "enroll_sequence", "webhook", "add_activity", "create_record"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const Action = z.object({
  type: z.enum(ACTION_TYPES),
  /** Nội dung: việc, thông báo, tin nhắn, ghi chú, tên mục mới. Có biến {title}, {owner}, {status}, {amount}, {phone}... */
  text: z.string().max(2000).optional(),
  /** create_task: hạn sau N ngày. */
  days: z.number().int().min(0).max(365).optional(),
  /** create_task: "owner" | tên người; notify: "owner" | "all" | "user"; assign_owner: "round_robin" | "user" | "least_busy". */
  mode: z.string().max(40).optional(),
  /** Tên người cụ thể (giao việc, thông báo, phân công). */
  user: z.string().max(80).optional(),
  /** set_status: key trạng thái; set_field: giá trị mới. */
  value: z.string().max(500).optional(),
  /** set_field: key trường. */
  field: z.string().max(80).optional(),
  /** send_message: zalo | zns | sms | email. */
  channel: z.enum(["zalo", "zns", "sms", "email"]).optional(),
  subject: z.string().max(200).optional(),
  sequenceId: z.string().max(60).optional(),
  url: z.string().max(500).optional(),
  /** create_record: bảng đích (mặc định deals). */
  object: z.string().max(40).optional(),
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
};
export const CHANNEL_LABEL: Record<string, string> = { zalo: "Zalo OA", zns: "Zalo ZNS", sms: "SMS", email: "Email" };
export const INBOX_CHANNEL: Record<string, string> = { zalo: "Zalo OA", messenger: "Messenger" };
export const VARIABLES = ["{title}", "{owner}", "{status}", "{amount}", "{phone}", "{email}"];

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
export function sentence(rule: Rule, cfg: WorkspaceConfig, extra?: { sequences?: { id: string; name: string }[] }): { trigger: Part[]; conditions: Part[][]; actions: Part[][] } {
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
        return [{ text: a.mode === "user" ? `giao cho ${a.user || "…"}` : a.mode === "least_busy" ? "giao người ít việc nhất" : "chia người phụ trách xoay vòng" }];
      case "set_status":
        return [{ text: `đổi ${(obj?.statusLabel ?? "trạng thái").toLowerCase()} thành ${st(a.value) || "…"}` }];
      case "set_field":
        return [{ text: `đặt ${fieldLabel(a.field)} = “${short(a.value, 24)}”` }];
      case "send_message":
        return [{ text: `gửi ${CHANNEL_LABEL[a.channel ?? "zalo"]}: “${short(a.text, 32)}”` }];
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
  // Bỏ mẫu tham chiếu bảng không có trong cấu hình (ví dụ không có trạng thái thua).
  const ok = (r: Rule) => !!getObject(cfg, r.trigger.object) && !(r.trigger.type === "status_changed" && !r.trigger.to);
  return [...fromConfig, ...general.filter(ok).map((rule) => ({ group: g, rule }))];
}
