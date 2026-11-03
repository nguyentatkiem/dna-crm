import { refineConfigWithAI } from "../ai";
import type { Dna } from "../dna";
import type { WorkspaceConfig } from "./schema";
import { buildTemplate } from "./templates";

/** DNA → cấu hình. Template luôn có sẵn; AI chỉ tinh chỉnh khi có API key. */
export async function generateConfig(dna: Dna): Promise<{ config: WorkspaceConfig; source: "ai" | "template" }> {
  const base = buildTemplate(dna);
  const refined = await refineConfigWithAI(dna, base);
  return refined ? { config: refined, source: "ai" } : { config: base, source: "template" };
}
