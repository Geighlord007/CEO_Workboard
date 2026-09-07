/**
 * 纯 Node 离线图标生成器（零依赖：仅用内置 zlib）
 * 输出 public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png
 *
 * 设计：深空蓝紫渐变底 + 霓虹辉光 + 微弱点阵网格 + 居中 3×3 点阵 W 标
 * （每个点按行列染成 青→紫→粉 渐变，呼应看板里点阵 LOGO）
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

/* ---------------- 最小 PNG 编码器 ---------------- */
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 颜色工具 ---------------- */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
// 分段线性渐变：stops = [[t, rgb], ...]
function gradient(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = clamp01((t - t0) / (t1 - t0));
      return c0.map((v, j) => lerp(v, c1[j], k));
    }
  }
  return stops[stops.length - 1][1];
}
const BG_STOPS = [
  [0.0, hex("#07080f")],
  [0.42, hex("#0d0f26")],
  [0.72, hex("#1c1236")],
  [1.0, hex("#0a0c1e")],
];
// 辉光：青(左上) / 紫(右下) / 粉(右上)
const GLOWS = [
  { x: 0.13, y: 0.07, r: 0.72, c: hex("#38bdf8"), s: 0.16 },
  { x: 0.9, y: 0.95, r: 0.8, c: hex("#a78bfa"), s: 0.2 },
  { x: 0.96, y: 0.04, r: 0.6, c: hex("#f472b6"), s: 0.07 },
];
// 3×3 点阵 W 标配色（index 3 为空位）
const DOT_COLS = [
  hex("#a5f3fc"), hex("#67e8f9"), hex("#22d3ee"), null,
  hex("#a5b4fc"), hex("#818cf8"), hex("#f0abfc"), hex("#e879f9"), hex("#f472b6"),
];
const DOT_ON = [0, 1, 2, 4, 5, 6, 7, 8];

function renderPixel(u, v, side) {
  // 1) 背景对角渐变
  let c = gradient(BG_STOPS, clamp01((u + v) / 2));
  // 2) 霓虹辉光（叠加）
  for (const g of GLOWS) {
    const d = Math.hypot(u - g.x, v - g.y) / g.r;
    if (d < 1) {
      const f = (1 - d) * (1 - d) * g.s * 255;
      c[0] += g.c[0] * f / 255;
      c[1] += g.c[1] * f / 255;
      c[2] += g.c[2] * f / 255;
    }
  }
  // 3) 极淡点阵网格（中心让位给 LOGO）
  const gs = 0.058;
  const gx = ((u % gs) + gs) % gs;
  const gy = ((v % gs) + gs) % gs;
  const dc = Math.hypot(u - 0.5, v - 0.5);
  const fade = clamp01((dc - 0.17) / 0.2);
  if (Math.hypot(gx - gs / 2, gy - gs / 2) < 0.0065) {
    const a = 0.10 * fade;
    c[0] = c[0] * (1 - a) + 210 * a;
    c[1] = c[1] * (1 - a) + 220 * a;
    c[2] = c[2] * (1 - a) + 255 * a;
  }
  // 4) 居中 3×3 点阵 LOGO
  const half = side / 2;
  const cw = side / 3;
  const hs = cw * 0.36; // 半个圆角方块
  const rad = cw * 0.11;
  for (let i = 0; i < 9; i++) {
    if (!DOT_ON.includes(i)) continue;
    const col = i % 3;
    const row = (i / 3) | 0;
    const cx = 0.5 - half + cw * col + cw / 2;
    const cy = 0.5 - half + cw * row + cw / 2;
    const dx = Math.abs(u - cx) - (hs - rad);
    const dy = Math.abs(v - cy) - (hs - rad);
    const dist =
      Math.min(Math.max(dx, dy), 0) +
      Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) -
      rad;
    const colr = DOT_COLS[i];
    if (dist <= 0) {
      // 方块内部：近边略提亮
      const hl = clamp01(1 + dist / (hs * 0.5)) * 0.12;
      c = [
        Math.min(255, colr[0] + (255 - colr[0]) * hl),
        Math.min(255, colr[1] + (255 - colr[1]) * hl),
        Math.min(255, colr[2] + (255 - colr[2]) * hl),
      ];
    } else if (dist < cw * 0.85) {
      // 光晕
      const g2 = (1 - dist / (cw * 0.85)) ** 2 * 0.34;
      c[0] += colr[0] * g2 / 255 * 60;
      c[1] += colr[1] * g2 / 255 * 60;
      c[2] += colr[2] * g2 / 255 * 60;
    }
  }
  return c.map((v) => Math.min(255, Math.max(0, Math.round(v))));
}

function renderIcon(size, mode) {
  const ss = 2; // 2×2 超采样抗锯齿
  const big = size * ss;
  const side = mode === "maskable" ? 0.46 : 0.5;
  const buf = Buffer.alloc(big * big * 4);
  const o = 0.5 / big;
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const u = (x + o) / big;
      const v = (y + o) / big;
      const rgb = renderPixel(u, v, side);
      const idx = (y * big + x) * 4;
      buf[idx] = rgb[0];
      buf[idx + 1] = rgb[1];
      buf[idx + 2] = rgb[2];
      buf[idx + 3] = 255;
    }
  }
  // 超采样降为最终尺寸
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const idx = ((y * ss + sy) * big + (x * ss + sx)) * 4;
          r += buf[idx];
          g += buf[idx + 1];
          b += buf[idx + 2];
          a += buf[idx + 3];
        }
      }
      const oi = (y * size + x) * 4;
      out[oi] = Math.round(r / (ss * ss));
      out[oi + 1] = Math.round(g / (ss * ss));
      out[oi + 2] = Math.round(b / (ss * ss));
      out[oi + 3] = Math.round(a / (ss * ss));
    }
  }
  // 非 maskable：圆角蒙版
  if (mode !== "maskable") {
    const rad = size * 0.185;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const qx = Math.abs(x + 0.5 - size / 2) - (size / 2 - rad);
        const qy = Math.abs(y + 0.5 - size / 2) - (size / 2 - rad);
        const d =
          Math.min(Math.max(qx, qy), 0) +
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
          rad;
        if (d > 0) {
          const idx = (y * size + x) * 4;
          const cov = clamp01(1 - d); // 1px 软边
          out[idx + 3] = Math.round(out[idx + 3] * cov);
        }
      }
    }
  }
  return encodePng(size, out);
}

const targets = [
  { file: "icon-192.png", size: 192, mode: "any" },
  { file: "icon-512.png", size: 512, mode: "any" },
  { file: "maskable-512.png", size: 512, mode: "maskable" },
  { file: "apple-touch-icon.png", size: 180, mode: "any" },
];
for (const t of targets) {
  const png = renderIcon(t.size, t.mode);
  const p = join(outDir, t.file);
  writeFileSync(p, png);
  console.log("生成", p, png.length, "bytes");
}
console.log("done.");
