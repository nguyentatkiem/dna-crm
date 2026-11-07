import { describe, expect, it } from "vitest";
import { answerConfidence, buildIndex, search } from "./bm25";
import { chunkText, fold, keyTerms, maskPII, tokenize } from "./text";
import { BOT_DEFAULT, botGate, heuristicPairs, normBotPref, rowsToFaq, wantsHuman, withDisclose, type GateInput } from "./shared";
import { buildBotPrompt, buildSuggestPrompt, historyText, kbSuggestions, mapSources, sanitizeSuggestions } from "./prompt";
import { SPA_FAQ } from "./seed-data";

const docs = SPA_FAQ.map((f, i) => ({ id: `f${i}`, kind: "faq", title: f.q, content: f.a, tags: f.tags }));
const ix = buildIndex(docs);
const titleOf = (q: string) => search(ix, q, 3)[0]?.title ?? "";

describe("tokenizer tiếng Việt", () => {
  it("giữ cả dạng có dấu và không dấu, bỏ từ đệm, có bigram", () => {
    const t = tokenize("Dạ cho em hỏi giá bao nhiêu ạ");
    expect(t).toContain("gia");
    expect(t).toContain("giá");
    expect(t).toContain("bao_nhieu");
    expect(t).not.toContain("dạ");
    expect(t).not.toContain("em");
  });
  it("không bỏ nhầm 'da' (da mặt)", () => {
    expect(keyTerms("chăm sóc da mặt")).toContain("da");
    expect(keyTerms("dạ vâng")).toEqual([]);
  });
  it("fold bỏ dấu và đ", () => expect(fold("Đặt lịch")).toBe("dat lich"));
});

