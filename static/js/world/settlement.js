// Plans a settlement on the island: where it sits, its paved square, the roads
// out to the coast, a grid of streets around the square and footpaths into the
// countryside. Levels the ground under roads and squares (changing the heights
// in place). What each spot ends up used for is the site plan's job (siteplan.js).
//
// The plan is plain data:
//   { level, centre: [x, z], radius, angle,
//     squares: [{ centre: [x, z], size: [width, depth], angle, height }],
//     roads: [{ type, width, points: [[x, z, y], ...] }] }
// Road types, from humblest to grandest: "path" (dirt), "road" (gravel track), "street" (cobbles).

import { createRandom } from "../random.js";
import { createHeightField } from "./heightfield.js";
import { SEA_LEVEL } from "./heightmap.js";
import { valueNoise } from "./noise.js";
import { createRouter } from "./pathfind.js";
import { buildHarbourTerrain, planHarbour } from "./harbour.js";
import { squareDistance } from "./siteplan.js";

export const ROAD_TYPES = ["path", "road", "street"];
export const ROAD_WIDTH = { path: 1.4, road: 3.2, street: 4.5 };

// radius: extent of the built-up area; square: [width, depth] or null; roads: main roads
// out of town; grid: street grid around the square; paths: footpaths into the countryside;
// mainType: what the main roads are inside the town; extraSquares: more squares in blocks of the grid.
export const SETTLEMENT_LEVELS = {
  none: null,
  hamlet: { radius: 16, square: null, roads: 2, grid: null, paths: 2, mainType: "road", gridType: "road" },
  village: { radius: 30, square: [12, 9], roads: 3, grid: { spacing: 22, radius: 28 }, paths: 3, mainType: "road", gridType: "road" },
  town: { radius: 48, square: [18, 13], roads: 4, grid: { spacing: 24, radius: 46 }, paths: 4, mainType: "street", gridType: "street" },
  city: { radius: 75, square: [24, 18], roads: 6, grid: { spacing: 26, radius: 72 }, paths: 5, mainType: "street", gridType: "street", extraSquares: 1 },
  metropolis: { radius: 110, square: [30, 22], roads: 8, grid: { spacing: 26, radius: 106 }, paths: 6, mainType: "street", gridType: "street", extraSquares: 4 },
};

const EMPTY = { level: "none", centre: null, radius: 0, angle: 0, squares: [], roads: [] };

