// Nhận diện cảm xúc tin nhắn tiếng Việt bằng luật (thuần, có test): hiểu cả có dấu lẫn không dấu.

export type SentimentLabel = "negative" | "positive" | "neutral";
export type SentimentResult = { label: SentimentLabel; score: number; hits: string[] };

/** Bỏ dấu tiếng Việt, đ → d, chữ thường, gộp khoảng trắng. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9?!\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Văn bản có dấu tiếng Việt không (khách gõ có dấu thì so khớp có dấu để tránh nhầm "tệ" với "tê"/"te"). */
export const hasDiacritics = (s: string) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);

// [cụm từ có dấu, trọng số]. Bản không dấu được tự sinh bằng fold(); cụm quá ngắn dễ nhầm khi bỏ dấu thì đánh dấu ascii:false.
type Rule = [phrase: string, weight: number, ascii?: boolean];

const NEG: Rule[] = [
  ["lừa đảo", 3],
  ["lừa đảo à", 3],
  ["báo công an", 3],
  ["kiện", 2, false],
  ["tố cáo", 3],
  ["bóc phốt", 3],
  ["phốt", 2, false],
  ["chửi", 2],
  ["thất vọng", 3],
  ["không hài lòng", 3],
  ["ko hài lòng", 3],
  ["chưa hài lòng", 2],
  ["tệ", 2, false],
  ["quá tệ", 3],
  ["rất tệ", 3],
  ["tệ quá", 3],
  ["tệ hại", 3],
  ["bực", 2, false],
  ["bực mình", 3],
  ["bực quá", 3],
  ["hoàn tiền", 2],
  ["trả hàng", 2],
  ["đổi trả", 1],
  ["hàng giả", 3],
  ["hàng nhái", 3],
  ["kém chất lượng", 3],
  ["chất lượng kém", 3],
  ["hỏng", 1, false],
  ["bị hỏng", 2],
  ["bị lỗi", 2],
  ["hàng lỗi", 2],
  ["giao sai", 2],
  ["giao thiếu", 2],
  ["chậm quá", 2],
  ["lâu quá", 2],
  ["đợi mãi", 2],
  ["chờ mãi", 2],
  ["không ai trả lời", 3],
  ["không trả lời", 2],
  ["không rep", 2],
  ["thái độ", 2],
  ["vô trách nhiệm", 3],
  ["láo", 2, false],
  ["mất dạy", 3],
  ["đểu", 2, false],
  ["cút", 2, false],
  ["điên", 1, false],
  ["phản ánh", 2],
  ["khiếu nại", 3],
  ["không bao giờ mua", 3],
  ["không mua nữa", 3],
  ["bùng", 2, false],
  ["chán", 1, false],
  ["chán quá", 2],
  ["tức", 1, false],
  ["tức quá", 3],
  ["đánh giá 1 sao", 3],
  ["1 sao", 2],
];

const POS: Rule[] = [
  ["cảm ơn", 1],
  ["cám ơn", 1],
  ["thanks", 1],
  ["thank you", 1],
  ["tuyệt", 2],
  ["tuyệt vời", 3],
  ["hài lòng", 2],
  ["rất hài lòng", 3],
  ["ưng", 1, false],
  ["ưng quá", 3],
  ["ưng ý", 2],
  ["thích lắm", 2],
  ["rất thích", 2],
  ["chất lượng tốt", 2],
  ["hàng đẹp", 2],
  ["đẹp quá", 2],
  ["xuất sắc", 3],
  ["nhiệt tình", 2],
  ["chu đáo", 2],
  ["5 sao", 2],
  ["sẽ ủng hộ", 2],
  ["ủng hộ shop", 2],
  ["giao nhanh", 2],
  ["ok shop", 1],
];

const NEGATORS = ["không", "ko", "k", "chẳng", "chả", "chưa", "đâu có", "hông", "hok", "khong", "chang", "cha", "chua", "dau co", "hong"];

function compile(rules: Rule[]) {
  return rules.map(([p, w, ascii]) => ({ p: p.toLowerCase(), f: fold(p), w, ascii: ascii !== false }));
}
const NEG_C = compile(NEG);
const POS_C = compile(POS);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Ranh giới từ cho tiếng Việt: không dùng \b (không hiểu chữ có dấu).
const L = "(?:^|[^\\p{L}\\p{N}])";
const R = "(?=$|[^\\p{L}\\p{N}])";
function findAll(text: string, phrase: string): number[] {
  const re = new RegExp(`${L}(${esc(phrase)})${R}`, "gu");
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push((m.index ?? 0) + m[0].length - m[1].length);
  return out;
}

function negatedAt(text: string, idx: number) {
  const before = text.slice(Math.max(0, idx - 12), idx).trim().split(/\s+/).slice(-2);
  const last1 = before.slice(-1).join(" ");
  const last2 = before.join(" ");
  return NEGATORS.includes(last1) || NEGATORS.includes(last2);
}

/**
 * Phân loại tin của khách. Cụm tiêu cực đã chứa phủ định ("không hài lòng") được ưu tiên;
 * cụm tích cực bị phủ định ("không hài lòng", "chưa ưng") tính là tiêu cực; cụm tiêu cực bị phủ định ("không tệ") bỏ qua.
 */
export function ruleSentiment(raw: string): SentimentResult {
  const text = (raw ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ");
  if (!text.trim()) return { label: "neutral", score: 0, hits: [] };
  const diacritics = hasDiacritics(text);
  const subject = diacritics ? text : fold(text);
  const used: [number, number][] = [];
  const overlaps = (a: number, b: number) => used.some(([x, y]) => a < y && b > x);
  let neg = 0;
  let pos = 0;
  const hits: string[] = [];
  const scan = (rules: ReturnType<typeof compile>, sign: 1 | -1) => {
    // Cụm dài trước để "không hài lòng" thắng "hài lòng".
    for (const r of [...rules].sort((a, b) => b.f.length - a.f.length)) {
      if (!diacritics && !r.ascii) continue;
      const phrase = diacritics ? r.p : r.f;
      for (const i of findAll(subject, phrase)) {
        const end = i + phrase.length;
        if (overlaps(i, end)) continue;
        used.push([i, end]);
        const negated = negatedAt(subject, i);
        if (sign === -1) {
          if (negated) continue; // "không tệ"
          neg += r.w;
          hits.push(r.p);
        } else if (negated) {
          neg += r.w + 1; // "không hài lòng", "chưa ưng"
          hits.push(`không ${r.p}`);
        } else {
          pos += r.w;
          hits.push(r.p);
        }
      }
    }
  };
  scan(NEG_C, -1);
  scan(POS_C, 1);
  // Nhiều dấu chấm than / chữ hoa toàn bộ làm tăng mức tiêu cực khi đã có tín hiệu tiêu cực.
  if (neg > 0 && /!{2,}/.test(raw)) neg += 1;
  const score = pos - neg;
  const label: SentimentLabel = neg >= 2 && neg >= pos ? "negative" : pos >= 1 && pos > neg ? "positive" : "neutral";
  return { label, score, hits };
}

/** Che SĐT, email, số tài khoản trước khi gửi nội dung ra ngoài (AI). */
export function maskPII(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(\+?84|0)[\s.-]?\d(?:[\s.-]?\d){7,9}/g, "[sđt]")
    .replace(/\b\d{9,16}\b/g, "[số]");
}
