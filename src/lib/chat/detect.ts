// HỢP ĐỒNG (nhóm "Kênh & bình luận" hiện thực, có test): phát hiện SĐT, email, địa chỉ trong tin nhắn tiếng Việt.
// Thuần (không đụng DB) để dùng được cả phía trình duyệt.
export type Detected = { phones: string[]; emails: string[]; address: string };

/** Bỏ dấu từng ký tự, GIỮ NGUYÊN độ dài để chỉ số trên chuỗi bỏ dấu khớp chuỗi gốc. */
export function plainSameLength(s: string) {
  let out = "";
  for (const ch of s) {
    if (ch === "đ") out += "d";
    else if (ch === "Đ") out += "d";
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      // Ký tự ngoài BMP (emoji) chiếm 2 code unit: giữ độ dài bằng cách đệm.
      const b = (base[0] ?? " ").toLowerCase();
      out += ch.length === 2 ? b + " " : b;
    }
  }
  return out;
}

const SEP = "(?:[ .\\-]|\\s-\\s)?";
// Di động 0[35789]x + 8 số; cố định 02x + 8 số (11 số). Tiền tố +84 / 84 / (+84) và có khi viết thừa số 0 sau 84.
const PHONE_RE = new RegExp(`(?<![\\p{L}\\d#/_+@])(?:\\(?\\+?84\\)?${SEP}0?|0)((?:[35789](?:${SEP}\\d){8})|(?:2(?:${SEP}\\d){9}))(?![\\d/@]|[.,:]\\d|\\p{L})`, "gu");
// Số đứng sau các từ này là mã đơn, số tài khoản, giấy tờ... không phải SĐT.
const NOT_PHONE_BEFORE = /(?:ma(?:\s+(?:don|van\s+don|vd|khach|kh|sp|hang))?|order|don\s+hang\s+so|van\s+don|tracking|stk|tk|so\s+tk|tai\s+khoan|mst|ma\s+so\s+thue|cccd|cmnd|can\s+cuoc|ma\s+gd|giao\s+dich|ref|id)\s*[:#.\-]?\s*$/;
// Số đứng trước đơn vị tiền / phần trăm là giá.
const PRICE_AFTER = /^\s*(?:d\b|đ|vnd|vnđ|dong\b|k\b|tr\b|trieu|nghin|ngan|%|usd|\$)/i;

/** Chuẩn hoá về dạng 0xxxxxxxxx. */
export function normalizePhoneVN(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("84") && (d.length === 11 || d.length === 12)) d = d.slice(2);
  if (d.startsWith("840")) d = d.slice(3);
  if (!d.startsWith("0")) d = "0" + d;
  return d;
}

function findPhones(text: string, plain: string): { phones: string[]; ranges: [number, number][] } {
  const phones: string[] = [];
  const ranges: [number, number][] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const before = plain.slice(Math.max(0, start - 24), start);
    if (NOT_PHONE_BEFORE.test(before)) continue;
    if (PRICE_AFTER.test(plain.slice(end, end + 8))) continue;
    const p = normalizePhoneVN(m[0]);
    const ok = (p.length === 10 && /^0[35789]/.test(p)) || (p.length === 11 && p.startsWith("02"));
    if (!ok) continue;
    ranges.push([start, end]);
    if (!phones.includes(p)) phones.push(p);
  }
  return { phones, ranges };
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/* ───────────── Địa chỉ ───────────── */

const PROVINCES = [
  "ha noi", "hn", "ho chi minh", "hcm", "tphcm", "tp hcm", "sai gon", "sg", "da nang", "hai phong", "can tho", "an giang", "ba ria", "vung tau", "bac giang", "bac kan", "bac lieu",
  "bac ninh", "ben tre", "binh dinh", "binh duong", "binh phuoc", "binh thuan", "ca mau", "cao bang", "dak lak", "dak nong", "dien bien", "dong nai", "dong thap", "gia lai",
  "ha giang", "ha nam", "ha tinh", "hai duong", "hau giang", "hoa binh", "hung yen", "khanh hoa", "kien giang", "kon tum", "lai chau", "lam dong", "lang son", "lao cai",
  "long an", "nam dinh", "nghe an", "ninh binh", "ninh thuan", "phu tho", "phu yen", "quang binh", "quang nam", "quang ngai", "quang ninh", "quang tri", "soc trang", "son la",
  "tay ninh", "thai binh", "thai nguyen", "thanh hoa", "hue", "thua thien hue", "tien giang", "tra vinh", "tuyen quang", "vinh long", "vinh phuc", "yen bai", "nha trang", "da lat", "buon ma thuot", "vinh",
];
const PROVINCE_RE = new RegExp(`(?:^|[^a-z])(?:tinh|thanh pho|tp\\.?)\\s*\\p{L}|(?:^|[^a-z])(?:${PROVINCES.map((p) => p.replace(/ /g, "\\s+")).join("|")})(?![a-z])`, "u");
const PARTS: Record<string, RegExp> = {
  street: /(?:^|[^a-z])(?:duong|pho|ngo|ngach|hem|kiet|thon|xom|ap|to\s+dan\s+pho|khu\s+pho|kp|khu\s+do\s+thi|kdt|chung\s+cu|cc|toa|quoc\s+lo|ql|tinh\s+lo|dl|dai\s+lo|lo)\s*[.:]?\s*[\p{L}\d]/u,
  ward: /(?:^|[^a-z])(?:phuong|xa|thi\s+tran|tt)\s+[\p{L}\d]|(?:^|[^a-z])p\s*[.]?\s*\d{1,2}(?!\d)|(?:^|[^a-z])p\.\s*\p{L}/u,
  district: /(?:^|[^a-z])(?:quan|huyen|thi\s+xa|tx)\s+[\p{L}\d]|(?:^|[^a-z])q\s*[.]?\s*\d{1,2}(?!\d)|(?:^|[^a-z])q\.\s*\p{L}/u,
  house: /(?:^|[^a-z\d])(?:so\s+(?:nha\s+)?)?\d{1,4}[a-z]?(?:\/\d{1,4}[a-z]?)*\s*[,]?\s*(?:duong|pho|ngo|ngach|hem|kiet|d\.|p\.|\p{L}{2,}\s+\p{L}{2,})|(?:^|[^a-z])so\s+(?:nha\s+)?\d{1,4}/u,
};
const MARKER_RE = /(?:dia\s+chi|d\/c|dc\s*:|ship\s+(?:ve|den|toi|qua)|giao\s+(?:hang\s+)?(?:ve|den|toi|tai|qua)|gui\s+(?:hang\s+)?(?:ve|den|toi)|nhan\s+hang\s+(?:tai|o)|nha\s+(?:em|minh|toi|chi|anh)\s+o)\s*[:\-]?\s*/;
const STOP_RE = /\s*(?:[,.]?\s*(?:sdt|so\s+dien\s+thoai|so\s+dt|dt\s*:|lh\b|lien\s+he|cam\s+on|thanks|nhe\b|nha\s+(?:shop|em|ban)\b|nha\b(?=\s*[!.?]|\s*$)|shop\s+oi|em\s+oi|ship\s+cod|giao\s+gio|a\s*[!.]|ạ))/;