// Plans the settlement for `options.settlement` on `terrain` ({ heights, ... }, graded in place).
export function planSettlement(terrain, options) {
  const spec = SETTLEMENT_LEVELS[options.settlement];
  if (!spec) return { ...EMPTY };
  const random = createRandom(options.seed * 4241 + 7);
  let field = createHeightField(terrain);

  const site = chooseSite(field, spec, random);
  if (!site) return { ...EMPTY };
  const [cx, cz] = [site.x, site.z];
  const angle = random.range(0, Math.PI / 2);
  const router = createRouter(field);
  const roads = [];
  const addRoad = (type, points) => {
    if (points.length < 2) return;
    roads.push({ type, width: ROAD_WIDTH[type], points });
    router.markUsed(points);
  };

  // Main roads: from the centre out to the coast in roughly even directions.
  const turn = random.range(0, Math.PI * 2);
  for (let k = 0; k < spec.roads; k++) {
    const a = turn + (k / spec.roads) * Math.PI * 2 + random.range(-0.35, 0.35);
    const end = coastPoint(field, cx, cz, a, spec.radius * 0.5);
    if (!end) continue;
    const route = router.route(cx, cz, end[0], end[1]);
    if (!route) continue;
    const points = smooth(route);
    // Inside a town the main roads are paved streets; outside they are tracks.
    for (const [type, part] of splitByDistance(points, cx, cz, spec.radius)) {
      addRoad(type === "inside" ? spec.mainType : "road", part);
    }
  }

  // A street grid around the square, gently bent so it looks laid out by hand.
  if (spec.grid) {
    for (const line of streetGrid(field, cx, cz, angle, spec.grid, options.seed)) addRoad(spec.gridType, line);
  }

  // Footpaths: up to the highest peak and out to quiet beaches, from the nearest road.
  const destinations = [];
  const peak = highestPoint(field);
  if (peak.height > 4 && Math.hypot(peak.x - cx, peak.z - cz) > spec.radius) destinations.push([peak.x, peak.z]);
  for (let tries = 0; destinations.length < spec.paths && tries < 40; tries++) {
    const end = coastPoint(field, cx, cz, random.range(0, Math.PI * 2), spec.radius);
    if (end && destinations.every(([x, z]) => Math.hypot(x - end[0], z - end[1]) > 20)) destinations.push(end);
  }
  for (const [x, z] of destinations.slice(0, spec.paths)) {
    const [sx, sz] = nearestRoadPoint(roads, x, z) ?? [cx, cz];
    if (Math.hypot(sx - x, sz - z) < 20) continue; // a road already goes there
    const route = router.route(sx, sz, x, z, { slopeCost: 12, maxSlope: 0.55, reuse: 0.6 });
    if (route) addRoad("path", smooth(route));
  }

  // The harbour, with a road down to it.
  const harbour = options.features?.includes("harbour")
    ? planHarbour(field, { level: options.settlement, centre: [cx, cz], radius: spec.radius }, random)
    : null;
  if (harbour) {
    for (const back of [0, 4, 8]) {
      const [ax, az] = harbour.access;
      const [sx, sz] = nearestRoadPoint(roads, ax, az) ?? [cx, cz];
      const dir = [ax - sx, az - sz], len = Math.hypot(...dir) || 1;
      const target = [ax - (dir[0] / len) * back, az - (dir[1] / len) * back];
      if (Math.hypot(target[0] - sx, target[1] - sz) < 3) break; // a road already reaches it
      const route = router.route(sx, sz, ...target);
      if (!route) continue;
      addRoad(spec.mainType === "street" && options.settlement !== "village" ? "street" : "road", smooth(route));
      break;
    }
  }

  const squares = [];
  if (spec.square) {
    const [width, depth] = spec.square;
    squares.push({ centre: [round(cx), round(cz)], size: [width, depth], angle: round(angle, 3), height: 0 });
  }
  // Big towns get more squares: whole blocks of the grid, away from the main square and each other.
  if (spec.extraSquares) {
    const node = gridNode(cx, cz, angle, spec.grid.spacing, options.seed);
    const count = Math.ceil(spec.grid.radius / spec.grid.spacing);
    const blocks = [];
    for (let i = -count; i <= count; i++) {
      for (let j = -count; j <= count; j++) {
        const corners = [node(i - 1, j - 1), node(i, j - 1), node(i - 1, j), node(i, j)];
        const centre = [corners.reduce((a, c) => a + c[0], 0) / 4, corners.reduce((a, c) => a + c[1], 0) / 4];
        const d = Math.hypot(centre[0] - cx, centre[1] - cz);
        if (d > spec.radius * 0.3 && d < spec.radius * 0.8) blocks.push({ centre, d, order: random() });
      }
    }
    blocks.sort((a, b) => a.order - b.order);
    const size = [12, 10];
    for (const { centre } of blocks) {
      if (squares.length > spec.extraSquares) break;
      if (squares.some((q) => Math.hypot(q.centre[0] - centre[0], q.centre[1] - centre[1]) < 40)) continue;
      // Clear of every road, on dry, gentle ground.
      const outline = []; // points round the square's edge, as fractions of its size
      for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) {
        for (const b of [-0.5, -0.25, 0, 0.25, 0.5]) {
          if (Math.abs(a) < 0.5 && Math.abs(b) < 0.5) continue;
          outline.push([centre[0] + Math.cos(angle) * a * size[0] - Math.sin(angle) * b * size[1], centre[1] + Math.sin(angle) * a * size[0] + Math.cos(angle) * b * size[1]]);
        }
      }
      const heights = outline.map(([x, z]) => field.heightAt(x, z));
      if (Math.min(...heights) < SEA_LEVEL + 1 || Math.max(...heights) - Math.min(...heights) > 1.5) continue;
      if (roads.some((road) => outline.some(([x, z]) => distanceToPolyline(x, z, road.points) < road.width / 2 + 0.4))) continue;
      squares.push({ centre: [round(centre[0]), round(centre[1])], size, angle: round(angle, 3), height: 0 });
    }
  }

  grade(terrain, field, roads, squares);
  buildHarbourTerrain(terrain, createHeightField(terrain), harbour);
  field = createHeightField(terrain);
  for (const road of roads) {
    road.points = road.points.map(([x, z]) => [round(x), round(z), round(field.heightAt(x, z), 3)]);
  }

  // Order matters when drawing: humbler paving first, so grander paving covers it at crossings.
  roads.sort((a, b) => ROAD_TYPES.indexOf(a.type) - ROAD_TYPES.indexOf(b.type));
  return { level: options.settlement, centre: [round(cx), round(cz)], radius: spec.radius, angle: round(angle, 3), squares, roads, harbour };
}

