// Đọc số bằng chữ tiếng Việt cho dòng "Số tiền viết bằng chữ" trên hoá đơn. Thuần.
const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/** Đọc nhóm 3 chữ số. `full` = không phải nhóm đầu → đọc cả "không trăm", "linh". */
function group(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (h || full) out.push(`${DIGITS[h]} trăm`);
  if (t === 0) {
    if (u && (h || full)) out.push("linh");
  } else if (t === 1) out.push("mười");
  else out.push(`${DIGITS[t]} mươi`);
  if (u === 1 && t >= 2) out.push("mốt");
  else if (u === 5 && t >= 1) out.push("lăm");
  else if (u === 4 && t >= 2) out.push("tư");
  else if (u) out.push(DIGITS[u]);
  return out.join(" ");
}

/** Số nguyên < 1 tỷ. */
function below1e9(n: number, full: boolean): string {
  const parts: string[] = [];
  const units = ["", " nghìn", " triệu"];
  const gs = [Math.floor(n / 1e6), Math.floor((n % 1e6) / 1e3), n % 1e3];
  let started = full;
  gs.forEach((g, i) => {
    if (!g) return;
    parts.push(group(g, started) + units[2 - i]);
    started = true;
  });
  return parts.join(" ");
}

/** Đọc số nguyên không âm: 1250000 → "một triệu hai trăm năm mươi nghìn". */
export function readNumberVi(value: number): string {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return "không";
  const chunks: number[] = [];
  while (n > 0) {
    chunks.push(n % 1e9);
    n = Math.floor(n / 1e9);
  }
  // chunks[0] = phần dưới 1 tỷ, chunks[1] = số tỷ, chunks[2] = số tỷ tỷ…
  const parts: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (!c) continue;
    const full = i < chunks.length - 1;
    parts.push(below1e9(c, full) + " tỷ".repeat(i));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** "Số tiền bằng chữ" chuẩn hoá đơn: viết hoa chữ đầu, thêm "đồng" (và "chẵn" khi tròn nghìn nếu muốn). */
export function amountInWordsVi(value: number, opts: { even?: boolean } = {}): string {
  const n = Math.round(Math.abs(Number(value) || 0));
  const s = `${Number(value) < 0 ? "âm " : ""}${readNumberVi(n)} đồng${opts.even && n % 1000 === 0 && n > 0 ? " chẵn" : ""}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
