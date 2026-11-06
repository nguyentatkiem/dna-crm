// Sao lưu và khôi phục dữ liệu. Chạy được trên cả SQLite và Postgres (xuất JSON nén gzip).
// - Bản của một workspace: backups/<workspaceId>/YYYY-MM-DD_HHmm.json.gz (trang Cài đặt → Sao lưu).
// - Bản toàn hệ thống: backups/YYYY-MM-DD_HHmm.json.gz, kèm bản sao file .db khi dùng SQLite (CLI, tự động).
import { Prisma } from "@prisma/client";
// Sao lưu cần mọi dòng, kể cả mục đang trong thùng rác → dùng client gốc.
import { dbRaw as db, parseJson } from "./db";
import type { Integrations } from "./settings";
import { audit as writeAudit } from "./audit";

// Module Node lấy lúc chạy thay vì import tĩnh: file này nằm trong jobs.ts → instrumentation.ts,
// Next biên dịch cả bản Edge, nơi import "node:fs"... làm hỏng bản build. Chỉ chạy trên Node.js.
const fs = () => process.getBuiltinModule("node:fs/promises");
const path = () => process.getBuiltinModule("node:path");
const crypto = () => process.getBuiltinModule("node:crypto");
const gz = (b: Buffer) => new Promise<Buffer>((ok, no) => process.getBuiltinModule("node:zlib").gzip(b, (e, r) => (e ? no(e) : ok(r))));
const gunz = (b: Buffer) => new Promise<Buffer>((ok, no) => process.getBuiltinModule("node:zlib").gunzip(b, (e, r) => (e ? no(e) : ok(r))));

type Row = Record<string, unknown>;
type Delegate = {
  findMany(args?: unknown): Promise<Row[]>;
  createMany(args: unknown): Promise<unknown>;
  deleteMany(args?: unknown): Promise<unknown>;
};
type Tx = Prisma.TransactionClient | typeof db;
const table = (c: Tx, key: string) => (c as unknown as Record<string, Delegate>)[key];

export const BACKUP_DIR = () => process.env.BACKUP_DIR || path().join(process.cwd(), "backups");
const NAME_RE = /^\d{4}-\d{2}-\d{2}_\d{4}(?:-\d{1,3})?\.json\.gz$/;
/** Chỉ nhận tên file đúng mẫu, chặn ../ và đường dẫn tuyệt đối. */
export const isBackupName = (n: string) => NAME_RE.test(n) && path().basename(n) === n;
const WS_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Các bảng thuộc một workspace, theo thứ tự chèn (bảng cha trước).
 * via: bảng không có cột workspaceId, lọc theo bảng cha.
 */
const WS_TABLES: { key: string; via?: { parent: string; field: string } }[] = [
  { key: "dna" },
  { key: "workspaceConfig" },
  { key: "record" },
  { key: "activity", via: { parent: "record", field: "recordId" } },
  { key: "task" },
  { key: "automation" },
  { key: "agentSetting" },
  { key: "agentLog" },
  { key: "leadEvent" },
  { key: "call" },
  { key: "scorecard" },
  { key: "lesson" },
  { key: "conversation" },
  { key: "message", via: { parent: "conversation", field: "conversationId" } },
  { key: "adSpend" },
  { key: "sequence" },
  { key: "enrollment" },
  { key: "outMessage" },
  { key: "dashboard" },
  { key: "doc" },
  { key: "auditLog" },
  { key: "notification" },
];
const SYSTEM_TABLES = ["user", "workspace", "membership", "invite"];
/** Cột trỏ sang bảng khác: khi khôi phục sang workspace khác phải đổi id theo. */
const REFS: Record<string, string> = { recordId: "record", conversationId: "conversation", sequenceId: "sequence" };

const modelName = (key: string) => key[0].toUpperCase() + key.slice(1);
const fieldsOf = (key: string) => Prisma.dmmf.datamodel.models.find((m) => m.name === modelName(key))?.fields.filter((f) => f.kind === "scalar" || f.kind === "enum") ?? [];

/** Mã phiên bản schema: băm tên bảng + cột + kiểu. Đổi schema thì mã đổi. */
export function schemaVersion() {
  const sig = Prisma.dmmf.datamodel.models.map((m) => `${m.name}(${m.fields.filter((f) => f.kind !== "object").map((f) => `${f.name}:${f.type}`).join(",")})`).join(";");
  return crypto().createHash("sha256").update(sig).digest("hex").slice(0, 12);
}

export const dbProvider = () => (String(process.env.DATABASE_URL ?? "").startsWith("file:") ? "sqlite" : "postgresql");

