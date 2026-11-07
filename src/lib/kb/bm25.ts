// BM25 thuần trong bộ nhớ cho kho kiến thức (không embeddings). Có kiểm thử: src/lib/kb/kb.test.ts
import { chunkText, fold, keyTerms, phraseExpansions, queryTokens, synonymsOf, syllables, tokenize } from "./text";

export type KbKind = "faq" | "doc" | "policy" | "product" | "conversation";
export type KbSourceDoc = { id: string; kind: string; title: string; content: string; tags?: string[] };

export type Chunk = {
  key: string; // docId#n
  docId: string;
  kind: string;
  title: string;
  text: string;
  tf: Map<string, number>;
  len: number;
  /** Tập âm tiết không dấu của tiêu đề + nội dung + thẻ, để tính độ phủ từ khoá. */
  terms: Set<string>;
  /** Âm tiết không dấu của riêng tiêu đề (câu hỏi FAQ). */
  titleTerms: Set<string>;
};

export type Index = { chunks: Chunk[]; df: Map<string, number>; avgLen: number; n: number };

export type Hit = { docId: string; key: string; kind: string; title: string; text: string; score: number; coverage: number; confidence: number };

const K1 = 1.2;
const B = 0.75;
/** Tiêu đề (câu hỏi FAQ, tên sản phẩm) quan trọng hơn nội dung: nhân trọng số token. */
const TITLE_BOOST = 2;

function tfOf(tokens: string[], weight: number, into: Map<string, number>) {
  for (const t of tokens) into.set(t, (into.get(t) ?? 0) + weight);
}

/** Cắt mỗi tài liệu thành đoạn: FAQ/sản phẩm giữ nguyên một đoạn; tài liệu dài cắt ~500 ký tự. */
type RawChunk = Omit<Chunk, "tf" | "len" | "terms" | "titleTerms"> & { tags: string };
export function toChunks(docs: KbSourceDoc[], size = 500): RawChunk[] {
  const out: RawChunk[] = [];
  for (const d of docs) {
    const parts = d.kind === "faq" || d.kind === "product" || d.kind === "conversation" ? [d.content.trim()] : chunkText(d.content, size);
    const tags = (d.tags ?? []).join(" ");
    (parts.length ? parts : [""]).forEach((p, i) => out.push({ key: `${d.id}#${i}`, docId: d.id, kind: d.kind, title: d.title, text: p, tags }));
  }
  return out;
}

