import { db, parseJson } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { ai, MODEL, textOf } from "@/lib/ai";
import { heat } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

/** Sales Coach: gợi ý bước tiếp theo + tin nhắn soạn sẵn cho một mục. */
export async function POST(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const rec = await db.record.findFirst({ where: { id, workspaceId: a.ctx.workspace.id }, include: { activities: { orderBy: { createdAt: "desc" }, take: 8 } } });
  if (!rec) return fail("Không tìm thấy mục", 404);
  const cfg = a.ctx.config;
  const obj = getObject(cfg, rec.objectKey);
  const status = obj?.statuses.find((s) => s.key === rec.status)?.label ?? rec.status;
  const data = parseJson<Record<string, string | number>>(rec.dataJson, {});
  const first = rec.title.split(" ").pop();

  const c = ai();
  if (c) {
    try {
      const msg = await c.messages.create({
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: "low" },
        system: `Bạn là Sales Coach của ${cfg.businessName} (ngành ${cfg.industry}). Trả lời bằng tiếng Việt, ngắn gọn. Định dạng đúng hai phần:
BƯỚC TIẾP THEO: một câu hành động cụ thể.
TIN NHẮN: một tin nhắn Zalo thân thiện dưới 60 từ, xưng "em", gọi khách theo tên.`,
        messages: [
          {
            role: "user",
            content: `${obj?.itemLabel}: ${rec.title}\n${obj?.statusLabel}: ${status}\nDữ liệu: ${JSON.stringify(data)}\nGiá trị: ${rec.amount}\nLịch sử gần đây:\n${rec.activities.map((x) => `- ${x.author}: ${x.body}`).join("\n")}`,
          },
        ],
      });
      if (msg.stop_reason !== "refusal") {
        const text = textOf(msg);
        const next = text.match(/BƯỚC TIẾP THEO:\s*([\s\S]*?)(?:\n\s*TIN NHẮN:|$)/i)?.[1]?.trim();
        const draft = text.match(/TIN NHẮN:\s*([\s\S]*)$/i)?.[1]?.trim();
        if (next && draft) return ok({ next, draft, source: "ai" });
      }
    } catch (e) {
      console.error("[Sales Coach]", e instanceof Error ? e.message : e);
    }
  }

  const h = rec.objectKey === "contacts" ? heat(rec.score) : null;
  const next =
    h?.key === "hot"
      ? "Gọi ngay hôm nay, khách đang có nhu cầu rõ và dễ chốt."
      : h?.key === "cold"
        ? "Gửi nội dung hữu ích trước, chưa nên chào giá."
        : `Liên hệ lại để đưa ${obj?.itemLabel.toLowerCase()} sang giai đoạn tiếp theo sau “${status}”.`;
  const draft = `Dạ ${first} ơi, em bên ${cfg.businessName} đây ạ. Em gửi mình thông tin và ưu đãi riêng trong tuần này, mình xem giúp em nhé. Cần em tư vấn thêm gì mình cứ nhắn em ạ!`;
  return ok({ next, draft, source: "rules" });
}