// The flattest dry spot with room around it, preferring the middle of the island.
function chooseSite(field, spec, random) {
  const size = field.size;
  const reach = Math.max(spec.radius * 0.5, 8);
  let best = null;
  for (let z = 4; z < size; z += 4) {
    for (let x = 4; x < size; x += 4) {
      if (field.heightAt(x, z) < SEA_LEVEL + 1.2) continue;
      let slope = field.slopeAt(x, z) * 4, water = 0, samples = 0;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        for (const f of [0.5, 1]) {
          const px = x + Math.cos(a) * reach * f, pz = z + Math.sin(a) * reach * f;
          samples++;
          if (field.heightAt(px, pz) < SEA_LEVEL + 0.8) water++;
          else slope += field.slopeAt(px, pz);
        }
      }
      const score = (slope / (samples + 4)) * 4 + (water / samples) * 3 +
        (Math.hypot(x - size / 2, z - size / 2) / size) * 1.2 + random() * 0.15;
      if (!best || score < best.score) best = { x, z, score };
    }
  }
  return best;
}

// The last dry point going from (x, z) along angle `a`, at least `minDistance` out, or null.
function coastPoint(field, x, z, a, minDistance) {
  const dx = Math.cos(a), dz = Math.sin(a);
  let last = null;
  for (let r = 2; r < field.size; r += 1) {
    const px = x + dx * r, pz = z + dz * r;
    if (px < 2 || pz < 2 || px > field.size - 2 || pz > field.size - 2) break;
    if (field.heightAt(px, pz) < SEA_LEVEL + 0.9) break;
    last = r;
  }
  if (last === null || last - 2 < minDistance) return null;
  return [x + dx * (last - 2), z + dz * (last - 2)];
}

function highestPoint(field) {
  const n = field.verticesPerSide;
  let best = 0;
  for (let i = 1; i < field.heights.length; i++) if (field.heights[i] > field.heights[best]) best = i;
  return { x: (best % n) * field.cell, z: Math.floor(best / n) * field.cell, height: field.heights[best] };
}

function nearestRoadPoint(roads, x, z) {
  let best = null, bestDistance = Infinity;
  for (const road of roads) {
    for (const p of road.points) {
      const d = Math.hypot(p[0] - x, p[1] - z);
      if (d < bestDistance) [best, bestDistance] = [p, d];
    }
  }
  return best;
}

// Grid streets within grid.radius of the centre, as polylines. Nodes are nudged by noise;
// a segment is kept only over dry, gentle ground.
function streetGrid(field, cx, cz, angle, grid, seed) {
  const { spacing, radius } = grid;
  const count = Math.ceil(radius / spacing) + 1;
  const node = gridNode(cx, cz, angle, spacing, seed);
  const inside = ([x, z]) => Math.hypot(x - cx, z - cz) <= radius;
  const usable = (p, q) => {
    if (!inside(p) || !inside(q)) return false;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k <= 6; k++) {
      const h = field.heightAt(p[0] + ((q[0] - p[0]) * k) / 6, p[1] + ((q[1] - p[1]) * k) / 6);
      if (h < SEA_LEVEL + 1) return false;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return (hi - lo) / Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.22;
  };

  const lines = [];
  for (const along of [true, false]) {
    for (let j = -count; j < count; j++) {
      let line = [];
      for (let i = -count; i < count; i++) {
        const p = along ? node(i, j) : node(j, i);
        const q = along ? node(i + 1, j) : node(j, i + 1);
        if (usable(p, q)) {
          if (!line.length) line.push(p);
          line.push(q);
        } else if (line.length) {
          lines.push(line);
          line = [];
        }
      }
      if (line.length) lines.push(line);
    }
  }
  return lines;
}

// Where grid line i meets grid line j: nudged by noise; lines sit half a block off the
// centre, so the main square fills the middle block.
function gridNode(cx, cz, angle, spacing, seed) {
  const u = [Math.cos(angle), Math.sin(angle)], v = [-Math.sin(angle), Math.cos(angle)];
  return (i, j) => {
    const jitter = (k) => (valueNoise(i * 1.7 + k, j * 1.3, seed + 31) - 0.5) * spacing * 0.3;
    const a = (i + 0.5) * spacing + jitter(0), b = (j + 0.5) * spacing + jitter(5);
    return [cx + u[0] * a + v[0] * b, cz + u[1] * a + v[1] * b];
  };
}

export function distanceToPolyline(x, z, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0), 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// Splits a polyline into ["inside", part] / ["outside", part] pieces by distance from a point.
function splitByDistance(points, cx, cz, radius) {
  const parts = [];
  let current = null;
  for (const p of points) {
    const where = Math.hypot(p[0] - cx, p[1] - cz) <= radius ? "inside" : "outside";
    if (!current || current[0] !== where) {
      const previous = current?.[1].at(-1);
      current = [where, previous ? [previous] : []];
      parts.push(current);
    }
    current[1].push(p);
  }
  return parts;
}

