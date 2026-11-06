import { appApi, fail, ok } from "@/lib/http";
import { learnLessons } from "@/lib/calls";
import { viMessage } from "@/lib/format";

/** Chạy vòng phản hồi ngay: rút bài học từ dữ liệu cuộc gọi hiện có. */
export async function POST() {
  const a = await appApi();
  if ("error" in a) return a.error;
  try {
    const lesson = await learnLessons(a.ctx.workspace.id);
    return ok({ lesson }, 201);
  } catch (e) {
    return fail(viMessage(e, "Không rút được bài học"));
  }
}
