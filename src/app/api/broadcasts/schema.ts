import { z } from "zod";
import { B_CHANNELS } from "@/lib/marketing/broadcast";

export const DraftIn = z.object({
  channel: z.enum(B_CHANNELS as [string, ...string[]]),
  segmentId: z.string().max(60).nullish(),
  subject: z.string().max(300).default(""),
  body: z.string().max(5000).default(""),
  templateId: z.string().max(60).default(""),
});

export const BroadcastIn = DraftIn.extend({
  name: z.string().trim().min(1, "Hãy đặt tên đợt gửi").max(120),
  when: z.enum(["draft", "now", "later"]).default("draft"),
  scheduledAt: z.string().nullish(),
});

/** Kiểm tra nội dung theo kênh; trả lỗi tiếng Việt hoặc null. */
export function contentError(d: { channel: string; subject: string; body: string; templateId: string }) {
  if (d.channel !== "zns" && !d.body.trim()) return "Hãy nhập nội dung tin";
  if (d.channel === "email" && !d.subject.trim()) return "Email cần có tiêu đề";
  if (d.channel === "sms" && d.body.length > 600) return "SMS quá dài (tối đa 600 ký tự, khoảng 4 tin)";
  return null;
}

/** Thời điểm gửi: now = ngay, later = theo giờ đã chọn (phải ở tương lai). */
export function scheduleOf(when: string, at?: string | null): { status: string; scheduledAt: Date | null } | { error: string } {
  if (when === "draft") return { status: "draft", scheduledAt: at ? new Date(at) : null };
  if (when === "now") return { status: "scheduled", scheduledAt: new Date() };
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return { error: "Hãy chọn ngày giờ gửi" };
  if (d.getTime() < Date.now() - 60_000) return { error: "Giờ gửi đã qua, hãy chọn giờ trong tương lai" };
  return { status: "scheduled", scheduledAt: d };
}
