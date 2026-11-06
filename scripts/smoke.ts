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
  ["Sản phẩm", "/w/products"],
  ["Báo giá", "/w/quotes"],
  ["Tạo báo giá", "/w/quotes/new"],
  ["Đơn hàng", "/w/orders"],
  ["Công nợ", "/w/orders/debts"],
  ["Hợp đồng", "/w/contracts"],
  ["Thông tin doanh nghiệp", "/w/settings/company"],
  ["Phiếu hỗ trợ", "/w/tickets"],
  ["Khách thân thiết", "/w/loyalty"],
  ["Bảo hành", "/w/warranty"],
  ["Nhóm khách", "/w/segments"],
  ["Gửi hàng loạt", "/w/broadcasts"],
  ["Soạn gửi hàng loạt", "/w/broadcasts/new"],
  ["Landing page", "/w/landing"],
  ["Phễu chuyển đổi", "/w/funnel"],
  ["KPI", "/w/kpi"],
  ["Bảng tin", "/w/feed"],
  ["Bảo mật dữ liệu", "/w/settings/privacy"],
  ["Hồ sơ trùng lặp", "/w/duplicates"],
  ["Phân tích RFM", "/w/rfm"],
  ["Chấm điểm khách", "/w/settings/scoring"],
  ["Khảo sát", "/w/surveys"],
  ["Tạo khảo sát", "/w/surveys/new"],
  ["Voucher", "/w/vouchers"],
  ["Đánh giá nhân viên", "/w/perf"],
  ["Tổng quan hiệu suất", "/w/perf/overview"],
  ["Vai trò & quyền", "/w/settings/roles"],
  ["Bài viết fanpage", "/w/inbox/posts"],
  ["Trang đã kết nối", "/w/inbox/pages"],
  ["Trả lời nhanh", "/w/inbox/quick-replies"],
  ["Cài đặt hộp thư", "/w/inbox/settings"],
  ["Thống kê hộp thư", "/w/inbox/stats"],
  ["Hoa hồng", "/w/perf/commission"],
  ["Phòng ban / đội", "/w/settings/teams"],
  ["Quyền & bố cục trường", "/w/settings/fields"],
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
  { name: "API sản phẩm", path: "/api/products", expect: "json" },
  { name: "API hồ sơ trùng", path: "/api/c360/duplicates", expect: "json" },
  { name: "API kiểm tra trùng", path: "/api/c360/duplicates/check?phone=0900000000", expect: "json" },
  { name: "API chấm điểm", path: "/api/c360/scoring", expect: "json" },
  { name: "API khảo sát", path: "/api/surveys", expect: "json" },
  { name: "API voucher", path: "/api/vouchers", expect: "json" },
  { name: "API đội", path: "/api/teams", expect: "json" },
  { name: "API đánh giá", path: "/api/perf", expect: "json" },
  { name: "API hoa hồng", path: "/api/perf/commission", expect: "json" },
  { name: "API tổng quan hiệu suất", path: "/api/perf/overview?range=30d", expect: "json" },
  { name: "Xuất hiệu suất", path: "/api/perf/overview/export", expect: "xlsx" },
  { name: "API điểm hiệu suất", path: "/api/perf/score", expect: "json" },
  { name: "API vai trò", path: "/api/roles", expect: "json" },
  { name: "API hộp thư lọc", path: "/api/inbox?kind=comment&unreplied=1", expect: "json" },
  { name: "API bài viết", path: "/api/inbox/posts", expect: "json" },
  { name: "API trang", path: "/api/inbox/pages", expect: "json" },
  { name: "API trả lời nhanh", path: "/api/inbox/quick-replies", expect: "json" },
  { name: "API thẻ hội thoại", path: "/api/inbox/tags", expect: "json" },
  { name: "API link m.me", path: "/api/inbox/mme", expect: "json" },
  { name: "API cài đặt hộp thư", path: "/api/inbox/settings", expect: "json" },
  { name: "API thống kê hộp thư", path: "/api/inbox/stats", expect: "json" },
  { name: "Xuất thống kê hộp thư", path: "/api/inbox/stats?format=xlsx", expect: "xlsx" },
  { name: "API dạng xem", path: "/api/views?object=contacts", expect: "json" },
  { name: "API báo giá", path: "/api/quotes", expect: "json" },
  { name: "API đơn hàng", path: "/api/orders", expect: "json" },
  { name: "API hợp đồng", path: "/api/contracts", expect: "json" },
  { name: "API phiếu hỗ trợ", path: "/api/tickets?status=all", expect: "json" },
  { name: "API tích điểm", path: "/api/loyalty", expect: "json" },
  { name: "API bảo hành", path: "/api/warranty", expect: "json" },
  { name: "API nhóm khách", path: "/api/segments", expect: "json" },
  { name: "API gửi hàng loạt", path: "/api/broadcasts", expect: "json" },
  { name: "API landing page", path: "/api/landing", expect: "json" },
  { name: "API phễu", path: "/api/funnel", expect: "json" },
  { name: "API KPI", path: "/api/kpi", expect: "json" },
  { name: "API bảng tin", path: "/api/feed", expect: "json" },
  { name: "API bảo mật", path: "/api/privacy", expect: "json" },
  { name: "Manifest app", path: "/manifest.webmanifest" },
  { name: "Service worker", path: "/sw.js" },
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
