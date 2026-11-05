import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { appApi } from "@/lib/http";
import { fail } from "@/lib/http";
import { can, getRole } from "@/lib/permissions";
import type { Rule } from "@/lib/automation";

/** Route sửa luật: cần đăng nhập và có quyền manage_automations. */
export async function managerApi() {
  const a = await appApi();
  if ("error" in a) return a;
  const role = await getRole(a.ctx.user.id, a.ctx.workspace.id);
  if (!can(role, "manage_automations")) return { error: fail("Chỉ chủ hoặc quản lý được tạo và sửa tự động hoá", 403) } as const;
  return a;
}

/** Kiểm tra luật khớp cấu hình hiện tại. Trả thông báo lỗi tiếng Việt hoặc null. */
export function validateRule(rule: Rule, cfg: WorkspaceConfig): string | null {
  const obj = getObject(cfg, rule.trigger.object);
  if (!obj) return "Bảng của trigger không tồn tại";
  const t = rule.trigger;
  const hasStatus = (k?: string) => !k || obj.statuses.some((s) => s.key === k);
  if (t.type === "status_changed" && (!hasStatus(t.to) || !hasStatus(t.from))) return "Trạng thái trong trigger không có trong bảng";
  if (t.type === "date_arrived" && !obj.fields.some((f) => f.key === t.field?.replace(/^f:/, "") && f.type === "date")) return "Hãy chọn một trường kiểu ngày";
  if (t.type === "field_changed" && !t.field) return "Hãy chọn trường cần theo dõi";
  for (const a of rule.actions) {
    if (a.type === "set_status" && !obj.statuses.some((s) => s.key === a.value)) return "Hành động đổi trạng thái chưa chọn trạng thái hợp lệ";
    if (a.type === "set_field" && !obj.fields.some((f) => f.key === a.field?.replace(/^f:/, ""))) return "Hành động cập nhật trường chưa chọn trường";
    if (a.type === "enroll_sequence" && !a.sequenceId) return "Hãy chọn kịch bản chăm sóc";
    if (a.type === "create_record" && !getObject(cfg, a.object || "deals")) return "Bảng đích không tồn tại";
    if (a.type === "webhook") {
      try {
        const u = new URL(a.url ?? "");
        if (u.protocol !== "http:" && u.protocol !== "https:") return "Webhook chỉ nhận http hoặc https";
      } catch {
        return "URL webhook không hợp lệ";
      }
    }
    if ((a.type === "notify" || a.type === "send_message" || a.type === "add_activity") && !a.text?.trim()) return "Hành động còn thiếu nội dung";
  }
  return null;
}