/** Đoạn có vẻ là địa chỉ giao hàng: "số 12 ngõ 34 Trần Duy Hưng, P. Trung Hoà, Q. Cầu Giấy, Hà Nội". */
function findAddress(text: string, plain: string): string {
  // Tách thành câu theo xuống dòng, ! ? ; (giữ dấu chấm vì "P.5", "Q.1", "TP.").
  const chunks: [number, number][] = [];
  let s = 0;
  for (let i = 0; i <= plain.length; i++) {
    if (i === plain.length || /[\n!?;]/.test(plain[i])) {
      if (i > s) chunks.push([s, i]);
      s = i + 1;
    }
  }
  let best = { score: 0, text: "" };
  for (const [a, b] of chunks) {
    const seg = plain.slice(a, b);
    const mk = MARKER_RE.exec(seg);
    let start = mk ? mk.index + mk[0].length : -1;
    if (start < 0) {
      // Không có từ báo hiệu: bắt đầu ở thành phần đầu tiên tìm thấy.
      const idx = Object.values(PARTS)
        .map((re) => {
          const m = re.exec(seg);
          return m ? m.index + (/^[^a-z\d]/.test(m[0]) ? 1 : 0) : -1;
        })
        .filter((x) => x >= 0);
      if (!idx.length) continue;
      start = Math.min(...idx);
    }
    let body = seg.slice(start);
    const stop = STOP_RE.exec(body);
    if (stop && stop.index > 0) body = body.slice(0, stop.index);
    const kinds = Object.entries(PARTS).filter(([, re]) => re.test(body)).map(([k]) => k);
    if (PROVINCE_RE.test(body)) kinds.push("province");
    const score = kinds.length;
    const strong = kinds.includes("house") || kinds.includes("street") || kinds.includes("ward") || kinds.includes("district");
    const accept = strong && ((mk && score >= 1) || score >= 3 || (score === 2 && (kinds.includes("house") || (kinds.includes("district") && kinds.includes("province")) || (kinds.includes("ward") && kinds.includes("district")))));
    if (!accept || score <= best.score) continue;
    const raw = text.slice(a + start, a + start + body.length);
    const clean = raw.replace(/\s+/g, " ").replace(/^[\s,:.\-]+|[\s,:\-]+$/g, "").replace(/\.$/, (m) => (/\b(?:p|q|tp)\.$/i.test(raw.trim()) ? m : ""));
    if (clean.length >= 8) best = { score, text: clean.slice(0, 200) };
  }
  return best.text;
}

/** Tìm SĐT (chuẩn hoá 0xxxxxxxxx), email và một đoạn địa chỉ trong tin nhắn / bình luận. */
export function detectContact(text: string): Detected {
  const src = String(text ?? "").normalize("NFC");
  if (!src.trim()) return { phones: [], emails: [], address: "" };
  let plain = plainSameLength(src);
  const emails = [...new Set((src.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
  // Che email trước để chữ số trong email không bị nhận là SĐT.
  let masked = src;
  for (const m of src.matchAll(EMAIL_RE)) {
    const i = m.index ?? 0;
    masked = masked.slice(0, i) + " ".repeat(m[0].length) + masked.slice(i + m[0].length);
    plain = plain.slice(0, i) + " ".repeat(m[0].length) + plain.slice(i + m[0].length);
  }
  const { phones, ranges } = findPhones(masked, plain);
  // Che SĐT để không lẫn vào địa chỉ.
  for (const [i, j] of ranges) {
    masked = masked.slice(0, i) + " ".repeat(j - i) + masked.slice(j);
    plain = plain.slice(0, i) + " ".repeat(j - i) + plain.slice(j);
  }
  return { phones, emails, address: findAddress(masked, plain) };
}

/** Có SĐT trong đoạn chữ không (dùng cho tự ẩn bình luận có SĐT). */
export const hasPhone = (text: string) => detectContact(text).phones.length > 0;
