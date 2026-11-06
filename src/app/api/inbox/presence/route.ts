import { appApi, ok } from "@/lib/http";
import { heartbeat, presenceList } from "@/lib/chat/presence";

/** Nhịp "đang trực" từ trang Hộp thư (mỗi 60 giây). Body { away?: true } khi rời trang. Trả danh sách trực tuyến. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => ({}))) as { away?: boolean };
  await heartbeat(a.ctx.workspace.id, a.ctx.user, body?.away === true);
  return ok({ people: await presenceList(a.ctx.workspace.id) });
}

/** Ai đang trực tuyến (có nhịp trong 3 phút). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok({ people: await presenceList(a.ctx.workspace.id) });
}