export function buildIndex(docs: KbSourceDoc[]): Index {
  const chunks: Chunk[] = toChunks(docs).map(({ tags, ...c }) => {
    const tf = new Map<string, number>();
    const tt = tokenize(`${c.title} ${tags}`);
    const bt = tokenize(c.text);
    tfOf(tt, TITLE_BOOST, tf);
    tfOf(bt, 1, tf);
    const titleTerms = new Set(syllables(`${c.title} ${tags}`).map(fold));
    const terms = new Set([...titleTerms, ...syllables(c.text).map(fold)]);
    return { ...c, tf, len: tt.length * TITLE_BOOST + bt.length, terms, titleTerms };
  });
  const df = new Map<string, number>();
  for (const c of chunks) for (const t of c.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = chunks.length ? chunks.reduce((s, c) => s + c.len, 0) / chunks.length : 1;
  return { chunks, df, avgLen: avgLen || 1, n: chunks.length };
}

const idf = (ix: Index, t: string) => {
  const d = ix.df.get(t) ?? 0;
  return Math.log(1 + (ix.n - d + 0.5) / (d + 0.5));
};

/**
 * Độ phủ từ khoá câu hỏi trong đoạn (0–1), có trọng số idf: từ hiếm ("triệt", "lông") nặng hơn từ phổ biến.
 * Từ không có trong kho tính idf cao nhất (câu hỏi về thứ kho chưa có → độ phủ thấp → bot chuyển nhân viên).
 * Một từ coi như khớp nếu chính nó hoặc từ đồng nghĩa có trong đoạn.
 */
export function coverage(ix: Index, terms: string[], c: Pick<Chunk, "terms" | "titleTerms">, phrases: { terms: string[]; adds: string[] }[] = []): number {
  if (!terms.length) return 0;
  // Từ thuộc cụm đồng nghĩa đã khớp ("ở đâu" khi đoạn có "địa chỉ") coi như khớp.
  const viaPhrase = new Set(phrases.filter((p) => p.adds.every((a) => c.terms.has(a))).flatMap((p) => p.terms));
  const maxIdf = Math.log(1 + (ix.n + 0.5) / 0.5);
  let total = 0;
  let hit = 0;
  for (const t of terms) {
    const w = ix.df.has(t) ? idf(ix, t) : maxIdf;
    total += w;
    if (c.terms.has(t)) hit += w;
    else if (viaPhrase.has(t)) hit += w * 0.9;
    else if (synonymsOf(t).some((s) => c.terms.has(s))) hit += w * 0.8;
  }
  return total ? hit / total : 0;
}

/**
 * Điểm tin cậy 0–1 từ độ phủ + loại tài liệu (FAQ đáng tin nhất, tài liệu dài phải qua AI mới dùng được).
 * Khớp với câu hỏi (tiêu đề) đáng tin hơn khớp tình cờ trong câu trả lời ("xe máy" trong "chỗ gửi xe máy").
 */
export function confidenceOf(kind: string, cov: number, titleCov: number): number {
  const base = kind === "faq" || kind === "conversation" ? Math.max(0.65 * titleCov + 0.35 * cov, titleCov) : Math.max(cov, titleCov);
  const k = kind === "faq" ? 1 : kind === "product" ? 0.95 : kind === "conversation" ? 0.9 : 0.85;
  return Math.max(0, Math.min(1, base * k));
}

/** Tìm top-k đoạn liên quan. Trả mảng rỗng khi câu hỏi không có từ khoá nào khớp. */
export function search(ix: Index, query: string, k = 5): Hit[] {
  if (!ix.n) return [];
  const q = queryTokens(query);
  const terms = keyTerms(query);
  const phrases = phraseExpansions(query);
  if (!q.length) return [];
  const scored: Hit[] = [];
  for (const c of ix.chunks) {
    let s = 0;
    for (const { t, w } of q) {
      const f = c.tf.get(t);
      if (!f) continue;
      s += w * idf(ix, t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * c.len) / ix.avgLen)));
    }
    if (s <= 0) continue;
    const cov = coverage(ix, terms, c, phrases);
    const tcov = coverage(ix, terms, { terms: c.titleTerms, titleTerms: c.titleTerms }, phrases);
    scored.push({ docId: c.docId, key: c.key, kind: c.kind, title: c.title, text: c.text, score: s, coverage: cov, confidence: confidenceOf(c.kind, cov, tcov) });
  }
  scored.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  // Mỗi tài liệu chỉ lấy đoạn tốt nhất trước, rồi mới tới đoạn thứ hai của cùng tài liệu.
  const seen = new Set<string>();
  const first: Hit[] = [];
  const rest: Hit[] = [];
  for (const h of scored) {
    (seen.has(h.docId) ? rest : first).push(h);
    seen.add(h.docId);
  }
  return [...first, ...rest].slice(0, k);
}

/** Ghép tiêu đề + nội dung tóm tắt cho đoạn trích đưa vào prompt (giới hạn độ dài). */
export function snippet(h: Pick<Hit, "title" | "text">, max = 700): string {
  const t = h.text.length > max ? `${h.text.slice(0, max)}…` : h.text;
  return `${h.title}\n${t}`;
}

/**
 * Độ tin cậy để bot tự trả lời từ kết quả tìm: mục tốt nhất, trừ điểm khi câu hỏi mơ hồ
 * (hai mục khác nhau đều khớp gần như nhau, vd. "giá bao nhiêu" khi kho có nhiều bảng giá).
 */
export function answerConfidence(hits: Pick<Hit, "docId" | "confidence">[]): number {
  const [a, b] = hits;
  if (!a) return 0;
  if (b && b.docId !== a.docId && b.confidence >= a.confidence - 0.05) return a.confidence * 0.7;
  return a.confidence;
}
