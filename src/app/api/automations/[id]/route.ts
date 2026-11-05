import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { Rule, ruleHistory, ruleName, ruleOf, rowOf, sentenceText } from "@/lib/automation";
import { managerApi, validateRule } from "../shared";

type Ctx = { params: Promise<{ id: string }> };

/** Chi tiết luật + 20 lần chạy gần nhất. */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const row = await db.automation.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!row) return fail("Không tìm thấy luật", 404);
  const rule = ruleOf(row);
  const history = await ruleHistory(a.ctx.workspace.id, ruleName(rule, a.ctx.config));
  return ok({ id: row.id, enabled: row.enabled, runs: row.runs, rule, text: sentenceText(rule, a.ctx.config), history: history.map((h) => ({ id: h.id, at: h.createdAt.toISOString(), message: h.message })) });
}

const Patch = z.object({ enabled: z.boolean().optional(), rule: Rule.optional() });

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await managerApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const wid = a.ctx.workspace.id;
  const row = await db.automation.findFirst({ where: { id, workspaceId: wid } });
  if (!row) return fail("Không tìm thấy luật", 404);
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu luật chưa hợp lệ");
  const p = parsed.data;
  if (p.rule) {
    const err = validateRule(p.rule, a.ctx.config);
    if (err) return fail(err);
  }
  const before = ruleOf(row);
  const updated = await db.automation.update({
    where: { id },
    data: { enabled: p.enabled, ...(p.rule ? rowOf(p.rule, before.trigger.type === p.rule.trigger.type ? before.lastRun : undefined) : {}) },
  });
  const after = ruleOf(updated);
  const summary = p.rule ? `Sửa luật “${updated.name}”` : `${updated.enabled ? "Bật" : "Tắt"} luật “${ruleName(after, a.ctx.config)}”`;
  await audit({ workspaceId: wid, user: a.ctx.user }, "update", "automation", id, summary, p.rule ? { before, after } : { enabled: [row.enabled, updated.enabled] });
  return ok({ id, enabled: updated.enabled, runs: updated.runs, rule: after, text: sentenceText(after, a.ctx.config) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await managerApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const wid = a.ctx.workspace.id;
  const row = await db.automation.findFirst({ where: { id, workspaceId: wid } });
  if (!row) return fail("Không tìm thấy luật", 404);
  await db.automation.delete({ where: { id } });
  const rule = ruleOf(row);
  await audit({ workspaceId: wid, user: a.ctx.user }, "delete", "automation", id, `Xoá luật “${ruleName(rule, a.ctx.config)}”`, rule);
  return ok({ deleted: true });
}
