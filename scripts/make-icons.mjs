// Vẽ biểu tượng PWA (PNG) chỉ bằng thư viện có sẵn của Node: nền gradient xanh → tím, chữ "D" trắng.
// Chạy: node scripts/make-icons.mjs  → ghi vào public/icons/
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const FROM = [0x00, 0x73, 0xea]; // --primary
const TO = [0xa2, 0x5d, 0xdc]; // tím của Logo

// CRC32 cho từng khối PNG.
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bit
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // không lọc
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Điểm (u, v) trong [0,1]² có thuộc nền bo góc không. r = bán kính góc (tỉ lệ). */
function inRounded(u, v, r) {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(u, r), 1 - r);
  const cy = Math.min(Math.max(v, r), 1 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

/** Chữ "D" trong hộp [0,1]²: thân đứng + nửa elip, khoét lỗ bên trong. */
function inD(x, y) {
  const t = 0.2; // độ dày nét
  const half = (px, py, x0, y0, y1, rx) => {
    const ry = (y1 - y0) / 2;
    const cy = (y0 + y1) / 2;
    if (py < y0 || py > y1) return false;
    if (px >= x0 && px <= 0.5) return true;
    if (px > 0.5) return ((px - 0.5) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
    return false;
  };
  const outer = half(x, y, 0, 0, 1, 0.42);
  const inner = half(x, y, t, t * 0.9, 1 - t * 0.9, 0.42 - t);
  return outer && !inner;
}

/** Vẽ một biểu tượng. maskable = phủ kín nền (không bo góc), chữ nằm trong vùng an toàn 80%. */
function draw(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4; // khử răng cưa 4×4
  const radius = maskable ? 0 : 0.22;
  const glyph = maskable ? 0.4 : 0.5; // chiều cao chữ so với cạnh
  const gx0 = 0.5 - (glyph * 0.92) / 2 + glyph * 0.02;
  const gy0 = 0.5 - glyph / 2;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const u = (px + (sx + 0.5) / S) / size;
          const v = (py + (sy + 0.5) / S) / size;
          if (!inRounded(u, v, radius)) continue;
          bg++;
          if (inD((u - gx0) / glyph, (v - gy0) / glyph)) fg++;
        }
      const n = S * S;
      const k = (px + py) / (2 * (size - 1)); // gradient chéo
      const base = FROM.map((c, i) => c + (TO[i] - c) * k);
      const a = bg / n;
      const f = bg ? fg / bg : 0;
      const o = (py * size + px) * 4;
      for (let i = 0; i < 3; i++) buf[o + i] = Math.round(base[i] * (1 - f) + 255 * f);
      buf[o + 3] = Math.round(a * 255);
    }
  return png(size, size, buf);
}

mkdirSync(OUT, { recursive: true });
const files = {
  "icon-192.png": draw(192),
  "icon-512.png": draw(512),
  "maskable-192.png": draw(192, { maskable: true }),
  "maskable-512.png": draw(512, { maskable: true }),
  "apple-touch-icon.png": draw(180, { maskable: true }),
  "favicon-32.png": draw(32),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  console.log(`public/icons/${name}  ${data.length} B`);
}
