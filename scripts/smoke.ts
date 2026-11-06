// Kiểm tra khói: gọi các trang và API chính của server đang chạy, in bảng ✓/✗.
// Cách dùng:  npm run smoke                     (mặc định http://localhost:3210)
//             BASE_URL=https://crm.cuaban.vn SMOKE_EMAIL=... SMOKE_PASSWORD=... npm run smoke
// Chỉ ĐỌC dữ liệu (GET), không tạo / sửa / xoá gì. Cần tài khoản demo (npm run demo) hoặc tài khoản thật.
const BASE = (process.env.BASE_URL || "http://localhost:3210").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL || "demo@dnacrm.local";
const PASSWORD = process.env.SMOKE_PASSWORD || "demo12345";

type Check = { name: string; path: string; expect?: "html" | "json" | "xlsx" };
const PAGES: Check[] = [
  ["Trang chủ", "/w"],
  ["Bảng khách", "/w/b/contacts"],
  ["Bảng giao dịch", "/w/b/deals"],
  ["Việc của tôi", "/w/my-work"],
  ["Telesales", "/w/telesales"],
  ["Nguồn khách", "/w/sources"],
  ["Hộp thư", "/w/inbox"],
  ["Marketing", "/w/marketing"],
  ["Dashboard", "/w/dashboards"],
  ["Tài liệu", "/w/docs"],
  ["Tự động hoá", "/w/automations"],
  ["AI Agents", "/w/agents"],
  ["Cài đặt", "/w/settings"],
  ["Sao lưu", "/w/settings/backup"],
  ["Thùng rác", "/w/trash"],
].map(([name, path]) => ({ name, path, expect: "html" as const }));
const APIS: Check[] = [
  { name: "API bản ghi", path: "/api/records?object=contacts", expect: "json" },
  { name: "API việc", path: "/api/tasks", expect: "json" },
  { name: "API tự động hoá", path: "/api/automations", expect: "json" },
  { name: "API thông báo", path: "/api/notifications", expect: "json" },
  { name: "API tìm kiếm", path: "/api/search?q=a", expect: "json" },
  { name: "API thành viên", path: "/api/members", expect: "json" },
  { name: "API cuộc gọi", path: "/api/calls", expect: "json" },
  { name: "API hộp thư", path: "/api/inbox", expect: "json" },
  { name: "API kịch bản chăm sóc", path: "/api/marketing/sequences", expect: "json" },
  { name: "API kênh marketing", path: "/api/marketing/channels", expect: "json" },
  { name: "API dashboard", path: "/api/dashboards", expect: "json" },
  { name: "API tài liệu", path: "/api/docs", expect: "json" },
  { name: "API dự báo", path: "/api/predict", expect: "json" },
  { name: "API sao lưu", path: "/api/backup", expect: "json" },
  { name: "API thùng rác", path: "/api/trash", expect: "json" },
  { name: "API nhật ký bảng", path: "/api/records/activity?object=deals", expect: "json" },
  { name: "Xuất Excel", path: "/api/records/export?object=contacts", expect: "xlsx" },
  { name: "Xuất CSV", path: "/api/records/export?object=contacts&format=csv" },
  { name: "File mẫu nhập", path: "/api/records/import/template?object=contacts", expect: "xlsx" },
];

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }), redirect: "manual" });
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).find((c) => c.startsWith("crm_session="));
  if (!res.ok || !cookie) throw new Error(`Đăng nhập ${EMAIL} thất bại (HTTP ${res.status}). Chạy "npm run demo" hoặc đặt SMOKE_EMAIL / SMOKE_PASSWORD.`);
  return cookie;
}

async function check(c: Check, cookie: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + c.path, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
    const ms = Date.now() - t0;
    if (res.status >= 300 && res.status < 400) return { ok: false, ms, note: `chuyển hướng → ${res.headers.get("location")}` };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = body.match(/"error":"([^"]+)"/)?.[1] ?? (res.status === 404 ? "chưa có trang/API này" : "");
      return { ok: false, ms, note: `HTTP ${res.status}${err ? ` · ${err}` : ""}` };
    }
    const type = res.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (c.expect === "xlsx" && !(buf[0] === 0x50 && buf[1] === 0x4b)) return { ok: false, ms, note: "không phải file .xlsx" };
    if (c.expect === "json" && !type.includes("json")) return { ok: false, ms, note: `trả ${type || "không rõ kiểu"}` };
    if (c.expect === "html") {
      const html = new TextDecoder().decode(buf);
      if (/Application error|Unhandled Runtime Error|__next_error__/.test(html)) return { ok: false, ms, note: "trang báo lỗi" };
    }
    return { ok: true, ms, note: `${(buf.length / 1024).toFixed(0)} KB` };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, note: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log(`Kiểm tra khói ${BASE}\n`);
  let cookie: string;
  try {
    cookie = await login();
    console.log(`✓ Đăng nhập ${EMAIL}\n`);
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  let fail = 0;
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length));
  for (const group of [["Trang", PAGES], ["API", APIS]] as const) {
    console.log(group[0]);
    for (const c of group[1]) {
      const r = await check(c, cookie);
      if (!r.ok) fail++;
      console.log(`  ${r.ok ? "✓" : "✗"} ${pad(c.name, 24)} ${pad(c.path, 46)} ${String(r.ms).padStart(6)} ms  ${r.note}`);
    }
    console.log("");
  }
  const total = PAGES.length + APIS.length;
  console.log(fail ? `✗ ${fail}/${total} mục lỗi` : `✓ Tất cả ${total} mục chạy tốt`);
  process.exitCode = fail ? 1 : 0;
}

main();
