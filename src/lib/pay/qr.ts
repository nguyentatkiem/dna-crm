// Bộ mã hoá QR gọn, không phụ thuộc thư viện: chế độ byte, mức sửa lỗi M, phiên bản 1–20.
// Thuật toán theo ISO/IEC 18004 (cách tổ chức tham khảo bộ "QR Code generator" của Nayuki, MIT).
// Dùng được cả trình duyệt lẫn server (không import Node).

/** Số mã sửa lỗi mỗi khối và số khối cho mức M, chỉ số = phiên bản. */
const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
export const QR_MAX_VERSION = 20;
const FORMAT_BITS_M = 0; // L=1, M=0, Q=3, H=2

export type QrMatrix = { size: number; version: number; mask: number; modules: boolean[][] };

const getBit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/** Số module dữ liệu thô (sau khi trừ mẫu chức năng) của một phiên bản. */
export function rawDataModules(ver: number) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

/** Số byte dữ liệu (không tính mã sửa lỗi) của phiên bản ở mức M. */
export const dataCodewordsM = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver];

// ---------- Reed–Solomon trên GF(256), đa thức 0x11D ----------

function gfMul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

export function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}

export function rsRemainder(data: number[], divisor: number[]): number[] {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((c, i) => (r[i] ^= gfMul(c, factor)));
  }
  return r;
}

// ---------- Bit thông tin định dạng / phiên bản ----------

/** 15 bit định dạng (mức M + mặt nạ) đã XOR mặt nạ 0x5412. */
export function formatBits(mask: number) {
  const data = (FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 bit thông tin phiên bản (từ phiên bản 7). */
export function versionBits(ver: number) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// ---------- Dữ liệu ----------

const utf8 = (s: string) => Array.from(new TextEncoder().encode(s));

/** Chọn phiên bản nhỏ nhất chứa được `len` byte ở chế độ byte, mức M. */
export function pickVersion(len: number, minVersion = 1) {
  for (let v = Math.max(1, minVersion); v <= QR_MAX_VERSION; v++) {
    const ccBits = v <= 9 ? 8 : 16;
    if (4 + ccBits + len * 8 <= dataCodewordsM(v) * 8) return v;
  }
  throw new Error("Nội dung quá dài để tạo mã QR");
}

/** Chuỗi byte dữ liệu đã đệm (chưa có mã sửa lỗi). */
export function dataCodewords(bytes: number[], ver: number): number[] {
  const bits: number[] = [];
  const put = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewordsM(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

/** Chia khối, thêm mã sửa lỗi, đan xen theo chuẩn. */
export function addEccAndInterleave(data: number[], ver: number): number[] {
  const numBlocks = BLOCKS_M[ver];
  const eccLen = ECC_PER_BLOCK_M[ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => (i !== shortLen - eccLen || j >= numShort) && out.push(b[i]));
  return out;
}

// ---------- Ma trận ----------

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function baseMatrix(ver: number) {
  const size = ver * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    m[y][x] = dark;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const al = alignmentPositions(ver);
  const n = al.length;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  drawFormat(m, fn, size, 0);
  if (ver >= 7) {
    const bits = versionBits(ver);
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }
  return { m, fn, size };
}

function drawFormat(m: boolean[][], fn: boolean[][], size: number, mask: number) {
  const bits = formatBits(mask);
  const set = (x: number, y: number, dark: boolean) => {
    m[y][x] = dark;
    fn[y][x] = true;
  };
  for (let i = 0; i <= 5; i++) set(8, i, getBit(bits, i));
  set(8, 7, getBit(bits, 6));
  set(8, 8, getBit(bits, 7));
  set(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, getBit(bits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, getBit(bits, i));
  set(8, size - 8, true);
}

function drawCodewords(m: boolean[][], fn: boolean[][], size: number, data: number[]) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < data.length * 8) {
          m[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
  }
}

/** Điểm phạt theo chuẩn (N1–N4) để chọn mặt nạ đẹp nhất. */
export function penalty(m: boolean[][]) {
  const size = m.length;
  let p = 0;
  const runs = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        if (b < size && get(a, b) === get(a, b - 1)) run++;
        else {
          if (run >= 5) p += 3 + (run - 5);
          run = 1;
        }
      }
    }
  };
  runs((y, x) => m[y][x]);
  runs((x, y) => m[y][x]);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  const pat = [true, false, true, true, true, false, true];
  const finderLike = (get: (i: number) => boolean) => {
    for (let i = 0; i + 7 <= size; i++) {
      if (!pat.every((v, k) => get(i + k) === v)) continue;
      const lightBefore = [1, 2, 3, 4].every((k) => i - k < 0 || !get(i - k));
      const lightAfter = [0, 1, 2, 3].every((k) => i + 7 + k >= size || !get(i + 7 + k));
      if (lightBefore || lightAfter) p += 40;
    }
  };
  for (let a = 0; a < size; a++) {
    finderLike((i) => m[a][i]);
    finderLike((i) => m[i][a]);
  }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const total = size * size;
  p += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return p;
}

/** Mã hoá chuỗi (UTF-8) thành ma trận QR, mức sửa lỗi M. `mask` để ép mặt nạ (kiểm thử). */
export function encodeQr(text: string, opts: { minVersion?: number; mask?: number } = {}): QrMatrix {
  const bytes = utf8(text);
  const version = pickVersion(bytes.length, opts.minVersion);
  const all = addEccAndInterleave(dataCodewords(bytes, version), version);
  const { m, fn, size } = baseMatrix(version);
  drawCodewords(m, fn, size, all);
  let best: { mask: number; modules: boolean[][]; score: number } | null = null;
  const masks = opts.mask != null ? [opts.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const mask of masks) {
    const mm = m.map((r) => r.slice());
    const f = fn.map((r) => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) mm[y][x] = !mm[y][x];
    drawFormat(mm, f, size, mask);
    const score = opts.mask != null ? 0 : penalty(mm);
    if (!best || score < best.score) best = { mask, modules: mm, score };
  }
  return { size, version, mask: best!.mask, modules: best!.modules };
}

/** Đường SVG (path "d") vẽ các module tối, gộp theo hàng ngang cho nhẹ. Có lề trắng `margin` module. */
export function qrPath(q: QrMatrix, margin = 4) {
  const parts: string[] = [];
  q.modules.forEach((row, y) => {
    for (let x = 0; x < q.size; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < q.size && row[x + w]) w++;
      parts.push(`M${x + margin} ${y + margin}h${w}v1h-${w}z`);
      x += w - 1;
    }
  });
  return parts.join("");
}

/** Chuỗi SVG hoàn chỉnh (dùng cho trang in, email, server). */
export function qrSvg(text: string, opts: { size?: number; margin?: number; dark?: string; light?: string; title?: string } = {}) {
  const q = encodeQr(text);
  const margin = opts.margin ?? 4;
  const dim = q.size + margin * 2;
  const px = opts.size ?? 240;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img"${opts.title ? ` aria-label="${esc(opts.title)}"` : ""}><rect width="${dim}" height="${dim}" fill="${opts.light ?? "#fff"}"/><path d="${qrPath(q, margin)}" fill="${opts.dark ?? "#000"}"/></svg>`;
}
