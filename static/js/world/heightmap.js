// Procedural heightmap: a hilly island in the sea, with bays, beaches and cliffs
// along its coast, the odd mountain peak, and rocky islets offshore.

import { createRandom } from "../random.js";
import { fbm, ridged, smoothstep01 } from "./noise.js";

export const SEA_LEVEL = 0;  // water surface height; mirrored in waves.js
export const SEABED = -3;    // depth of the open sea floor
export const BEACH = 0.5;    // how far the coastal plain rises above the sea
export const LOWLAND = 0.8;  // extra lift of the interior, so flat islands are not all beach

// Builds { tiles, tileSize, segments, heights } with land from BEACH + LOWLAND up to
// maxHeight + BEACH + LOWLAND in the middle, sloping beaches, and SEABED-deep sea toward the map edges.
//
// featureSize is roughly the world-space width of a hill; islandRadius is the
// typical distance of the coast from the centre (the rest of the map is open sea).
// plains (> 1) flattens low ground; ridges (0..1) mixes in sharp mountain crests.
// The coast and extras, each 0..1:
//   bays    how many deep, rounded inlets bite into the coast
//   cliffs  how much of the coast drops steeply into the sea instead of sloping to a beach
//   islets  how many small rocky islands stand offshore
//   peaks   whether one or two mountains rise above the hills, and how high
export function generateHeightmap({
  seed = 1,
  tiles = 32,
  tileSize = 4,
  segments = 8,
  maxHeight = 6,
  featureSize = 14,
  islandRadius = 34.5,
  plains = 1.6,
  ridges = 0,
  bays = 0,
  cliffs = 0,
  islets = 0,
  peaks = 0,
} = {}) {
  const n = tiles * segments + 1;
  const cell = tileSize / segments;
  const random = createRandom(seed * 7121 + 3);
  const raw = new Float32Array(n * n);
  let lo = Infinity, hi = -Infinity;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const x = (col * cell) / featureSize, z = (row * cell) / featureSize;
      let v = fbm(x, z, seed);
      if (ridges > 0) v = v * (1 - ridges) + ridged(x * 0.7, z * 0.7, seed + 300) * ridges;
      raw[row * n + col] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const span = hi - lo || 1;

  const half = Math.floor(n / 2) * cell;
  const radius = Math.min(islandRadius, half * 0.72);
  const wobble = radius * 0.49;     // how far the coastline wanders in and out
  const beachShore = radius * 0.33; // width of the slope from land to open sea at a beach
  const cliffShore = 2.5;           // ... and at a cliff
  const coastScale = radius * 0.72; // coastline bends scale with the island

  // Bays: dips in the coastline at a few angles.
  const bayList = Array.from({ length: Math.round(bays * 4) }, () => ({
    angle: random.range(0, Math.PI * 2),
    width: random.range(0.22, 0.45),                // radians
    depth: radius * random.range(0.2, 0.42) * (0.5 + bays * 0.5),
  }));
  const bayAt = (a) => {
    let depth = 0, share = 0;
    for (const bay of bayList) {
      const t = angleBetween(a, bay.angle) / bay.width;
      if (t < 1) {
        const w = (1 - t * t) ** 2;
        depth += bay.depth * w;
        share = Math.max(share, w);
      }
    }
    return { depth, share };
  };
  // Cliffs: stretches of coast picked by smooth noise around the island (none inside bays).
  const cliffAt = (a, bayShare) => {
    if (cliffs <= 0) return 0;
    const v = fbm(Math.cos(a) * 1.4 + 9, Math.sin(a) * 1.4 + 9, seed + 77, 3);
    const from = 0.66 - cliffs * 0.36;
    return smoothstep01((v - from) / 0.08) * (1 - bayShare);
  };
  const cliffHeight = 2.5 + cliffs * 4; // how far cliff tops rise above the land behind them

  // Peaks: one or two mountains well inland.
  const peakList = peaks > 0.05
    ? Array.from({ length: peaks > 0.6 ? 2 : 1 }, (_, i) => {
      const a = random.range(0, Math.PI * 2), d = random.range(0, radius * 0.4);
      return {
        x: half + Math.cos(a) * d, z: half + Math.sin(a) * d,
        radius: radius * random.range(0.3, 0.45) * (i ? 0.75 : 1),
        height: (5 + peaks * 14) * (i ? 0.7 : 1),
      };
    })
    : [];

  const heights = new Float32Array(n * n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const x = col * cell, z = row * cell;
      const dist = Math.hypot(x - half, z - half);
      const a = Math.atan2(z - half, x - half);
      const bay = bayAt(a);
      const cliff = cliffAt(a, bay.share);
      // (Float32 storage can put a value a hair below lo; a negative base would give NaN.)
      let land = LOWLAND + Math.max((raw[row * n + col] - lo) / span, 0) ** plains * maxHeight;
      for (const peak of peakList) {
        const t = Math.hypot(x - peak.x, z - peak.z) / peak.radius;
        if (t < 1) land += peak.height * smoothstep01(1 - t) ** 1.4 * (0.75 + 0.5 * ridged(x / 9, z / 9, seed + 41, 3));
      }
      // Behind a cliff the land tilts up toward its edge.
      land += cliffHeight * cliff * smoothstep01(dist / radius);
      const coast = radius - bay.depth + (fbm(x / coastScale, z / coastScale, seed + 900, 3) - 0.5) * wobble;
      const shore = beachShore + (cliffShore - beachShore) * cliff;
      const inland = 1 - smoothstep01((dist - coast + shore / 2) / shore);
      heights[row * n + col] = SEABED + (land + BEACH - SEABED) * inland;
    }
  }

  // Islets: small rocky islands in the sea around the main one.
  for (let i = Math.round(islets * 7), tries = 0; i > 0 && tries < 60; tries++) {
    const a = random.range(0, Math.PI * 2), d = radius * random.range(1.12, 1.5);
    const r = random.range(2, 3.5 + islets * 4);
    const x = half + Math.cos(a) * d, z = half + Math.sin(a) * d;
    if (x < r + 3 || z < r + 3 || x > 2 * half - r - 3 || z > 2 * half - r - 3) continue;
    const top = random.range(1.2, 2.5 + islets * 4);
    raiseIslet(heights, n, cell, x, z, r, top, seed + i * 13);
    i--;
  }

  for (let k = 0; k < heights.length; k++) heights[k] = Math.round(heights[k] * 1000) / 1000;
  return { tiles, tileSize, segments, heights };
}

// A craggy mound of rock rising from the seabed to `top`, about `r` metres across its base.
function raiseIslet(heights, n, cell, cx, cz, r, top, seed) {
  const reach = r * 1.4;
  const c0 = Math.max(Math.floor((cx - reach) / cell), 0), c1 = Math.min(Math.ceil((cx + reach) / cell), n - 1);
  const r0 = Math.max(Math.floor((cz - reach) / cell), 0), r1 = Math.min(Math.ceil((cz + reach) / cell), n - 1);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const x = col * cell, z = row * cell;
      const edge = r * (0.75 + 0.5 * fbm(x / 3, z / 3, seed, 2)); // ragged outline
      const t = Math.hypot(x - cx, z - cz) / edge;
      if (t >= 1) continue;
      const h = SEABED + (top - SEABED) * smoothstep01(1 - t) ** 0.6 * (0.85 + 0.3 * ridged(x / 2, z / 2, seed + 5, 2));
      const k = row * n + col;
      heights[k] = Math.max(heights[k], h);
    }
  }
}

// Absolute difference between two angles, 0..π.
function angleBetween(a, b) {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
