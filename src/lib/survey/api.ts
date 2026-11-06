// Phần dùng chung của API khảo sát: quyền quản lý, DTO.
import type { Survey } from "@prisma/client";
import { z } from "zod";
import { can, getRole } from "../permissions";
import { QuestionsSchema, SURVEY_KINDS } from "./shared";
import { questionsOf } from "./service";

/** Tạo/sửa/xoá khảo sát và cài đặt: chủ, quản lý (quyền marketing). */
export const canManageSurveys = async (ctx: { user: { id: string }; workspace: { id: string } }) => can(await getRole(ctx.user.id, ctx.workspace.id), "manage_marketing");

export const SurveyBody = z.object({
  name: z.string().trim().min(1, "Cần nhập tên khảo sát").max(120),
  kind: z.enum(SURVEY_KINDS),
  questions: QuestionsSchema,
  thankYou: z.string().trim().max(500).catch("Cảm ơn bạn đã góp ý!"),
  active: z.boolean().optional(),
});

export const surveyDTO = (s: Survey) => ({ id: s.id, name: s.name, kind: s.kind, questions: questionsOf(s), thankYou: s.thankYou, active: s.active, publicKey: s.publicKey, createdBy: s.createdBy, createdAt: s.createdAt.toISOString() });
export type SurveyDTO = ReturnType<typeof surveyDTO>;
