// Trạng thái trực tuyến của nhân viên hộp thư. Hộp thư gửi nhịp (heartbeat) mỗi 60 giây;
// "đang trực" = có nhịp trong 3 phút gần nhất. Lưu trong bộ nhớ tiến trình + Pref "inboxPresence" (dự phòng khi khởi động lại / nhiều tiến trình).
import { getPref, setPref } from "../prefs";

export const ONLINE_MS = 3 * 60_000;
const PERSIST_MS = 2 * 60_000;

export type PresenceEntry = { userId: string; name: string; at: number };
type Store = Map<string, Map<string, PresenceEntry & { savedAt: number }>>;
const g = globalThis as unknown as { inboxPresence?: Store };
const store = (): Store => (g.inboxPresence ??= new Map());

/** Ghi nhận nhịp của một người. away = rời hộp thư (đóng tab) → coi như ngoại tuyến ngay. */
export async function heartbeat(workspaceId: string, user: { id: string; name: string }, away = false, now = Date.now()) {
  const ws = store().get(workspaceId) ?? new Map();
  store().set(workspaceId, ws);
  const prev = ws.get(user.id);
  const at = away ? 0 : now;
  const needSave = away || !prev || now - prev.savedAt >= PERSIST_MS;
  ws.set(user.id, { userId: user.id, name: user.name, at, savedAt: needSave ? now : prev!.savedAt });
  if (needSave) {
    const saved = await getPref<Record<string, { name: string; at: number }>>(workspaceId, "inboxPresence", {});
    // Dọn mục quá 7 ngày.
    for (const [k, v] of Object.entries(saved)) if (now - v.at > 7 * 864e5) delete saved[k];
    saved[user.id] = { name: user.name, at };
    await setPref(workspaceId, "inboxPresence", saved);
  }
}

/** Lần cuối thấy từng người (gộp bộ nhớ và Pref, lấy mốc mới hơn). */
export async function lastSeen(workspaceId: string): Promise<PresenceEntry[]> {
  const saved = await getPref<Record<string, { name: string; at: number }>>(workspaceId, "inboxPresence", {});
  const out = new Map<string, PresenceEntry>();
  for (const [userId, v] of Object.entries(saved)) out.set(userId, { userId, name: v.name, at: v.at });
  for (const v of store().get(workspaceId)?.values() ?? []) {
    const cur = out.get(v.userId);
    // Bộ nhớ là nguồn mới nhất của tiến trình này (kể cả "away" = 0).
    if (!cur || v.savedAt >= cur.at || v.at > cur.at) out.set(v.userId, { userId: v.userId, name: v.name, at: v.at });
  }
  return [...out.values()].sort((a, b) => b.at - a.at);
}

export const isOnlineAt = (at: number, now = Date.now()) => at > 0 && now - at <= ONLINE_MS;

/** Tên những người đang trực. */
export async function onlineNames(workspaceId: string, now = Date.now()): Promise<Set<string>> {
  return new Set((await lastSeen(workspaceId)).filter((e) => isOnlineAt(e.at, now)).map((e) => e.name));
}

export type PresenceDTO = { userId: string; name: string; at: string | null; online: boolean };
export async function presenceList(workspaceId: string, now = Date.now()): Promise<PresenceDTO[]> {
  return (await lastSeen(workspaceId)).map((e) => ({ userId: e.userId, name: e.name, at: e.at ? new Date(e.at).toISOString() : null, online: isOnlineAt(e.at, now) }));
}
