// Dùng chung cho các route mẫu trả lời nhanh.
import type { QuickReply } from "@prisma/client";
import { z } from "zod";
import { parseJson } from "@/lib/db";
import { cleanUrls, normShortcut, type QuickReplyDTO } from "@/lib/quick-replies";

export const toQuickDTO = (r: QuickReply): QuickReplyDTO => ({
  id: r.id,
  shortcut: r.shortcut,
  topic: r.topic,
  content: r.content,
  attachments: cleanUrls(parseJson<unknown[]>(r.attachmentsJson, [])),
  sort: r.sort,
  uses: r.uses,
  createdBy: r.createdBy,
});

export const QuickInput = z.object({
  shortcut: z.string().max(60).transform(normShortcut),
  topic: z.string().max(40).catch(""),
  content: z.string().trim().min(1, "Cần nhập nội dung mẫu").max(2000, "Nội dung tối đa 2000 ký tự"),
  attachments: z.array(z.string().max(1000)).max(10).catch([]).transform(cleanUrls),
});
