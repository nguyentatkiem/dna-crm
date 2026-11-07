import { appApi, fail, ok } from "@/lib/http";
import { findVisibleConversation } from "@/lib/inbox-list";
import { findAccount } from "@/lib/channels/accounts";
import { listWaTemplates, waWindow, WaError } from "@/lib/channels/whatsapp";

/** Mẫu tin đã duyệt của số WhatsApp trong hội thoại + trạng thái cửa sổ 24 giờ. ?conversationId= */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, new URL(req.url).searchParams.get("conversationId") ?? "");
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  if (conv.channel !== "whatsapp") return fail("Hội thoại không phải WhatsApp");
  const acc = await findAccount(a.ctx.workspace.id, "whatsapp", conv.pageId);
  if (!acc) return fail("Số WhatsApp của hội thoại chưa kết nối (Hộp thư → Kênh → WhatsApp)", 409);
  const w = waWindow(conv);
  try {
    const { items, simulated } = await listWaTemplates(acc);
    return ok({ window: { open: w.open, closesAt: w.closesAt?.toISOString() ?? null }, templates: items.filter((t) => t.status === "APPROVED"), pending: items.filter((t) => t.status !== "APPROVED").length, simulated });
  } catch (e) {
    return fail(e instanceof WaError ? e.message : `Không tải được mẫu tin: ${e instanceof Error ? e.message : e}`, 502);
  }
}
