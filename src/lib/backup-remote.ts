// Sao lưu ra ngoài máy chủ (offsite): đẩy bản sao lưu lên kho S3-compatible — AWS S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi...
// Tự ký AWS Signature V4 bằng node:crypto + fetch, không dùng SDK. Cấu hình ở Pref "backupRemote" của từng workspace.
// Khoá bí mật (secretAccessKey) không bao giờ trả về trình duyệt.
//
// Module Node lấy lúc chạy (giống backup.ts): file này nằm trong chuỗi jobs → instrumentation, bản Edge không được import node:*.
import { getPref, setPref } from "./prefs";

const crypto = () => process.getBuiltinModule("node:crypto");
const fsp = () => process.getBuiltinModule("node:fs/promises");

export type RemoteCfg = {
  enabled: boolean;
  endpoint: string; // vd. https://s3.ap-southeast-1.amazonaws.com, https://<account>.r2.cloudflarestorage.com
  region: string; // R2: "auto"; B2: vd. "us-west-004"
  bucket: string;
  prefix: string; // thư mục trong bucket, vd. "dna-crm/"
  accessKeyId: string;
  secretAccessKey: string;
  keep: number; // số bản giữ trên kho ngoài
  /** Kết quả lần đẩy gần nhất (để trang Kiểm tra kết nối hiển thị). */
  lastAt?: string;
  lastOk?: boolean;
  lastError?: string;
  lastName?: string;
};
export const REMOTE_DEFAULT: RemoteCfg = { enabled: false, endpoint: "", region: "us-east-1", bucket: "", prefix: "dna-crm/", accessKeyId: "", secretAccessKey: "", keep: 30 };
export const PREF_KEY = "backupRemote";

export const getRemote = (workspaceId: string) => getPref<RemoteCfg>(workspaceId, PREF_KEY, REMOTE_DEFAULT);
export const remoteConfigured = (c: RemoteCfg) => !!(c.enabled && c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);

/** Bản an toàn để gửi trình duyệt: che khoá bí mật. */
export function maskRemote(c: RemoteCfg) {
  const { secretAccessKey, ...rest } = c;
  return { ...rest, accessKeyId: c.accessKeyId, secretSet: !!secretAccessKey, secretHint: secretAccessKey ? `••••${secretAccessKey.slice(-4)}` : "" };
}

// ======================= AWS Signature V4 =======================

const sha256hex = (d: string | Buffer) => crypto().createHash("sha256").update(d).digest("hex");
const hmac = (k: string | Buffer, d: string) => crypto().createHmac("sha256", k).update(d).digest();

