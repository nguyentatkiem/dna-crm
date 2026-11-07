// VietQR (chuẩn EMVCo / NAPAS 247): tạo chuỗi payload, mã nội dung chuyển khoản (payCode) và dò payCode trong nội dung sao kê.
// Thuần, dùng được ở trình duyệt, server và kiểm thử.
import { bankByBin } from "./banks";

/** HỢP ĐỒNG: tham số tạo VietQR. amount = 0/undefined → QR tĩnh (khách tự nhập số tiền). */
export type VietQrInput = { bin: string; accountNo: string; accountName?: string; amount?: number; addInfo?: string };

const tlv = (id: string, value: string) => {
  if (value.length > 99) throw new Error(`Trường ${id} quá dài`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
};

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF), 4 ký tự hex in hoa. */
export function crc16(s: string) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(s)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Bỏ dấu tiếng Việt và ký tự lạ: nội dung chuyển khoản chỉ nên có chữ, số, khoảng trắng. */
export function cleanAddInfo(s: string, max = 50) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** HỢP ĐỒNG: chuỗi payload VietQR để vẽ mã QR. */
export function buildVietQR(p: VietQrInput) {
  const bin = String(p.bin ?? "").replace(/\D/g, "");
  const acc = String(p.accountNo ?? "").replace(/[^0-9A-Za-z]/g, "");
  if (!/^\d{6}$/.test(bin)) throw new Error("Mã BIN ngân hàng phải gồm 6 chữ số");
  if (!acc || acc.length > 19) throw new Error("Số tài khoản không hợp lệ");
  const amount = Math.max(0, Math.round(Number(p.amount) || 0));
  const info = cleanAddInfo(p.addInfo ?? "");
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", bin) + tlv("01", acc)) + tlv("02", "QRIBFTTA");
  let s = tlv("00", "01") + tlv("01", amount ? "12" : "11") + tlv("38", merchant) + tlv("53", "704");
  if (amount) s += tlv("54", String(amount));
  s += tlv("58", "VN");
  if (info) s += tlv("62", tlv("08", info));
  s += "6304";
  return s + crc16(s);
}

/** Tách TLV một cấp (để kiểm thử / đọc lại payload). */
export function parseTlv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!Number.isFinite(len)) break;
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

/** Kiểm tra CRC của một payload EMVCo. */
export function verifyCrc(payload: string) {
  return payload.length > 8 && payload.slice(-8, -4) === "6304" && crc16(payload.slice(0, -4)) === payload.slice(-4);
}

/** Mô tả để hiện dưới mã QR. */
export function describeQr(p: VietQrInput) {
  const b = bankByBin(p.bin);
  return { bank: b?.short ?? p.bin, bankName: b?.name ?? "", accountNo: p.accountNo, accountName: p.accountName ?? "", amount: Math.round(Number(p.amount) || 0), addInfo: cleanAddInfo(p.addInfo ?? "") };
}

// ---------------- Mã nội dung chuyển khoản ----------------

/** Chuẩn hoá tiền tố: chỉ chữ cái/số in hoa, 1–6 ký tự, mặc định "DH". */
export const normPrefix = (p: string | null | undefined) => (String(p ?? "").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "DH");

/**
 * HỢP ĐỒNG: mã nội dung chuyển khoản của một đơn. Đơn đã có payCode thì dùng luôn;
 * chưa có thì ghép tiền tố + toàn bộ chữ số của số đơn: "DH-2026-0004" → "DH20260004".
 */
export function payCodeFor(order: { number: string; payCode?: string | null }, prefix = "DH") {
  if (order.payCode) return order.payCode;
  const digits = String(order.number ?? "").replace(/\D/g, "");
  return `${normPrefix(prefix)}${digits}`;
}

const SEP = /[\s.\-_/:,;#+]/;

/** Bỏ dấu, in hoa để dò mã. */
const upperAscii = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase();

/**
 * Mọi mã có thể có trong nội dung sao kê: sau mỗi lần xuất hiện tiền tố (ngân hàng hay chèn thêm chữ phía trước
 * như "MBVCB.1234.DH20260004.CT tu…"), đọc các chữ số liền sau, chấp nhận dấu cách/chấm/gạch xen giữa
 * ("DH 2026 0004", "dh-2026-0004"). Trả mọi điểm cắt ở ranh giới nhóm số, ví dụ "DH 2026 0004 0912345678"
 * → ["DH2026", "DH20260004", "DH202600040912345678"]; nơi gọi so với danh sách payCode có thật.
 */
export function payCodeCandidates(content: string, prefix = "DH"): string[] {
  const s = upperAscii(content);
  const pre = normPrefix(prefix);
  const out = new Set<string>();
  let from = 0;
  for (;;) {
    const at = s.indexOf(pre, from);
    if (at < 0) break;
    from = at + 1;
    let i = at + pre.length;
    // Cho phép dấu phân cách ngay sau tiền tố: "DH-2026…", "DH 2026…".
    while (i < s.length && SEP.test(s[i])) i++;
    let digits = "";
    while (i < s.length && digits.length < 20) {
      const c = s[i];
      if (c >= "0" && c <= "9") {
        digits += c;
        i++;
        const next = s[i];
        if (next === undefined || !(next >= "0" && next <= "9")) out.add(pre + digits);
      } else if (SEP.test(c) && digits) {
        // Chỉ đi tiếp nếu sau dấu phân cách lại là số.
        let j = i;
        while (j < s.length && SEP.test(s[j])) j++;
        if (j < s.length && s[j] >= "0" && s[j] <= "9" && j - i <= 2) i = j;
        else break;
      } else break;
    }
  }
  return [...out].filter((c) => c.length >= pre.length + 3);
}

/** Tìm payCode trong nội dung: ưu tiên mã dài nhất có trong `known`. */
export function findPayCode(content: string, prefix: string, known: (code: string) => boolean): string | null {
  const c = payCodeCandidates(content, prefix).sort((a, b) => b.length - a.length);
  return c.find(known) ?? null;
}
