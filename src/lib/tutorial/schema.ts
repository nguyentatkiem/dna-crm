// Kiểm tra dữ liệu gửi lên API hướng dẫn (chỉ dùng ở server và kiểm thử).
import { z } from "zod";
import { ID_RE } from "./progress";

const Id = z.string().regex(ID_RE);

export const ProgressPatchSchema = z
  .object({
    welcomeSeen: z.boolean().optional(),
    tour: z.object({ id: Id, status: z.enum(["done", "skipped"]).nullable() }).optional(),
    manual: z.object({ id: Id, done: z.boolean() }).optional(),
    checklistHidden: z.boolean().optional(),
    hint: Id.optional(),
    visit: Id.optional(),
    reset: z.literal(true).optional(),
  })
  .strict();

export const SettingsPatchSchema = z.object({ welcomeForNewMembers: z.boolean().optional(), showChecklist: z.boolean().optional() }).strict();
