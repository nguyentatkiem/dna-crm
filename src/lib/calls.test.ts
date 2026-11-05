import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@prisma/client";
import { buildTemplate } from "./config/templates";
import { defaultDna } from "./dna";

// Không cần database thật: thay db bằng mock, AI trả null để chạy bản chấm theo luật.
const m = vi.hoisted(() => ({
  update: vi.fn(),
  task: vi.fn(),
  activity: vi.fn(),
  log: vi.fn(),
  cfg: null as unknown,
}));
vi.mock("./db", () => ({
  parseJson: (s: string, f: unknown) => {
    try {
      return s ? JSON.parse(s) : f;
    } catch {
      return f;
    }
  },
  db: {
    scorecard: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: { data: object }) => ({ id: "sc1", ...data })) },
    call: { update: m.update, findMany: vi.fn(async () => []) },
    activity: { create: m.activity },
    task: { create: m.task },
    agentLog: { create: m.log },
  },
}));
vi.mock("./ai", () => ({ ai: () => null, MODEL: "test" }));
vi.mock("./sources/ingest", () => ({ loadConfig: vi.fn(async () => m.cfg) }));

import { defaultCriteria, defaultScript, scoreCall } from "./calls";

const cfg = buildTemplate(defaultDna("spa"));
m.cfg = cfg;

const call = (transcript: string, outcome = "connected"): Call =>
  ({ id: "c1", workspaceId: "w1", recordId: "r1", agentName: "Lan", outcome, transcript, note: "" }) as unknown as Call;

const GOOD = `Dạ em chào chị, em là Lan bên Hương Spa ạ. Chị có tiện nghe máy không ạ?
Hiện tại chị đang quan tâm vấn đề gì về da, nhu cầu của mình thế nào, ngân sách khoảng bao nhiêu và khi nào chị muốn bắt đầu?
Dạ em hiểu băn khoăn về giá ạ. Thật ra nhiều khách cũng vậy, bên em cam kết hiệu quả, gói này rất phù hợp và giúp da sáng hơn, chị yên tâm.
Em đặt lịch cho chị thứ bảy lúc 9 giờ nhé, em xác nhận lại và gửi báo giá qua Zalo. Cảm ơn chị ạ.`;

describe("defaultCriteria", () => {
  it("tổng trọng số bằng 100, khoá không trùng, mỗi tiêu chí có từ khoá", () => {
    const c = defaultCriteria(cfg);
    expect(c.reduce((s, x) => s + x.weight, 0)).toBe(100);
    expect(new Set(c.map((x) => x.key)).size).toBe(c.length);
    for (const x of c) expect(x.keywords.length).toBeGreaterThan(0);
  });
  it("dùng thuật ngữ của ngành", () => {
    expect(defaultCriteria(cfg).find((x) => x.key === "tu_van")?.label).toContain(cfg.terminology.deal.toLowerCase());
    expect(defaultScript(cfg)).toContain(cfg.businessName);
  });
});

describe("scoreCall (bản luật khi chưa có API key)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bỏ qua cuộc gọi chưa có bản chép lời", async () => {
    expect(await scoreCall(call("   "))).toBeNull();
    expect(m.update).not.toHaveBeenCalled();
  });

  it("cuộc gọi tốt được điểm cao, không tạo việc huấn luyện", async () => {
    const r = await scoreCall(call(GOOD, "appointment"));
    expect(r?.source).toBe("rules");
    expect(r!.total).toBeGreaterThanOrEqual(60);
    expect(r!.total).toBeLessThanOrEqual(100);
    expect(r!.sentiment).toBe("tich_cuc");
    expect(r!.criteria.find((c) => c.key === "chot")!.score).toBeGreaterThanOrEqual(8);
    expect(r!.objections.some((o) => o.includes("giá cao") || o.includes("đắt"))).toBe(false);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ aiScore: r!.total }) }));
    expect(m.task).not.toHaveBeenCalled();
  });

  it("cuộc gọi sơ sài bị điểm thấp, ghi nhận từ chối và tạo việc luyện tập", async () => {
    const r = await scoreCall(call("Alo. Bên em bán mỹ phẩm. Chị thấy đắt quá à, để chị suy nghĩ.", "not_interested"));
    expect(r!.total).toBeLessThan(60);
    expect(r!.sentiment).toBe("tieu_cuc");
    expect(r!.objections.length).toBeGreaterThanOrEqual(2);
    expect(r!.improvements.length).toBeGreaterThan(0);
    expect(m.task).toHaveBeenCalledTimes(1);
  });

  it("điểm từng tiêu chí nằm trong 0–10 và có bằng chứng", async () => {
    const r = await scoreCall(call(GOOD));
    for (const c of r!.criteria) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(10);
      expect(c.evidence.length).toBeGreaterThan(0);
    }
  });
});
