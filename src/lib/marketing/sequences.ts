import type { Record as DbRecord } from "@prisma/client";
import type { WorkspaceConfig } from "../config/schema";

// Kịch bản chăm sóc tự động. Module Marketing hoàn thiện file này.
export async function onSequenceEvent(_workspaceId: string, _ev: { kind: "record_created" | "status_changed"; record: DbRecord }): Promise<void> {}
export async function enrollRecord(_workspaceId: string, _sequenceId: string, _recordId: string): Promise<void> {}
export async function stopEnrollmentsForRecord(_workspaceId: string, _recordId: string, _reason: string): Promise<void> {}
export async function tickSequences(): Promise<void> {}
export async function seedMarketing(_workspaceId: string, _cfg: WorkspaceConfig): Promise<void> {}
