// Kiểm tra thân yêu cầu tạo / sửa báo cáo (dùng chung cho POST và PATCH).
import { z } from "zod";
import { EMAIL_RE, ScheduleSchema } from "@/lib/reports/shared";

export const ReportBody = z.object({
  name: z.string().trim().min(1, "Hãy đặt tên báo cáo").max(120),
  config: z.unknown(),
  schedule: ScheduleSchema.optional(),
  recipients: z.array(z.string().trim().toLowerCase().regex(EMAIL_RE, "Email người nhận không hợp lệ")).max(20, "Tối đa 20 người nhận").optional(),
  shared: z.boolean().optional(),
});
