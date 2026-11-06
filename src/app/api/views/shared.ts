import type { BoardView } from "@prisma/client";
import { canEditView, parseState, type ViewDTO } from "@/lib/views";

export function viewDTO(v: BoardView, userId: string, role: string): ViewDTO {
  const mine = v.ownerId === userId;
  return { id: v.id, name: v.name, ownerName: v.ownerName, mine, shared: v.shared, isDefault: mine && v.isDefault, canEdit: canEditView(v, userId, role), state: parseState(v.stateJson), updatedAt: v.updatedAt.toISOString() };
}