describe("BM25 truy xuất", () => {
  it("câu hỏi giá có dấu và không dấu đều ra FAQ giá", () => {
    expect(titleOf("giá bao nhiêu")).toMatch(/giá/i);
    expect(titleOf("bao nhieu tien vay shop")).toMatch(/giá/i);
    expect(titleOf("chi phi lieu trinh cham soc da")).toMatch(/giá/i);
  });
  it("địa chỉ, giờ mở cửa, đặt lịch, hoàn tiền", () => {
    expect(titleOf("shop o dau vay")).toMatch(/địa chỉ/i);
    expect(titleOf("mấy giờ mở cửa ạ")).toMatch(/giờ mở cửa/i);
    expect(titleOf("muốn đặt lịch thì làm sao")).toMatch(/đặt lịch/i);
    expect(titleOf("không hiệu quả có hoàn tiền không")).toMatch(/hoàn tiền|bảo hành/i);
  });
  it("độ tin cậy cao khi khớp, thấp khi hỏi thứ kho không có", () => {
    expect(search(ix, "giá liệu trình chăm sóc da bao nhiêu", 1)[0].confidence).toBeGreaterThanOrEqual(0.75);
    const off = search(ix, "bên mình có bán xe máy điện không", 1)[0];
    expect(off?.confidence ?? 0).toBeLessThan(0.75);
  });
  it("cụm đồng nghĩa: “ở đâu” ≈ địa chỉ, “đóng cửa” ≈ giờ mở cửa; khớp tình cờ trong câu trả lời không đủ tin", () => {
    expect(search(ix, "shop o dau", 1)[0].confidence).toBeGreaterThanOrEqual(0.75);
    expect(search(ix, "mấy giờ đóng cửa", 1)[0].confidence).toBeGreaterThanOrEqual(0.75);
    expect(search(ix, "có bán xe máy không", 1)[0]?.confidence ?? 0).toBeLessThan(0.5);
  });
  it("câu hỏi mơ hồ (nhiều bảng giá) bị trừ điểm khi bot tự trả lời", () => {
    expect(answerConfidence(search(ix, "giá bao nhiêu", 3))).toBeLessThan(0.75);
    expect(answerConfidence(search(ix, "giá triệt lông bao nhiêu", 3))).toBeGreaterThanOrEqual(0.75);
    expect(answerConfidence([])).toBe(0);
  });
  it("kho rỗng / câu toàn từ đệm → không có kết quả", () => {
    expect(search(buildIndex([]), "giá", 3)).toEqual([]);
    expect(search(ix, "dạ ạ", 3)).toEqual([]);
  });
  it("cắt tài liệu dài thành đoạn ~500 ký tự", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Điều ${i + 1}. Khách hàng được đổi lịch miễn phí trước 24 giờ.`).join("\n\n");
    const parts = chunkText(long, 500);
    expect(parts.length).toBeGreaterThan(2);
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(500);
    const dix = buildIndex([{ id: "p", kind: "policy", title: "Chính sách đổi lịch", content: long }]);
    expect(search(dix, "đổi lịch có mất phí không", 2)[0].docId).toBe("p");
  });
});

describe("che thông tin cá nhân", () => {
  it("che SĐT, email, số tài khoản, số nhà", () => {
    const m = maskPII("SĐT 0912 345 678, mail lan@gmail.com, STK 0123456789012, nhà số 12/3 đường Lê Lợi");
    expect(m).not.toMatch(/0912|lan@|0123456789012|12\/3/);
    expect(m).toContain("[sđt]");
    expect(m).toContain("[email]");
  });
  it("prompt không chứa SĐT khách", () => {
    const p = buildSuggestPrompt({ businessName: "Spa A", industry: "Spa" }, [{ direction: "in", text: "giá bao nhiêu, gọi em 0987654321" }], search(ix, "giá", 2));
    expect(p.user).not.toContain("0987654321");
    expect(p.user).toContain("[S1]");
    expect(p.system).toMatch(/không bịa/);
  });
});

describe("gợi ý & đọc kết quả AI", () => {
  const hits = search(ix, "giá liệu trình bao nhiêu", 3);
  it("không AI: trả câu trả lời FAQ khớp", () => {
    const s = kbSuggestions(hits);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].sources[0].id).toBe(hits[0].docId);
    expect(s[0].origin).toBe("kb");
  });
  it("map mã nguồn S1.. và bỏ mã lạ", () => {
    expect(mapSources(["S1", "S9", "s1"], hits)).toEqual([{ id: hits[0].docId, title: hits[0].title }]);
  });
  it("sanitize: bỏ trùng/rỗng, tối đa 3, giảm tin cậy khi không bám nguồn", () => {
    const out = sanitizeSuggestions(
      {
        suggestions: [
          { text: "Dạ giá 500k ạ [S1]", sources: ["S1"], grounded: true },
          { text: "Dạ giá 500k ạ [S1]", sources: ["S1"], grounded: true },
          { text: "  ", sources: [], grounded: true },
          { text: "Dạ em kiểm tra lại ạ", sources: [], grounded: false },
          { text: "Phương án 3", sources: ["S2"], grounded: false },
          { text: "Phương án 4", sources: ["S1"], grounded: true },
        ],
      },
      hits,
    );
    expect(out).toHaveLength(3);
    expect(out[0].text).toBe("Dạ giá 500k ạ");
    expect(out[1].confidence).toBeLessThanOrEqual(0.3);
    expect(sanitizeSuggestions(null, hits)).toEqual([]);
  });
  it("prompt bot yêu cầu để trống khi không đủ nguồn", () => {
    const p = buildBotPrompt({ businessName: "Spa A", industry: "Spa" }, [{ direction: "in", text: "hi" }], []);
    expect(p.system).toMatch(/answer rỗng/);
    expect(historyText([{ direction: "in", text: "a@b.vn" }])).toBe("Khách: [email]");
  });
});

describe("luật chatbot", () => {
  const base: GateInput = {
    pref: { ...BOT_DEFAULT, enabled: true },
    channel: "messenger",
    kind: "inbox",
    assignee: "",
    sentiment: "",
    text: "giá bao nhiêu",
    inWorkingHours: false,
    offForConversation: false,
    inboundCount: 1,
    botRepliesSinceStaff: 0,
    minutesSinceStaffReply: null,
    handoffPending: false,
  };
  it("mặc định tắt", () => expect(botGate({ ...base, pref: BOT_DEFAULT }).go).toBe(false));
  it("ngoài giờ thì trả lời; trong giờ (off_hours) thì không", () => {
    expect(botGate(base).go).toBe(true);
    expect(botGate({ ...base, inWorkingHours: true }).go).toBe(false);
  });
  it("bỏ qua: bình luận, kênh không bật, khách bức xúc, đòi người thật, đủ số lần, đã tắt", () => {
    expect(botGate({ ...base, kind: "comment" }).go).toBe(false);
    expect(botGate({ ...base, channel: "tiktok" }).go).toBe(false);
    expect(botGate({ ...base, sentiment: "negative" })).toMatchObject({ go: false, handoff: true });
    expect(botGate({ ...base, text: "cho em gặp nhân viên" })).toMatchObject({ go: false, handoff: true });
    expect(botGate({ ...base, text: "cho gap nguoi that" })).toMatchObject({ go: false, handoff: true });
    expect(botGate({ ...base, botRepliesSinceStaff: 3 })).toMatchObject({ go: false, handoff: true });
    expect(botGate({ ...base, offForConversation: true }).go).toBe(false);
    expect(botGate({ ...base, handoffPending: true }).go).toBe(false);
  });
  it("first_message chỉ tin đầu; always bỏ qua khi có người phụ trách trong giờ", () => {
    const fm = { ...base, pref: { ...base.pref, mode: "first_message" as const } };
    expect(botGate(fm).go).toBe(true);
    expect(botGate({ ...fm, inboundCount: 2 }).go).toBe(false);
    const al = { ...base, pref: { ...base.pref, mode: "always" as const } };
    expect(botGate({ ...al, inWorkingHours: true }).go).toBe(true);
    expect(botGate({ ...al, inWorkingHours: true, assignee: "Lan" }).go).toBe(false);
  });
  it("chuẩn hoá cài đặt hỏng & tiền tố công khai", () => {
    const p = normBotPref({ enabled: "yes", minConfidence: 3, mode: "always" });
    expect(p.enabled).toBe(false);
    expect(p.minConfidence).toBe(0.75);
    expect(p.mode).toBe("always");
    expect(withDisclose("Dạ", BOT_DEFAULT)).toBe("🤖 Trợ lý tự động: Dạ");
    expect(withDisclose("🤖 Trợ lý tự động: Dạ", BOT_DEFAULT)).toBe("🤖 Trợ lý tự động: Dạ");
    expect(wantsHuman("abc", [])).toBe(false);
  });
});

describe("CSV & học từ hội thoại", () => {
  it("đọc CSV có tiêu đề tiếng Việt", () => {
    const r = rowsToFaq([
      ["Câu hỏi", "Trả lời", "Thẻ"],
      ["Giá?", "500k", "giá, dịch vụ"],
      ["", "x", ""],
    ]);
    expect(r).toEqual([{ title: "Giá?", content: "500k", tags: ["giá", "dịch vụ"] }]);
    expect(rowsToFaq([["Hỏi a", "Đáp a"]])).toHaveLength(1);
  });
  it("cặp câu hỏi khách → trả lời kế tiếp của nhân viên, che SĐT, bỏ bot", () => {
    const pairs = heuristicPairs("c1", [
      { direction: "in", text: "Giá gội đầu dưỡng sinh bao nhiêu vậy?", author: "", at: 1 },
      { direction: "out", text: "Dạ gội đầu dưỡng sinh bên em 150.000đ/lần ạ, gọi 0912345678 nhé", author: "Lan", at: 2 },
      { direction: "in", text: "Có chỗ gửi xe không?", author: "", at: 3 },
      { direction: "out", text: "🤖 Trợ lý tự động: Dạ có chỗ gửi xe miễn phí ạ", author: "Trợ lý tự động", at: 4 },
      { direction: "in", text: "ok", author: "", at: 5 },
      { direction: "in", text: "Da nhạy cảm làm được không?", author: "", at: 6 },
      { direction: "out", text: "Cảm ơn chị Chi ạ, hẹn gặp chị cuối tuần", author: "Lan", at: 7 },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].answer).toContain("150.000đ");
    expect(pairs[0].answer).not.toContain("0912345678");
  });
});
