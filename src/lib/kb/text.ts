// Xử lý chữ tiếng Việt cho kho kiến thức (thuần, dùng được cả client lẫn server, có kiểm thử).
// Không dùng embeddings: tách âm tiết, giữ cả dạng có dấu và không dấu, bỏ từ đệm, thêm cặp từ (bigram).

/** Bỏ dấu tiếng Việt + chữ thường: "Giá bao nhiêu" → "gia bao nhieu". */
export function fold(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/** Từ đệm/lịch sự chắc chắn vô nghĩa khi tìm (dạng không dấu, không mơ hồ). */
const STOP_FOLDED = new Set(
  "a ah ak oi nhe nha nhi vay the thi la va voi cua cho em anh chi minh shop ad admin ma nhu co khong ko k hok hong duoc dc hoi xin vui long giup cam on ok oke nhe di roi rui nua luon ne nhung cac nhieu mot nay do kia day lam sao the nao hay hoac".split(" "),
);
// Từ có nghĩa cần giữ dù nằm trong danh sách trên ("nhieu" trong "bao nhiêu", "lam" trong "làm đẹp"...) xử lý bằng bigram.
/** Từ đệm theo dạng có dấu — tránh bỏ nhầm "da" (da mặt) khi khách viết "dạ". */
const STOP_ACCENT = new Set(["bạn", "dạ", "ạ", "ơi", "nhé", "nha", "ạh", "vâng", "ừ", "ừm", "à", "ha", "hả", "nhỉ", "vậy", "thế"]);

/** Từ đồng nghĩa (dạng không dấu): mở rộng câu hỏi để "bao nhiêu tiền" gặp "giá". */
const SYNONYMS: Record<string, string[]> = {
  tien: ["gia"],
  phi: ["gia"],
  gia: ["tien", "phi"],
  bn: ["bao", "nhieu", "gia"],
  dchi: ["dia", "chi"],
  dc: [],
  sdt: ["so", "dien", "thoai"],
  hotline: ["so", "dien", "thoai"],
  mo: ["gio"],
  dong: ["gio"],
  book: ["dat", "lich"],
  hen: ["lich"],
  km: ["khuyen", "mai"],
  sale: ["khuyen", "mai", "giam"],
  voucher: ["khuyen", "mai", "giam"],
  uu: ["khuyen", "mai"],
  hoan: ["bao", "hanh"],
  doi: ["tra"],
  ship: ["giao", "hang"],
  cod: ["giao", "hang", "thanh", "toan"],
  ck: ["chuyen", "khoan"],
  stk: ["chuyen", "khoan", "tai", "khoan"],
};

/** Cụm đồng nghĩa (không dấu): "ở đâu" ≈ "địa chỉ", "đóng cửa" ≈ "mở cửa"… */
const PHRASES: [phrase: string, adds: string][] = [
  ["o dau", "dia chi"],
  ["cho nao", "dia chi"],
  ["duong nao", "dia chi"],
  ["bao nhieu tien", "gia"],
  ["may tien", "gia"],
  ["het bao nhieu", "gia"],
  ["chi phi", "gia"],
  ["dong cua", "mo cua"],
  ["may gio", "gio"],
  ["gio nao", "gio"],
  ["khi nao", "gio"],
  ["lam viec", "mo cua"],
  ["dat hen", "dat lich"],
  ["hen lich", "dat lich"],
  ["book lich", "dat lich"],
  ["giam gia", "khuyen mai"],
  ["uu dai", "khuyen mai"],
  ["tra lai tien", "hoan tien"],
  ["doi tra", "bao hanh"],
  ["tra gop", "thanh toan"],
  ["chuyen khoan", "thanh toan"],
];

/** Cụm đồng nghĩa có trong câu hỏi: từ gốc của cụm + từ thêm vào. */
export function phraseExpansions(q: string): { terms: string[]; adds: string[] }[] {
  const f = ` ${syllables(q).map(fold).join(" ")} `;
  return PHRASES.filter(([p]) => f.includes(` ${p} `)).map(([p, a]) => ({ terms: p.split(" "), adds: a.split(" ") }));
}

export type Token = { t: string; w: number };

/** Âm tiết (đã chữ thường, giữ dấu). Tách theo mọi ký tự không phải chữ/số. */
export function syllables(s: string): string[] {
  return (s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Tách token cho BM25:
 * - mỗi âm tiết → dạng không dấu (luôn) + dạng có dấu (nếu khác) — gõ không dấu vẫn tìm được, có dấu thì khớp chính xác hơn;
 * - bỏ từ đệm; cặp hai âm tiết liền nhau (không dấu) dạng "bao_nhieu" để ưu tiên cụm đúng thứ tự.
 */
export function tokenize(s: string): string[] {
  const syl = syllables(s);
  const out: string[] = [];
  const kept: string[] = [];
  for (const raw of syl) {
    if (STOP_ACCENT.has(raw)) {
      kept.push("");
      continue;
    }
    const f = fold(raw);
    kept.push(f);
    if (STOP_FOLDED.has(f)) continue;
    out.push(f);
    if (raw !== f) out.push(raw);
  }
  // Bigram tính trên chuỗi gốc kể cả từ đệm "nhiều" ("bao nhiêu"), trừ từ đệm có dấu (đã thành rỗng).
  for (let i = 0; i + 1 < kept.length; i++) if (kept[i] && kept[i + 1]) out.push(`${kept[i]}_${kept[i + 1]}`);
  return out;
}

/** Từ khoá chính của câu hỏi (không dấu, không trùng, không từ đệm) — dùng tính độ phủ. */
export function keyTerms(s: string): string[] {
  const set = new Set<string>();
  for (const raw of syllables(s)) {
    if (STOP_ACCENT.has(raw)) continue;
    const f = fold(raw);
    if (!STOP_FOLDED.has(f) && f.length > 0) set.add(f);
  }
  return [...set];
}

/** Từ đồng nghĩa mở rộng (không dấu) của một từ khoá. */
export const synonymsOf = (term: string): string[] => SYNONYMS[term] ?? [];

/** Câu hỏi đã mở rộng đồng nghĩa: token gốc + token đồng nghĩa (đánh dấu để giảm trọng số). */
export function queryTokens(q: string): Token[] {
  const base = tokenize(q).map((t) => ({ t, w: 1 }));
  const extra: Token[] = [];
  for (const k of keyTerms(q)) for (const s of synonymsOf(k)) extra.push({ t: s, w: 0.5 });
  for (const e of phraseExpansions(q)) {
    for (const a of e.adds) extra.push({ t: a, w: 0.6 });
    for (let i = 0; i + 1 < e.adds.length; i++) extra.push({ t: `${e.adds[i]}_${e.adds[i + 1]}`, w: 0.6 });
  }
  return [...base, ...extra];
}

/**
 * Cắt tài liệu dài thành đoạn ~size ký tự, ưu tiên ngắt ở đoạn văn rồi câu, chồng lấn nhẹ để không mất ngữ cảnh.
 * Văn bản ngắn hơn size trả về một đoạn.
 */
export function chunkText(text: string, size = 500): string[] {
  const clean = (text ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paras = clean.split(/\n\s*\n/);
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= size) pieces.push(p.trim());
    else {
      // Câu: ngắt sau . ! ? hoặc xuống dòng.
      const sents = p.split(/(?<=[.!?…])\s+|\n/);
      let cur = "";
      for (const s of sents) {
        if (s.length > size) {
          if (cur) pieces.push(cur.trim());
          cur = "";
          for (let i = 0; i < s.length; i += size) pieces.push(s.slice(i, i + size).trim());
          continue;
        }
        if ((cur + " " + s).length > size && cur) {
          pieces.push(cur.trim());
          cur = s;
        } else cur = cur ? `${cur} ${s}` : s;
      }
      if (cur.trim()) pieces.push(cur.trim());
    }
  }
  // Gộp các mẩu nhỏ liền nhau tới gần size.
  const out: string[] = [];
  let buf = "";
  for (const piece of pieces.filter(Boolean)) {
    if (!buf) buf = piece;
    else if (buf.length + piece.length + 2 <= size) buf = `${buf}\n\n${piece}`;
    else {
      out.push(buf);
      buf = piece;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Che thông tin cá nhân trước khi gửi cho AI hoặc lưu vào kho: SĐT, email, số tài khoản/CMND, địa chỉ nhà cụ thể.
 * Giữ nguyên địa chỉ của shop là việc của người duyệt (chỉ che mẫu địa chỉ có số nhà).
 */
export function maskPII(s: string): string {
  return (s ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(?<![\d])(\+?84|0)[\s.-]?\d(?:[\s.-]?\d){7,9}(?!\d)/g, "[sđt]")
    .replace(/\b\d{9,16}\b/g, "[số]")
    .replace(/\b(số nhà|số|sn|ngõ|ngách|hẻm|kiệt|hem|ngo)\s*\d+[a-z]?([/\-]\d+[a-z]?)*(\s*[,]?\s*(đường|duong|phố|pho|phường|phuong|p\.|quận|quan|q\.)[^\n,.;]*)?/giu, "[địa chỉ]")
    .replace(/\b\d+[a-z]?(\/\d+[a-z]?)+\s+(đường|duong|phố|pho)?\s*[\p{Lu}][^\n,.;]*/gu, "[địa chỉ]");
}

/** Có vẻ là câu hỏi không (dấu ?, từ để hỏi). Dùng cho cách học từ hội thoại không cần AI. */
export function looksLikeQuestion(s: string): boolean {
  const t = ` ${fold(s)} `;
  if (/\?/.test(s)) return true;
  return /\b(bao nhieu|bn|gia|o dau|cho nao|khi nao|may gio|gio nao|the nao|nhu the nao|sao|co khong|duoc khong|ko|khong a|nao|bao lau|lam sao|ship|giao hang|bao hanh|doi tra|hoan tien|dat lich|con hang|con khong)\b/.test(t);
}

/** Thẻ (tags) từ chuỗi "a, b; c" → ["a","b","c"] (không trùng, cắt ngắn). */
export function parseTags(s: string | string[] | undefined): string[] {
  const arr = Array.isArray(s) ? s : (s ?? "").split(/[,;|]/);
  return [...new Set(arr.map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
}