export type BackupFile = {
  format: "dna-crm-backup";
  version: 1;
  createdAt: string;
  provider: string;
  schemaVersion: string;
  scope: "workspace" | "all";
  workspaceId?: string;
  workspaceName?: string;
  counts: Record<string, number>;
  tables: Record<string, Row[]>;
};
export type BackupInfo = { name: string; size: number; createdAt: string; dbSize?: number };

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

/** Thư mục chứa bản sao lưu: của một workspace, hoặc gốc (toàn hệ thống). */
export function backupDir(workspaceId?: string) {
  if (workspaceId && !WS_ID_RE.test(workspaceId)) throw new Error("Mã workspace không hợp lệ");
  return workspaceId ? path().join(BACKUP_DIR(), workspaceId) : BACKUP_DIR();
}

/** Đường dẫn file sao lưu đã kiểm tra tên. Trả null nếu tên sai mẫu. */
export function backupPath(name: string, workspaceId?: string) {
  return isBackupName(name) ? path().join(backupDir(workspaceId), name) : null;
}

async function collect(workspaceId?: string) {
  const tables: Record<string, Row[]> = {};
  if (workspaceId) {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new Error("Không tìm thấy workspace");
    tables.workspace = [ws as unknown as Row];
    tables.membership = await table(db, "membership").findMany({ where: { workspaceId } });
    // Chỉ để tra cứu ai là thành viên. Không lưu mật khẩu, không khôi phục người dùng từ bản này.
    tables.user = await table(db, "user").findMany({
      where: { memberships: { some: { workspaceId } } },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  } else for (const k of SYSTEM_TABLES) tables[k] = await table(db, k).findMany();

  const ids: Record<string, string[]> = {};
  for (const t of WS_TABLES) {
    let where: unknown = workspaceId ? { workspaceId } : undefined;
    if (t.via && workspaceId) where = { [t.via.field]: { in: ids[t.via.parent] ?? [] } };
    const rows = await table(db, t.key).findMany(where ? { where } : undefined);
    tables[t.key] = rows;
    ids[t.key] = rows.map((r) => String(r.id ?? ""));
  }
  return { tables, workspaceName: workspaceId ? String(tables.workspace[0]?.name ?? "") : undefined };
}

async function uniqueName(dir: string) {
  const base = stamp();
  for (let i = 1; i < 100; i++) {
    const name = i === 1 ? `${base}.json.gz` : `${base}-${i}.json.gz`;
    try {
      await fs().access(path().join(dir, name));
    } catch {
      return name;
    }
  }
  throw new Error("Tạo quá nhiều bản sao lưu trong một phút");
}

/**
 * Tạo bản sao lưu. Có workspaceId: chỉ dữ liệu của workspace đó (dùng ở trang Cài đặt).
 * Không có: toàn hệ thống (CLI, sao lưu tự động), thêm bản sao file .db khi dùng SQLite.
 */
export async function createBackup(workspaceId?: string) {
  const dir = backupDir(workspaceId);
  await fs().mkdir(dir, { recursive: true });
  const { tables, workspaceName } = await collect(workspaceId);
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  const file: BackupFile = {
    format: "dna-crm-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    provider: dbProvider(),
    schemaVersion: schemaVersion(),
    scope: workspaceId ? "workspace" : "all",
    workspaceId,
    workspaceName,
    counts,
    tables,
  };
  const name = await uniqueName(dir);
  const full = path().join(dir, name);
  await fs().writeFile(full, await gz(Buffer.from(JSON.stringify(file))));
  let dbFile: string | undefined;
  if (!workspaceId && dbProvider() === "sqlite") {
    // VACUUM INTO tạo bản sao nhất quán của file SQLite ngay cả khi app đang chạy.
    dbFile = full.replace(/\.json\.gz$/, ".db");
    try {
      await db.$executeRawUnsafe(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
    } catch (e) {
      console.error("[backup] không sao chép được file .db:", e instanceof Error ? e.message : e);
      dbFile = undefined;
    }
  }
  const size = (await fs().stat(full)).size;
  return { name, path: full, size, counts, dbFile };
}

/** Danh sách bản sao lưu, mới nhất trước. */
export async function listBackups(workspaceId?: string): Promise<BackupInfo[]> {
  const dir = backupDir(workspaceId);
  const names = await fs().readdir(dir).catch(() => [] as string[]);
  const out: BackupInfo[] = [];
  for (const name of names.filter(isBackupName)) {
    const st = await fs().stat(path().join(dir, name)).catch(() => null);
    if (!st?.isFile()) continue;
    const dbSt = await fs().stat(path().join(dir, name.replace(/\.json\.gz$/, ".db"))).catch(() => null);
    out.push({ name, size: st.size, createdAt: st.mtime.toISOString(), dbSize: dbSt?.size });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.name.localeCompare(a.name)));
}

/** Chỉ giữ `keep` bản mới nhất (xoá cả file .db đi kèm). */
export async function pruneBackups(workspaceId: string | undefined, keep: number) {
  const list = await listBackups(workspaceId);
  const dir = backupDir(workspaceId);
  const old = list.slice(Math.max(1, keep));
  for (const b of old) {
    await fs().rm(path().join(dir, b.name), { force: true });
    await fs().rm(path().join(dir, b.name.replace(/\.json\.gz$/, ".db")), { force: true });
  }
  return old.length;
}

const DAY = 24 * 3600_000;
const keepOf = (v: unknown, def = 14) => Math.max(1, Math.min(365, Math.round(Number(v)) || def));

/**
 * Job nền (mỗi giờ): mỗi workspace bật sao lưu (mặc định bật) có một bản mỗi ngày, giữ settings.backup.keep bản (mặc định 14).
 * Thêm một bản toàn hệ thống mỗi ngày (tắt bằng BACKUP_SYSTEM=0, số bản giữ BACKUP_KEEP).
 */
export async function autoBackup(): Promise<void> {
  const now = Date.now();
  const wss = await db.workspace.findMany({ select: { id: true, name: true, settingsJson: true } });
  for (const ws of wss) {
    const s = parseJson<Integrations>(ws.settingsJson, {}).backup;
    if (s?.enabled === "0") continue;
    try {
      const latest = (await listBackups(ws.id))[0];
      if (latest && now - new Date(latest.createdAt).getTime() < DAY) continue;
      const b = await createBackup(ws.id);
      const removed = await pruneBackups(ws.id, keepOf(s?.keep));
      await audit(ws.id, "backup", b.name, `Sao lưu tự động ${b.name} (${fmtSize(b.size)})${removed ? `, xoá ${removed} bản cũ` : ""}`);
    } catch (e) {
      console.error(`[backup] workspace ${ws.name}:`, e instanceof Error ? e.message : e);
    }
  }
  if (process.env.BACKUP_SYSTEM === "0") return;
  const latest = (await listBackups())[0];
  if (latest && now - new Date(latest.createdAt).getTime() < DAY) return;
  await createBackup();
  await pruneBackups(undefined, keepOf(process.env.BACKUP_KEEP));
}

const audit = (workspaceId: string, action: string, entityId: string, summary: string) => writeAudit({ workspaceId }, action, "backup", entityId, summary);

export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Đọc file sao lưu (đường dẫn hoặc nội dung), kiểm tra đúng định dạng. */
export async function readBackup(file: string | Buffer): Promise<BackupFile> {
  const raw = typeof file === "string" ? await fs().readFile(file) : file;
  let json: string;
  try {
    json = (raw[0] === 0x1f && raw[1] === 0x8b ? await gunz(raw) : raw).toString("utf8");
  } catch {
    throw new Error("File sao lưu bị hỏng (không giải nén được)");
  }
  let data: BackupFile;
  try {
    data = JSON.parse(json) as BackupFile;
  } catch {
    throw new Error("File sao lưu bị hỏng (JSON không hợp lệ)");
  }
  if (data?.format !== "dna-crm-backup" || !data.tables) throw new Error("Đây không phải file sao lưu của DNA CRM");
  return data;
}

/** Đổi một dòng JSON về dạng chèn được: chỉ giữ cột còn trong schema hiện tại, chuỗi ngày → Date. */
function revive(key: string, row: Row) {
  const out: Row = {};
  for (const f of fieldsOf(key)) {
    if (!(f.name in row)) continue;
    const v = row[f.name];
    out[f.name] = f.type === "DateTime" && typeof v === "string" ? new Date(v) : v;
  }
  return out;
}

const newId = () => `r${Date.now().toString(36)}${crypto().randomBytes(8).toString("hex")}`;

async function insert(tx: Tx, key: string, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) await table(tx, key).createMany({ data: rows.slice(i, i + 500) });
}

export type RestoreResult = { counts: Record<string, number>; remapped: boolean; schemaMismatch: boolean; sourceWorkspace: string };

/**
 * Khôi phục dữ liệu của MỘT workspace từ file sao lưu vào workspace `workspaceId`.
 * Trong một transaction: xoá dữ liệu cũ của workspace, rồi chèn lại theo thứ tự phụ thuộc.
 * Không đụng tới người dùng và thành viên (tránh tự khoá mình ngoài). Khôi phục sang workspace khác thì đổi id mới.
 */
export async function restoreBackup(file: string | Buffer, workspaceId: string, opts: { fromWorkspaceId?: string } = {}): Promise<RestoreResult> {
  const data = await readBackup(file);
  const target = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!target) throw new Error("Không tìm thấy workspace cần khôi phục");
  const wsRows = data.tables.workspace ?? [];
  const source =
    data.scope === "workspace"
      ? data.workspaceId
      : (opts.fromWorkspaceId ?? (wsRows.some((w) => w.id === workspaceId) ? workspaceId : wsRows.length === 1 ? String(wsRows[0].id) : undefined));
  if (!source) throw new Error(`Bản sao lưu có ${wsRows.length} workspace. Chỉ rõ workspace nguồn: ${wsRows.map((w) => `${w.id} (${w.name})`).join(", ")}`);
  const srcWs = wsRows.find((w) => w.id === source);
  if (data.scope === "all" && !srcWs) throw new Error("Bản sao lưu không có workspace nguồn này");

  // Lọc dòng của workspace nguồn.
  const picked: Record<string, Row[]> = {};
  const ids: Record<string, Set<string>> = {};
  for (const t of WS_TABLES) {
    const all = data.tables[t.key] ?? [];
    const rows = t.via ? all.filter((r) => ids[t.via!.parent]?.has(String(r[t.via!.field]))) : all.filter((r) => r.workspaceId === source);
    picked[t.key] = rows;
    ids[t.key] = new Set(rows.map((r) => String(r.id ?? "")));
  }

  const remapped = source !== workspaceId;
  const idMap: Record<string, Map<string, string>> = {};
  if (remapped) for (const t of WS_TABLES) idMap[t.key] = new Map(picked[t.key].filter((r) => typeof r.id === "string").map((r) => [String(r.id), newId()]));

  const ready: Record<string, Row[]> = {};
  for (const t of WS_TABLES) {
    ready[t.key] = picked[t.key].map((r0) => {
      const r = revive(t.key, r0);
      if ("workspaceId" in r) r.workspaceId = workspaceId;
      if (remapped) {
        if (typeof r.id === "string") r.id = idMap[t.key].get(r.id) ?? newId();
        for (const [f, parent] of Object.entries(REFS)) {
          if (typeof r[f] !== "string") continue;
          // Trỏ tới mục không còn trong bản sao lưu: cột bắt buộc giữ nguyên, cột tuỳ chọn bỏ liên kết.
          const required = fieldsOf(t.key).find((x) => x.name === f)?.isRequired;
          r[f] = idMap[parent]?.get(r[f] as string) ?? (required ? r[f] : null);
        }
      }
      return r;
    });
  }

  await db.$transaction(
    async (tx) => {
      // Xoá bảng con trước (Activity, Message theo bảng cha).
      for (const t of [...WS_TABLES].reverse()) {
        const where = t.via ? { [t.via.parent]: { workspaceId } } : { workspaceId };
        await table(tx, t.key).deleteMany({ where });
      }
      if (srcWs) {
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            settingsJson: typeof srcWs.settingsJson === "string" ? srcWs.settingsJson : target.settingsJson,
            industry: typeof srcWs.industry === "string" ? srcWs.industry : target.industry,
            onboarded: typeof srcWs.onboarded === "boolean" ? srcWs.onboarded : target.onboarded,
          },
        });
      }
      for (const t of WS_TABLES) await insert(tx, t.key, ready[t.key]);
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
  return {
    counts: Object.fromEntries(WS_TABLES.map((t) => [t.key, ready[t.key].length])),
    remapped,
    schemaMismatch: data.schemaVersion !== schemaVersion(),
    sourceWorkspace: String(srcWs?.name ?? data.workspaceName ?? source),
  };
}

/** Khôi phục TOÀN BỘ hệ thống từ bản sao lưu toàn hệ thống (chỉ dùng qua CLI, ghi đè mọi dữ liệu). */
export async function restoreAll(file: string | Buffer) {
  const data = await readBackup(file);
  if (data.scope !== "all") throw new Error("File này là bản của một workspace. Dùng restoreBackup(file, workspaceId).");
  const order = [...SYSTEM_TABLES, ...WS_TABLES.map((t) => t.key)];
  await db.$transaction(
    async (tx) => {
      for (const k of [...order].reverse()) await table(tx, k).deleteMany({});
      for (const k of order) await insert(tx, k, (data.tables[k] ?? []).map((r) => revive(k, r)));
    },
    { timeout: 600_000, maxWait: 20_000 },
  );
  return { counts: Object.fromEntries(order.map((k) => [k, data.tables[k]?.length ?? 0])), schemaMismatch: data.schemaVersion !== schemaVersion() };
}
