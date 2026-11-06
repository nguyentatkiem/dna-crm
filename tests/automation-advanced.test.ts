import { describe, expect, it } from "vitest";
import { Rule, addTag, clampScore, idleDue, parseTerritory, pickAutoChannel, rowOf, ruleOf, sentenceText, templates, territoryOwner } from "@/app/w/automations/rules";
import { buildTemplate } from "@/lib/config/templates";
import { defaultDna } from "@/lib/dna";

const DAY = 864e5;

describe("giao theo khu vực", () => {
  const text = "Hà Nội, HN=Lan\nHồ Chí Minh; HCM | Sài Gòn = Minh\nsai dòng\n=Không ai\n*=Hùng";
  it("đọc các dòng, bỏ dòng sai, nhận người mặc định", () => {
    const t = parseTerritory(text);
    expect(t.rules).toEqual([
      { keys: ["ha noi", "hn"], owner: "Lan" },
      { keys: ["ho chi minh", "hcm", "sai gon"], owner: "Minh" },
    ]);
    expect(t.fallback).toBe("Hùng");
  });
  it("khớp không dấu, hoa thường, và khớp chứa", () => {
    expect(territoryOwner(text, "ha noi")).toBe("Lan");
    expect(territoryOwner(text, "TP. Hồ Chí Minh")).toBe("Minh");
    expect(territoryOwner(text, "HCM")).toBe("Minh");
    expect(territoryOwner(text, "Đà Nẵng")).toBe("Hùng");
    expect(territoryOwner(text, "")).toBe("Hùng");
    expect(territoryOwner("Hà Nội=Lan", "Huế")).toBe("");
  });
});

describe("chọn kênh tự động", () => {
  const all = () => true;
  it("ưu tiên ZNS → Zalo → SMS → Email", () => {
    expect(pickAutoChannel(all, { phone: "0912345678", email: "a@b.vn", zaloUid: "z1" })).toBe("zns");
    expect(pickAutoChannel((c) => c !== "zns", { phone: "0912345678", zaloUid: "z1" })).toBe("zalo");
    expect(pickAutoChannel((c) => c !== "zns", { phone: "0912345678" })).toBe("sms");
    expect(pickAutoChannel((c) => c === "email" || c === "zalo", { phone: "0912345678", email: "a@b.vn" })).toBe("email");
  });
  it("không kênh nào đủ điều kiện → null", () => {
    expect(pickAutoChannel(() => false, { phone: "0912345678", email: "a@b.vn" })).toBeNull();
    expect(pickAutoChannel(all, { phone: " ", email: "" })).toBeNull();
  });
});

describe("khách không tương tác", () => {
  const now = new Date("2026-11-06T08:00:00Z");
  it("chỉ chạy khi im lặng đủ N ngày", () => {
    expect(idleDue(new Date(now.getTime() - 31 * DAY), null, 30, now)).toBe(true);
    expect(idleDue(new Date(now.getTime() - 29 * DAY), null, 30, now)).toBe(false);
  });
  it("không bắn lại trong N ngày sau lần chạy trước", () => {
    const last = new Date(now.getTime() - 90 * DAY);
    expect(idleDue(last, new Date(now.getTime() - 10 * DAY), 30, now)).toBe(false);
    expect(idleDue(last, new Date(now.getTime() - 30 * DAY), 30, now)).toBe(true);
  });
});

describe("gắn thẻ, điểm", () => {
  it("thêm thẻ không trùng", () => {
    expect(addTag("", "VIP")).toBe("VIP");
    expect(addTag("Mới, vip", "VIP")).toBe("Mới, vip");
    expect(addTag("Mới", "NPS thấp")).toBe("Mới, NPS thấp");
  });
  it("điểm giữ trong 0–100", () => {
    expect(clampScore(105)).toBe(100);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(42.4)).toBe(42);
  });
});

describe("luật mới: lưu/đọc và câu mô tả", () => {
  const cfg = buildTemplate(defaultDna("spa"));
  it("trigger kỷ niệm lưu được ngày, câu tiếng Việt rõ ràng", () => {
    const rule: Rule = {
      name: "Sinh nhật",
      trigger: { type: "anniversary", object: "contacts", field: "ngay_sinh", days: 3 },
      conditions: [],
      actions: [
        { type: "issue_voucher", campaignId: "c1", channel: "auto" },
        { type: "add_score", points: -5 },
      ],
    };
    expect(Rule.safeParse(rule).success).toBe(true);
    const back = ruleOf({ ...rowOf(rule), id: "x" });
    expect(back.trigger).toMatchObject({ type: "anniversary", field: "ngay_sinh", days: 3 });
    const text = sentenceText(rule, cfg);
    expect(text).toContain("còn 3 ngày nữa đến");
    expect(text).toContain("hằng năm");
    expect(text).toContain("tặng voucher");
    expect(text).toContain("trừ 5 điểm");
  });
  it("câu cho idle, email, khảo sát", () => {
    const base = { name: "", conditions: [], actions: [{ type: "notify" as const, mode: "owner", text: "x" }] };
    expect(sentenceText({ ...base, trigger: { type: "idle", object: "contacts", days: 30 } }, cfg)).toContain("30 ngày không có tương tác");
    expect(sentenceText({ ...base, trigger: { type: "email_engaged", object: "contacts", value: "open", threshold: 2 } }, cfg)).toContain("mở email lần thứ 2");
    expect(sentenceText({ ...base, trigger: { type: "survey_answered", object: "contacts", value: "detractor" } }, cfg)).toContain("không hài lòng");
  });
  it("thư viện có nhóm mẫu chăm sóc nâng cao, mẫu nào cũng hợp lệ", () => {
    const care = templates(cfg).filter((t) => t.group === "Chăm sóc nâng cao");
    expect(care.length).toBeGreaterThanOrEqual(4);
    for (const t of care) expect(Rule.safeParse(t.rule).success).toBe(true);
    expect(care.map((t) => t.rule.name).join("|")).toContain("mở email 2 lần");
  });
});