/** Mã hoá URI theo quy tắc AWS (RFC 3986, giữ A-Z a-z 0-9 - _ . ~). */
export const uriEncode = (s: string, keepSlash = false) =>
  [...Buffer.from(s, "utf8")]
    .map((b) => {
      const c = String.fromCharCode(b);
      if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === "/")) return c;
      return `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");

export function signingKey(secret: string, date: string, region: string, service: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

export type SignInput = {
  method: string;
  url: string; // đã gồm query
  headers: Record<string, string>; // phải có host hoặc sẽ tự thêm
  body?: string | Buffer;
  /** Băm nội dung đã tính sẵn ("UNSIGNED-PAYLOAD" cũng được với S3). Bỏ trống = tự băm body. */
  payloadHash?: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Dạng 20150830T123600Z. */
  amzDate: string;
  /** S3 không mã hoá đường dẫn hai lần; dịch vụ khác thì có. */
  doubleEncodePath?: boolean;
};

/** Trả header Authorization và chuỗi trung gian (để kiểm thử). Không thêm header nào vào input. */
export function signV4(i: SignInput) {
  const u = new URL(i.url);
  const date = i.amzDate.slice(0, 8);
  const hdrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.headers)) hdrs[k.toLowerCase()] = String(v).trim().replace(/\s+/g, " ");
  if (!hdrs.host) hdrs.host = u.host;
  const names = Object.keys(hdrs).sort();
  const canonHeaders = names.map((n) => `${n}:${hdrs[n]}\n`).join("");
  const signedHeaders = names.join(";");
  // Đường dẫn: mỗi đoạn mã hoá lại theo AWS (S3: một lần trên đoạn đã giải mã).
  const segs = u.pathname.split("/").map((s) => decodeURIComponent(s));
  let path = segs.map((s) => uriEncode(s)).join("/") || "/";
  if (i.doubleEncodePath) path = path.split("/").map((s) => uriEncode(s)).join("/");
  const q = [...u.searchParams.entries()].map(([k, v]) => [uriEncode(k), uriEncode(v)] as const).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const canonQuery = q.map(([k, v]) => `${k}=${v}`).join("&");
  const payloadHash = i.payloadHash ?? sha256hex(i.body ?? "");
  const canonical = [i.method.toUpperCase(), path, canonQuery, canonHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", i.amzDate, scope, sha256hex(canonical)].join("\n");
  const signature = crypto().createHmac("sha256", signingKey(i.secretAccessKey, date, i.region, i.service)).update(stringToSign).digest("hex");
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    canonical,
    stringToSign,
    signature,
  };
}

const amzNow = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** URL kiểu path-style: <endpoint>/<bucket>/<key> (chạy với mọi nhà cung cấp S3-compatible). */
function objectUrl(c: RemoteCfg, key = "", query = "") {
  const base = c.endpoint.replace(/\/+$/, "");
  const k = key ? `/${key.split("/").map((s) => uriEncode(s)).join("/")}` : "/";
  return `${base}/${uriEncode(c.bucket)}${k}${query ? `?${query}` : ""}`;
}

async function s3(c: RemoteCfg, method: string, key: string, opts: { body?: Buffer; query?: string; contentType?: string } = {}) {
  const url = objectUrl(c, key, opts.query);
  const amzDate = amzNow();
  const payloadHash = sha256hex(opts.body ?? "");
  const headers: Record<string, string> = { host: new URL(url).host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (opts.contentType) headers["content-type"] = opts.contentType;
  const { authorization } = signV4({ method, url, headers, payloadHash, region: c.region || "us-east-1", service: "s3", accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, amzDate });
  const { host: _h, ...send } = headers;
  const res = await fetch(url, { method, headers: { ...send, authorization }, body: opts.body ? new Uint8Array(opts.body) : undefined, signal: AbortSignal.timeout(120_000) });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(explainS3(res.status, text));
  return text;
}

/** Lỗi S3 → câu tiếng Việt (không chứa khoá). */
export function explainS3(status: number, xml: string) {
  const code = xml.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? "";
  const map: Record<string, string> = {
    InvalidAccessKeyId: "Access Key ID không đúng",
    SignatureDoesNotMatch: "Secret Access Key không đúng (hoặc sai vùng/region)",
    NoSuchBucket: "Không tìm thấy bucket",
    AccessDenied: "Khoá không có quyền ghi/xoá trên bucket này",
    AuthorizationHeaderMalformed: "Sai vùng (region) của bucket",
    PermanentRedirect: "Bucket nằm ở vùng khác: kiểm tra endpoint và region",
    RequestTimeTooSkewed: "Đồng hồ máy chủ lệch quá nhiều so với giờ chuẩn",
  };
  return map[code] ?? `Kho lưu trữ trả lỗi ${status}${code ? ` (${code})` : ""}`;
}

/** Lỗi mạng của fetch → câu dễ hiểu. */
function netError(e: unknown) {
  if (!(e instanceof Error)) return "Không kết nối được kho lưu trữ";
  if (e.name === "TimeoutError") return "Hết thời gian chờ kết nối kho lưu trữ";
  if (e.message === "fetch failed") return "Không kết nối được tới endpoint: kiểm tra địa chỉ, tên miền và tường lửa";
  return e.message;
}

const cleanPrefix = (c: RemoteCfg) => (c.prefix || "").replace(/^\/+|\/+$/g, "");
const keyFor = (c: RemoteCfg, workspaceId: string, name: string) => [cleanPrefix(c), workspaceId, name].filter(Boolean).join("/");

/** Thử kết nối: ghi một file nhỏ rồi xoá. Trả thông báo lỗi tiếng Việt hoặc null nếu ổn. */
export async function testRemote(c: RemoteCfg): Promise<string | null> {
  if (!c.endpoint || !c.bucket || !c.accessKeyId || !c.secretAccessKey) return "Chưa điền đủ endpoint, bucket và khoá truy cập";
  if (!/^https:\/\//.test(c.endpoint) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(c.endpoint)) return "Endpoint phải bắt đầu bằng https://";
  const key = [cleanPrefix(c), `.dna-crm-test-${Date.now()}.txt`].filter(Boolean).join("/");
  try {
    await s3(c, "PUT", key, { body: Buffer.from("DNA CRM test"), contentType: "text/plain" });
    await s3(c, "DELETE", key);
    return null;
  } catch (e) {
    return netError(e);
  }
}

/** Liệt kê các bản sao lưu của workspace trên kho ngoài (ListObjectsV2). */
export async function listRemote(c: RemoteCfg, workspaceId: string) {
  const prefix = `${keyFor(c, workspaceId, "")}/`;
  const out: { key: string; size: number; lastModified: string }[] = [];
  let token = "";
  for (let page = 0; page < 20; page++) {
    const q = [`list-type=2`, `prefix=${uriEncode(prefix)}`, ...(token ? [`continuation-token=${uriEncode(token)}`] : [])].join("&");
    const xml = await s3(c, "GET", "", { query: q });
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const k = m[1].match(/<Key>([^<]+)<\/Key>/)?.[1] ?? "";
      out.push({ key: k.replace(/&amp;/g, "&"), size: Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0), lastModified: m[1].match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] ?? "" });
    }
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? "";
    if (!token) break;
  }
  return out.sort((a, b) => (a.key < b.key ? 1 : -1));
}

/**
 * Đẩy một bản sao lưu lên kho ngoài rồi dọn bản cũ (giữ c.keep bản). Ghi kết quả vào Pref để hiển thị.
 * Không ném lỗi: trả { ok, error }.
 */
export async function pushRemote(workspaceId: string, filePath: string, name: string): Promise<{ ok: boolean; error?: string; removed?: number }> {
  const c = await getRemote(workspaceId);
  if (!remoteConfigured(c)) return { ok: false, error: "Chưa bật sao lưu ra ngoài" };
  let removed = 0;
  try {
    const body = await fsp().readFile(filePath);
    await s3(c, "PUT", keyFor(c, workspaceId, name), { body, contentType: "application/gzip" });
    const list = (await listRemote(c, workspaceId)).filter((o) => /\.json\.gz$/.test(o.key));
    for (const o of list.slice(Math.max(1, c.keep || 30))) {
      await s3(c, "DELETE", o.key).catch(() => undefined);
      removed++;
    }
    await setPref(workspaceId, PREF_KEY, { ...c, lastAt: new Date().toISOString(), lastOk: true, lastError: "", lastName: name });
    return { ok: true, removed };
  } catch (e) {
    const error = netError(e);
    await setPref(workspaceId, PREF_KEY, { ...c, lastAt: new Date().toISOString(), lastOk: false, lastError: error, lastName: name });
    return { ok: false, error };
  }
}