// Grid route -> fewer points (Douglas-Peucker) -> rounded corners (Chaikin).
function smooth(points) {
  let result = simplify(points, 0.9);
  for (let pass = 0; pass < 3; pass++) {
    if (result.length < 3) break;
    const next = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const [ax, az] = result[i], [bx, bz] = result[i + 1];
      next.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    next.push(result.at(-1));
    result = next;
  }
  return result;
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, az] = points[0], [bx, bz] = points.at(-1);
  const length = Math.hypot(bx - ax, bz - az) || 1;
  let worst = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((bx - ax) * (az - points[i][1]) - (ax - points[i][0]) * (bz - az)) / length;
    if (d > worst) [worst, index] = [d, i];
  }
  if (worst <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

// Levels the ground: across each road (following a smoothed profile along it) and under
// each square (to its average height).
function grade(terrain, field, roads, squares) {
  const { heights } = terrain;
  const n = field.verticesPerSide, cell = field.cell;
  const nearest = new Float32Array(n * n).fill(Infinity); // per road: distance to its centre line
  const target = new Float32Array(n * n);
  const touched = [];

  // Visits grid vertices within `reach` of the box [x0, z0]-[x1, z1].
  const visit = (x0, z0, x1, z1, reach, fn) => {
    const c0 = Math.max(Math.floor((Math.min(x0, x1) - reach) / cell), 0);
    const c1 = Math.min(Math.ceil((Math.max(x0, x1) + reach) / cell), n - 1);
    const r0 = Math.max(Math.floor((Math.min(z0, z1) - reach) / cell), 0);
    const r1 = Math.min(Math.ceil((Math.max(z0, z1) + reach) / cell), n - 1);
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) fn(row * n + col, col * cell, row * cell);
  };

  for (const road of roads) {
    const half = road.width / 2 + 0.3;
    const shoulder = 1.5 + road.width * 0.4;
    const points = resample(road.points, 2);
    // Height profile along the road: the ground, smoothed, never below the beach.
    const ground = points.map(([x, z]) => field.heightAt(x, z));
    const profile = ground.map((_, i) => {
      let sum = 0, count = 0;
      for (let k = Math.max(i - 3, 0); k <= Math.min(i + 3, ground.length - 1); k++) {
        sum += ground[k];
        count++;
      }
      return Math.max(sum / count, SEA_LEVEL + 0.6);
    });
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      visit(ax, az, bx, bz, half + shoulder, (k, x, z) => {
        const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / len2, 0), 1);
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d >= nearest[k]) return;
        if (nearest[k] === Infinity) touched.push(k);
        nearest[k] = d;
        target[k] = profile[i - 1] + (profile[i] - profile[i - 1]) * t;
      });
    }
    for (const k of touched) {
      const w = 1 - smoothstep(half, half + shoulder, nearest[k]);
      heights[k] += (target[k] - heights[k]) * w;
      nearest[k] = Infinity;
    }
    touched.length = 0;
  }

  for (const square of squares) {
    const [sx, sz] = square.centre, [w, d] = square.size;
    const reach = Math.hypot(w, d) / 2 + 5;
    const outside = squareDistance(square);
    let sum = 0, count = 0;
    visit(sx, sz, sx, sz, reach, (k, x, z) => {
      if (outside(x, z) <= 0) {
        sum += heights[k];
        count++;
      }
    });
    square.height = round(Math.max(count ? sum / count : field.heightAt(sx, sz), SEA_LEVEL + 0.6), 3);
    visit(sx, sz, sx, sz, reach, (k, x, z) => {
      const o = outside(x, z);
      heights[k] += (square.height - heights[k]) * (1 - smoothstep(0.3, 4, o));
    });
  }
}

// Points along a polyline every `step` metres (keeping both ends).
export function resample(points, step) {
  const out = [[points[0][0], points[0][1]]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const length = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= length) {
      out.push([ax + ((bx - ax) * t) / length, az + ((bz - az) * t) / length]);
      t += step;
    }
    carry = length - (t - step);
  }
  const [lx, lz] = points.at(-1);
  if (Math.hypot(lx - out.at(-1)[0], lz - out.at(-1)[1]) > step * 0.25) out.push([lx, lz]);
  return out;
}

function smoothstep(lo, hi, v) {
  const t = Math.min(Math.max((v - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
}

function round(v, digits = 2) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
