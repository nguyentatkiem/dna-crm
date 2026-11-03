import { db } from "./db";
import type { FieldDef, WorkspaceConfig } from "./config/schema";
import { scoreContact } from "./records";

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
}
