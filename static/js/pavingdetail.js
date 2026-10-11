// Close-up detail for paving: a tileable image covering DETAIL_METRES × DETAIL_METRES
// with one pattern per channel: r = dirt, g = gravel, b = cobblestones (a is unused).
// The shader multiplies the paving colour by value / DETAIL_MEAN, so each channel
// averages DETAIL_MEAN and the paving keeps its colour overall.

import { createRandom } from "./random.js";
import { hash } from "./world/noise.js";

export const DETAIL_METRES = 2;
export const DETAIL_MEAN = 0.62;

// Returns { size, data: Uint8Array (RGBA, size × size) }.
export function createPavingDetail(size = 512, seed = 1) {
  const random = createRandom(seed);
  const channels = [dirt(size, random, seed), gravel(size, random, seed), cobbles(size, random, seed)];
  for (const channel of channels) normalizeMean(channel, DETAIL_MEAN);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(Math.min(Math.max(channels[c][i], 0), 1) * 255);
    data[i * 4 + 3] = 255;
  }
  return { size, data };
}

// Smooth, tileable value noise: `period` lattice cells across the image, octaves add finer grain.
function tileableNoise(size, period, seed, octaves = 4) {
  const out = new Float32Array(size * size);
  let amplitude = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const gy = y / cell, iy = Math.floor(gy), fy = smooth(gy - iy);
      for (let x = 0; x < size; x++) {
        const gx = x / cell, ix = Math.floor(gx), fx = smooth(gx - ix);
        const h = (i, j) => hash(((i % p) + p) % p, ((j % p) + p) % p, seed + o * 101);
        const near = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * fx;
        const far = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * fx;
        out[y * size + x] += (near + (far - near) * fy) * amplitude;
      }
    }
    norm += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

// Small domed stones stamped onto `target` (wrapping around the edges, so the image tiles).
function pebbles(target, size, random, count, [rMin, rMax], [bMin, bMax]) {
  for (let k = 0; k < count; k++) {
    const cx = random() * size, cy = random() * size;
    const rx = random.range(rMin, rMax), ry = rx * random.range(0.7, 1);
    const brightness = random.range(bMin, bMax);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const u = (x - cx) / rx, v = (y - cy) / ry, r2 = u * u + v * v;
        if (r2 > 1) continue;
        // Lit from the upper left, darker toward the rim.
        const shade = brightness * (1 - 0.35 * r2) + (-u - v) * 0.05;
        target[wrap(y, size) * size + wrap(x, size)] = shade;
      }
    }
  }
}

function dirt(size, random, seed) {
  const out = tileableNoise(size, 4, seed + 11);
  const grain = tileableNoise(size, 64, seed + 12, 2);
  for (let i = 0; i < out.length; i++) out[i] = 0.55 + (out[i] - 0.5) * 0.35 + (grain[i] - 0.5) * 0.12;
  pebbles(out, size, random, 260, [2, 5], [0.5, 0.8]);
  return out;
}

function gravel(size, random, seed) {
  const out = tileableNoise(size, 32, seed + 21, 3);
  for (let i = 0; i < out.length; i++) out[i] = 0.32 + out[i] * 0.12; // the dark gaps between stones
  pebbles(out, size, random, 5200, [2.5, 6], [0.55, 0.95]);
  return out;
}

// Rows of rounded stones of uneven lengths with mortar joints, slightly domed.
function cobbles(size, random, seed) {
  const out = new Float32Array(size * size);
  const grain = tileableNoise(size, 64, seed + 31, 2);
  const rows = 8, rowHeight = size / rows;
  const joint = 4.5, corner = 9;
  for (let row = 0; row < rows; row++) {
    const widths = [];
    let total = 0;
    while (total < size) {
      const w = rowHeight * random.range(0.75, 1.35);
      widths.push(w);
      total += w;
    }
    const scale = size / total; // stretch the row so it tiles exactly
    let x0 = random() * size;
    for (const w of widths) {
      const width = w * scale;
      const brightness = random.range(0.5, 0.85);
      const cx = x0 + width / 2, cy = row * rowHeight + rowHeight / 2;
      const hx = width / 2 - joint, hy = rowHeight / 2 - joint;
      for (let y = Math.floor(row * rowHeight); y < (row + 1) * rowHeight; y++) {
        for (let x = Math.floor(x0); x < x0 + width; x++) {
          // Signed distance to the rounded stone outline (negative inside).
          const qx = Math.abs(x + 0.5 - cx) - (hx - corner), qy = Math.abs(y + 0.5 - cy) - (hy - corner);
          const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
          const k = wrap(y, size) * size + wrap(x, size);
          if (d > 0) {
            out[k] = 0.18 + grain[k] * 0.1; // mortar
          } else {
            const bevel = smooth(Math.min(-d / 10, 1));
            const tilt = ((cy - y) / hy + (cx - x) / hx) * 0.04; // lit from the upper left
            out[k] = brightness * (0.68 + 0.32 * bevel) + tilt + (grain[k] - 0.5) * 0.08;
          }
        }
      }
      x0 += width;
    }
  }
  return out;
}

function normalizeMean(values, mean) {
  let sum = 0;
  for (const v of values) sum += v;
  const scale = mean / (sum / values.length);
  for (let i = 0; i < values.length; i++) values[i] *= scale;
}

function wrap(i, size) {
  return ((i % size) + size) % size;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}
