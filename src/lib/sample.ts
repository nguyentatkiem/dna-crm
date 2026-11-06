import { db } from "./db";
import type { FieldDef, WorkspaceConfig } from "./config/schema";
import { scoreContact } from "./records";
import { getScorecard, scoreCall } from "./calls";
import { seedInbox } from "./inbox";
import { seedMarketing } from "./marketing/sequences";
import { seedDocs } from "./docs";
import { seedDashboards } from "./dashboards";
import { refreshPredictions } from "./predict";

const NAMES = ["Nguyễn Thị Lan", "Trần Minh Khoa", "Lê Thu Hà", "Phạm Quốc Bảo", "Hoàng Ngọc Mai", "Vũ Đức Anh", "Đặng Thảo Vy", "Bùi Gia Huy", "Đỗ Phương Linh", "Ngô Thanh Tùng", "Dương Mỹ Duyên", "Lý Hoàng Nam", "Trịnh Khánh Ngân", "Phan Tuấn Kiệt"];
const COMPANIES = ["Cty TNHH Minh Phát", "CP Đại Tín", "Tân Hưng Logistics", "Hoàng Gia Foods", "An Khang Pharma", "Việt Á Steel"];
const AMOUNTS: Record<string, [number, number]> = {
  spa: [5e5, 8e6],
  bds: [2e9, 9e9],
  edu: [3e6, 25e6],
  retail: [2e5, 3e6],
  b2b: [5e7, 8e8],
  dental: [2e6, 8e7],
  fnb: [1e6, 3e7],
  auto: [4e8, 1.5e9],
  insurance: [1e7, 6e7],
  interior: [8e7, 1.2e9],
};

const SOURCES = [
  { _kenh: "ads", _nguon: "Facebook", _chien_dich: "Ưu đãi tháng này" },
  { _kenh: "zalo", _nguon: "Zalo OA" },
  { _kenh: "ads", _nguon: "Google Ads", _chien_dich: "Từ khoá thương hiệu" },
  { _kenh: "organic", _nguon: "Google" },
  { _kenh: "ads", _nguon: "TikTok", _chien_dich: "Video review" },
  { _kenh: "ecommerce", _nguon: "Shopee" },
  { _kenh: "website", _nguon: "Website" },
  { _kenh: "ads", _nguon: "Facebook", _chien_dich: "Khách quay lại" },
];

/** Dữ liệu mẫu đánh dấu rõ là mẫu để học viên thử ngay; có thể xoá trong Cài đặt. */
export async function seedSample(workspaceId: string, cfg: WorkspaceConfig) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const val = (f: FieldDef, i: number, name: string): string | number => {
    if (f.type === "select") return f.options.length ? pick(f.options).label : "";
    if (f.type === "phone") return "09" + String(Math.floor(rnd() * 1e8)).padStart(8, "0");
    if (f.type === "email") return `khach${i + 1}@email.vn`;
    if (f.type === "date") return new Date(Date.now() + (rnd() * 40 - 20) * 864e5).toISOString().slice(0, 10);
    if (f.type === "money") return Math.round(rnd() * 30 + 1) * 5e5;
    if (f.type === "number") return Math.floor(rnd() * 10) + 1;
    if (f.type === "rating") return Math.floor(rnd() * 5) + 1;
    if (f.type === "checkbox") return rnd() > 0.5 ? 1 : 0;
    if (f.type === "progress") return Math.round(rnd() * 10) * 10;
    if (f.type === "tags") return f.options.length ? [...new Set([pick(f.options).label, pick(f.options).label])].join(", ") : "";
    if (/công ty/i.test(f.label)) return COMPANIES[i % COMPANIES.length];
    if (/khách|học viên|bệnh nhân|chủ nhà/i.test(f.label)) return name;
    return "";
  };
  const [lo, hi] = AMOUNTS[cfg.industry] ?? [1e6, 1e7];
  for (const obj of cfg.objects) {
    const n = obj.key === "contacts" ? 14 : obj.key === "deals" ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const name = NAMES[(i + (obj.key === "deals" ? 0 : obj.key === "appointments" ? 3 : 0)) % NAMES.length];
      const data: Record<string, string | number> = {};
      obj.fields.forEach((f) => (data[f.key] = val(f, i, name)));
      if (obj.key === "contacts") Object.assign(data, SOURCES[i % SOURCES.length]);
      const raw = lo + rnd() * (hi - lo);
      const step = raw > 1e9 ? 1e8 : raw > 1e7 ? 1e6 : 1e5;
      const created = new Date(Date.now() - rnd() * 14 * 864e5);
      await db.record.create({
        data: {
          workspaceId,
          objectKey: obj.key,
          title: obj.key === "deals" && cfg.industry === "b2b" ? String(data["cong_ty"] || name) : name,
          status: obj.statuses[Math.floor(rnd() * obj.statuses.length)].key,
          ownerName: pick(cfg.team),
          amount: obj.key === "deals" ? Math.round(raw / step) * step : 0,
          score: obj.key === "contacts" ? Math.min(98, Math.round(scoreContact(data, cfg) * (0.55 + rnd() * 0.6))) : 0,
          dataJson: JSON.stringify(data),
          createdAt: created,
          activities: { create: [{ kind: "system", body: "Dữ liệu mẫu để bạn thử hệ thống", author: "Hệ thống", createdAt: created }] },
        },
      });
    }
  }
  const t = cfg.terminology;
  const today = new Date();
  const d = (n: number) => new Date(today.getTime() + n * 864e5);
  await db.task.createMany({
    data: [
      { workspaceId, title: `Gọi lại ${NAMES[0]}`, dueAt: d(0), source: "Bạn" },
      { workspaceId, title: `Gửi tin chăm sóc cho 6 ${t.contact.toLowerCase()} lâu chưa quay lại`, dueAt: d(0), source: "Care & Retention" },
      { workspaceId, title: `Cập nhật ${t.deal.toLowerCase()} của ${NAMES[5]}`, dueAt: d(-2), source: "Sales Coach" },
      { workspaceId, title: `Chuẩn bị nội dung ưu đãi cuối tháng`, dueAt: d(4), source: "Bạn" },
      { workspaceId, title: `Xin đánh giá từ ${NAMES[2]}`, dueAt: null, source: "Tự động hoá" },
    ],
  });
  await seedCalls(workspaceId, cfg);
  // Mỗi module tự gieo dữ liệu mẫu của mình; lỗi ở một module không chặn các module khác.
  for (const [name, fn] of [
    ["inbox", seedInbox],
    ["marketing", seedMarketing],
    ["docs", seedDocs],
    ["dashboards", seedDashboards],
  ] as const) {
    await fn(workspaceId, cfg).catch((e) => console.error(`[sample ${name}]`, e instanceof Error ? e.message : e));
  }
  await refreshPredictions(workspaceId).catch(() => undefined);
}

