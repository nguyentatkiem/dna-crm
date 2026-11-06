import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { appApi, fail, ok } from "@/lib/http";
import { ai, MODEL } from "@/lib/ai";
import { getObject } from "@/lib/config/schema";
import { getRole } from "@/lib/permissions";
import { getFieldRules, visibleObject } from "@/lib/field-access";
import { Extracted, mapToFields } from "./map";

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Quét danh thiếp / CCCD: multipart { image, objectKey? } → trường đã ghép theo cấu hình bảng khách.
 * Ảnh chỉ gửi cho Claude để đọc rồi bỏ, không lưu ở đâu cả.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const c = ai();
  if (!c) return fail("Chưa bật AI nên chưa quét được ảnh. Chủ workspace cần thêm ANTHROPIC_API_KEY vào cấu hình máy chủ.", 501);
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return fail("Hãy chọn ảnh danh thiếp hoặc CCCD");
  if (!(TYPES as readonly string[]).includes(file.type)) return fail("Chỉ nhận ảnh JPG, PNG hoặc WebP");
  if (file.size > MAX) return fail("Ảnh lớn hơn 5MB, hãy chụp lại hoặc giảm dung lượng");
  const objectKey = String(form?.get("objectKey") || "contacts");
  const full = getObject(a.ctx.config, objectKey);
  if (!full) return fail("Không có bảng này", 404);
  // Chỉ ghép vào trường người dùng được thấy.
  const [role, rules] = await Promise.all([getRole(a.ctx.user.id, a.ctx.workspace.id), getFieldRules(a.ctx.workspace.id, objectKey)]);
  const obj = visibleObject(full, role, rules);

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Extracted) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type as (typeof TYPES)[number], data } },
            {
              type: "text",
              text: "Đây là ảnh danh thiếp hoặc căn cước công dân (CCCD/CMND) Việt Nam. Đọc chính xác thông tin trên ảnh, giữ nguyên dấu tiếng Việt. Trường nào không có trên ảnh thì để chuỗi rỗng, không đoán. Số điện thoại Việt Nam viết dạng 0xxxxxxxxx nếu được. Ngày sinh dạng YYYY-MM-DD.",
            },
          ],
        },
      ],
    });
    const x = res.parsed_output;
    if (res.stop_reason === "refusal" || !x) return fail("AI không đọc được ảnh này, hãy thử ảnh rõ hơn", 422);
    if (x.kind === "other" && !x.name && !x.phone && !x.email) return fail("Không thấy thông tin danh thiếp hay CCCD trong ảnh", 422);
    return ok({ kind: x.kind, ...mapToFields(x, obj.fields) });
  } catch (e) {
    console.error("[ocr]", e instanceof Error ? e.message : e);
    return fail("Không quét được ảnh lúc này, thử lại sau ít phút", 502);
  }
}
