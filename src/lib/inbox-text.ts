// Tách SĐT trong nội dung tin nhắn để tô sáng và bấm được. Thuần (client + server).

/** SĐT Việt Nam trong tin nhắn: 0912 345 678, 0912.345.678, +84 912345678, 024 3456 7890. */
export const PHONE = /(?<![\d+])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g;

export const digitsOf = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.startsWith("84") && d.length >= 11 ? `0${d.slice(2)}` : d;
};

/** Tách văn bản thành đoạn thường và SĐT. */
export function splitPhones(text: string): { t: string; phone?: string }[] {
  const out: { t: string; phone?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(PHONE)) {
    const i = m.index ?? 0;
    const d = digitsOf(m[0]);
    if (d.length < 10 || d.length > 11) continue;
    if (i > last) out.push({ t: text.slice(last, i) });
    out.push({ t: m[0], phone: d });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