/** Bản chép lời mẫu: tốt, trung bình, yếu. Đủ để thấy Call Analyst, bảng xếp hạng và vòng phản hồi hoạt động. */
function transcripts(biz: string, name: string) {
  const first = name.split(" ").pop();
  return {
    good: `NV: Dạ em chào chị ${first}, em là Thảo bên ${biz}. Chị cho em xin 2 phút, mình có tiện nghe máy không ạ?
KH: Ừ em nói đi.
NV: Dạ em thấy chị vừa để lại thông tin quan tâm bên em. Hiện tại chị đang mong muốn cải thiện điều gì nhất ạ?
KH: Chị muốn tìm gói phù hợp, nhưng sợ giá cao.
NV: Dạ em hiểu ạ. Chị dự định khi nào bắt đầu, ngân sách khoảng bao nhiêu để em tư vấn đúng nhu cầu?
KH: Tầm tháng này, khoảng vài triệu thôi.
NV: Dạ vậy gói cơ bản rất phù hợp với chị, giúp chị tiết kiệm mà vẫn hiệu quả. Nhiều khách lúc đầu cũng băn khoăn về giá, nhưng bên em có cam kết rõ ràng nên chị yên tâm ạ.
KH: Nghe được đó.
NV: Dạ vậy em đặt lịch cho chị vào thứ bảy lúc 10 giờ nhé, em gửi tin xác nhận qua Zalo cho chị ạ. Cảm ơn chị nhiều ạ!`,
    ok: `NV: Alo chị ${first} phải không ạ, em bên ${biz}.
KH: Ừ.
NV: Dạ bên em đang có ưu đãi, chị quan tâm không ạ?
KH: Ưu đãi gì em?
NV: Dạ giảm 20% cho khách mới, gói này hiệu quả lắm chị.
KH: Để chị suy nghĩ đã.
NV: Dạ vâng, có gì chị nhắn em nha. Cảm ơn chị ạ.`,
    weak: `NV: Alo, bên ${biz} đây.
KH: Ai đấy?
NV: Bên em bán dịch vụ, chị có muốn mua không?
KH: Giá bao nhiêu?
NV: Tuỳ gói, chị lên web xem nha.
KH: Thôi chị bận.
NV: Vâng.`,
  };
}

async function seedCalls(workspaceId: string, cfg: WorkspaceConfig) {
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, take: 12, orderBy: { createdAt: "asc" } });
  const team = cfg.team.length ? cfg.team : ["Bạn"];
  await getScorecard(workspaceId, cfg);
  const plan: [keyof ReturnType<typeof transcripts> | null, string, number][] = [
    ["good", "appointment", 312],
    ["ok", "callback", 96],
    ["weak", "not_interested", 41],
    ["good", "won", 420],
    [null, "no_answer", 0],
    ["ok", "connected", 133],
    ["good", "appointment", 285],
    ["weak", "callback", 52],
    [null, "busy", 0],
    ["ok", "not_interested", 88],
  ];
  for (let i = 0; i < Math.min(plan.length, contacts.length); i++) {
    const [kind, outcome, duration] = plan[i];
    const r = contacts[i];
    const call = await db.call.create({
      data: {
        workspaceId,
        recordId: r.id,
        phone: "",
        agentName: team[i % team.length],
        outcome,
        durationSec: duration,
        transcript: kind ? transcripts(cfg.businessName, r.title)[kind] : "",
        callbackAt: outcome === "callback" ? new Date(Date.now() - 3600e3) : null,
        startedAt: new Date(Date.now() - (i * 7 + 2) * 3600e3),
      },
    });
    if (kind) await scoreCall(call, { rulesOnly: true });
  }
  const reviews: [string, number, string][] = [
    ["appointment", -8, "Chốt lịch tốt nhưng chưa hỏi ai cùng quyết định, dễ bị huỷ lịch."],
    ["callback", -15, "Chưa hỏi nhu cầu và ngân sách, hẹn gọi lại không có giờ cụ thể."],
  ];
  for (const [outcome, delta, note] of reviews) {
    const c = await db.call.findFirst({ where: { workspaceId, outcome, aiScore: { not: null } }, orderBy: { startedAt: "asc" } });
    if (c) await db.call.update({ where: { id: c.id }, data: { reviewScore: Math.max(0, Math.min(100, (c.aiScore ?? 50) + delta)), reviewNote: note, reviewedBy: "Chủ Demo", reviewedAt: new Date() } });
  }
}