import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { setPref } from "@/lib/prefs";
import { backupPath, listBackups } from "@/lib/backup";
import { PREF_KEY, getRemote, maskRemote, pushRemote, testRemote, type RemoteCfg } from "@/lib/backup-remote";
import { ownerApi } from "../guard";

/** Cấu hình sao lưu ra ngoài (khoá bí mật đã che). */
export async function GET() {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  return ok(maskRemote(await getRemote(a.ctx.workspace.id)));
}

type Body = Partial<Omit<RemoteCfg, "keep">> & { keep?: number | string; action?: "test" | "push" };

/** Gộp dữ liệu form vào cấu hình đang lưu. secretAccessKey để trống = giữ khoá cũ. */
function merge(cur: RemoteCfg, b: Body): RemoteCfg {
  const str = (v: unknown, d: string) => (typeof v === "string" ? v.trim() : d);
  return {
    ...cur,
    enabled: typeof b.enabled === "boolean" ? b.enabled : cur.enabled,
    endpoint: str(b.endpoint, cur.endpoint).replace(/\/+$/, ""),
    region: str(b.region, cur.region) || "us-east-1",
    bucket: str(b.bucket, cur.bucket),
    prefix: str(b.prefix, cur.prefix),
    accessKeyId: str(b.accessKeyId, cur.accessKeyId),
    secretAccessKey: b.secretAccessKey ? String(b.secretAccessKey).trim() : cur.secretAccessKey,
    keep: Math.max(1, Math.min(365, Math.round(Number(b.keep ?? cur.keep)) || 30)),
  };
}

export async function PUT(req: Request) {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const next = merge(await getRemote(wid), (await req.json().catch(() => ({}))) as Body);
  if (next.endpoint && !/^https?:\/\//.test(next.endpoint)) return fail("Endpoint phải bắt đầu bằng https://");
  if (next.enabled && !(next.endpoint && next.bucket && next.accessKeyId && next.secretAccessKey)) return fail("Cần điền endpoint, bucket, Access Key ID và Secret Access Key trước khi bật");
  await setPref(wid, PREF_KEY, next);
  await audit({ workspaceId: wid, user: a.ctx.user }, "backup.remote", "backup", "", `${next.enabled ? "Bật" : "Tắt"} sao lưu ra ngoài${next.bucket ? ` (bucket ${next.bucket})` : ""}`);
  return ok(maskRemote(next));
}

/** { action: "test", ...form } thử ghi/xoá file nhỏ; { action: "push" } đẩy bản mới nhất ngay. */
export async function POST(req: Request) {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const b = (await req.json().catch(() => ({}))) as Body;
  if (b.action === "test") {
    const err = await testRemote(merge(await getRemote(wid), b));
    return err ? fail(err) : ok({ ok: true });
  }
  if (b.action === "push") {
    const latest = (await listBackups(wid))[0];
    if (!latest) return fail("Chưa có bản sao lưu nào. Bấm Sao lưu ngay trước.");
    const r = await pushRemote(wid, backupPath(latest.name, wid)!, latest.name);
    if (!r.ok) return fail(r.error ?? "Không đẩy được");
    await audit({ workspaceId: wid, user: a.ctx.user }, "backup.remote_push", "backup", latest.name, `Đẩy ${latest.name} lên kho ngoài${r.removed ? `, xoá ${r.removed} bản cũ trên kho` : ""}`);
    return ok({ name: latest.name, removed: r.removed, cfg: maskRemote(await getRemote(wid)) });
  }
  return fail("Thao tác không hợp lệ");
}
