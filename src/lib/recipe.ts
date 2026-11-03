import { getObject, type AutomationDef, type WorkspaceConfig } from "./config/schema";

export type RecipePart = { text: string; strong?: boolean };

/** Biến một automation thành câu "Khi ... thì ..." kiểu công thức (DESIGN.md mục 5). */
export function recipe(a: AutomationDef, cfg: WorkspaceConfig): RecipePart[] {
  const obj = getObject(cfg, a.triggerObject);
  const name = obj?.itemLabel.toLowerCase() ?? a.triggerObject;
  const parts: RecipePart[] = [{ text: "Khi " }];
  if (a.triggerType === "record_created") {
    parts.push({ text: `có ${name} mới`, strong: true });
  } else {
    const st = obj?.statuses.find((s) => s.key === a.triggerValue)?.label ?? (a.triggerValue || "bất kỳ");
    parts.push({ text: `${obj?.statusLabel.toLowerCase() ?? "trạng thái"} của ${name}` , strong: true }, { text: " đổi thành " }, { text: st, strong: true });
  }
  parts.push({ text: ", thì " });
  if (a.actionType === "create_task") {
    const [text, days] = a.actionValue.split("|");
    const d = Number(days) || 0;
    parts.push({ text: "tạo việc ", strong: true }, { text: `"${text.replaceAll("{title}", "…")}"` }, { text: d ? ` hạn sau ${d} ngày` : " hạn hôm nay" });
  } else if (a.actionType === "notify") {
    parts.push({ text: "thông báo ", strong: true }, { text: `"${a.actionValue}"` });
  } else {
    parts.push({ text: "chia người phụ trách", strong: true }, { text: " xoay vòng trong đội" });
  }
  return parts;
}
