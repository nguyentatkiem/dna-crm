import { z } from "zod";

export const StepIn = z.object({
  delayHours: z.coerce.number().min(0).max(24 * 365),
  channel: z.enum(["zalo", "zns", "sms", "email", "messenger"]),
  subject: z.string().max(200).optional(),
  body: z.string().max(2000),
  templateId: z.string().max(60).optional(),
  condition: z.enum(["no_reply", "any"]).optional(),
});

export const SequenceIn = z.object({
  name: z.string().trim().min(1, "Đặt tên kịch bản").max(120),
  triggerType: z.enum(["record_created", "status_changed", "inactive_days", "manual"]),
  objectKey: z.enum(["contacts", "deals"]),
  triggerValue: z.string().max(60).default(""),
  steps: z.array(StepIn).min(1, "Thêm ít nhất một bước").max(20),
  enabled: z.boolean().default(true),
  stopOnReply: z.boolean().default(true),
});
