import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { appApi } from "@/lib/http";
import { fail } from "@/lib/http";
import { allowed } from "@/lib/permissions";
import type { Rule } from "@/lib/automation";

/** Route sửa luật: cần đăng nhập và có quyền automations_manage. */
export async function managerApi() {
  const a = await appApi();
  if ("error" in a) return a;
  if (!(await allowed(a.ctx, "automations_manage"))) return { error: fail("Bạn chưa có quyền tạo và sửa tự động hoá", 403) } as const;
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
  if (t.type === "anniversary" && !obj.fields.some((f) => f.key === t.field?.replace(/^f:/, "") && f.type === "date")) return "Hãy chọn trường ngày kỷ niệm (ví dụ ngày sinh)";
  if (t.type === "idle" && !((t.days ?? 0) >= 1)) return "Số ngày không tương tác phải từ 1 trở lên";
  for (const a of rule.actions) {
    if (a.type === "set_status" && !obj.statuses.some((s) => s.key === a.value)) return "Hành động đổi trạng thái chưa chọn trạng thái hợp lệ";
    if (a.type === "set_field" && !obj.fields.some((f) => f.key === a.field?.replace(/^f:/, ""))) return "Hành động cập nhật trường chưa chọn trường";
    if (a.type === "enroll_sequence" && !a.sequenceId) return "Hãy chọn kịch bản chăm sóc";
    if (a.type === "issue_voucher" && !a.campaignId) return "Hãy chọn chiến dịch voucher";
    if (a.type === "send_survey" && !a.surveyId) return "Hãy chọn khảo sát cần gửi";
    if (a.type === "add_tag" && (!obj.fields.some((f) => f.key === a.field?.replace(/^f:/, "")) || !a.value?.trim())) return "Hành động gắn thẻ cần chọn trường và nhập thẻ";
    if (a.type === "add_score" && !a.points) return "Hãy nhập số điểm cộng hoặc trừ";
    if (a.type === "assign_owner" && a.mode === "team" && !a.teamId) return "Hãy chọn nhóm để chia xoay vòng";
    if (a.type === "assign_owner" && a.mode === "territory" && (!a.field || !a.text?.includes("="))) return "Giao theo khu vực cần chọn trường và nhập ít nhất một dòng “Khu vực=Người”";
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
