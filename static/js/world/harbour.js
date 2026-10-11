// The harbour: where the settlement meets the sea.
//
// The site is the best stretch of coast near the settlement: low (not a cliff), with deep
// enough water close in, and sheltered (land on either side, as in a bay). Villages and
// hamlets get wooden jetties with boats tied up alongside, a couple of boats pulled up on
// the beach and a boathouse. Towns build a stone quay with warehouses, and a breakwater
// curving round the harbour basin with a lighthouse at its tip; cities and metropolises add
// a marina of floating pontoons with sailboats, and a harbour crane.
//
// Plain data, in world coordinates; angle is a heading: its direction is [sin(angle), cos(angle)].
//   quays:  [{ centre, size: [length along the coast, depth out to sea], angle (seaward), height }]
//   moles:  [{ points: [[x, z], ...], width, height }]   breakwaters
//   piers:  [{ start, end, width, height, kind: "jetty" | "pontoon" }]   walkable decks
//   boats:  [{ x, z, angle, kind: "rowboat" | "fishing" | "sailboat", beached }]
//   structures: buildings for the planner: lighthouse, warehouse, boathouse, crane
// plus `access`, the point on land a road should lead to.

import { SEA_LEVEL } from "./heightmap.js";

export const QUAY_HEIGHT = 1.2;
export const MOLE_HEIGHT = 1.4;
export const JETTY_HEIGHT = 1;
export const PONTOON_HEIGHT = 0.45;
const DEEP = -1.6; // water this deep takes a boat

const SCALE = {
  hamlet: { quay: null, jetties: 1, boats: 3 },
  village: { quay: null, jetties: 2, boats: 5 },
  town: { quay: [26, 8], mole: [18, 14], jetties: 1, boats: 7, warehouses: 1, marinas: 0 },
  city: { quay: [36, 10], mole: [24, 20], jetties: 2, boats: 9, warehouses: 2, marinas: 1, crane: true },
  metropolis: { quay: [50, 12], mole: [30, 28], jetties: 2, boats: 12, warehouses: 3, marinas: 2, crane: true },
};

export function planHarbour(field, settlement, random) {
  const scale = SCALE[settlement.level];
  if (!scale) return null;
  const sites = findSites(field, settlement);
  if (!sites.length) return null;
  const site = sites[0];
  const dir = site.dir, along = [dir[1], -dir[0]];
  const angle = Math.atan2(dir[0], dir[1]);
  const at = (u, v) => [site.x + along[0] * u + dir[0] * v, site.z + along[1] * u + dir[1] * v];
  const depth = (p) => field.heightAt(p[0], p[1]);
  const harbour = { quays: [], moles: [], piers: [], boats: [], structures: [], access: round2(at(0, -6)) };

  // A jetty from `start` out along `heading` until the water is deep enough (or maxLength).
  const jetty = (start, heading, maxLength, kind = "jetty") => {
    const d = [Math.sin(heading), Math.cos(heading)];
    let length = 6;
    while (length < maxLength && depth([start[0] + d[0] * length, start[1] + d[1] * length]) > DEEP) length += 1;
    const end = [start[0] + d[0] * length, start[1] + d[1] * length];
    if (depth(end) > -0.5) return null;
    const pier = { start: round2(start), end: round2(end), width: kind === "pontoon" ? 2 : 2.2, height: kind === "pontoon" ? PONTOON_HEIGHT : JETTY_HEIGHT, kind };
    harbour.piers.push(pier);
    return pier;
  };
  // Boats moored alongside a pier, parallel to it, where the water is deep enough.
  const mooring = (pier, count, kinds) => {
    const d = [pier.end[0] - pier.start[0], pier.end[1] - pier.start[1]];
    const length = Math.hypot(...d);
    const heading = Math.atan2(d[0], d[1]);
    for (let i = 0; i < count; i++) {
      const t = 0.45 + (i >> 1) * 0.25 + random() * 0.08;
      if (t > 0.95) break;
      const side = i % 2 ? 1 : -1;
      const kind = kinds[Math.floor(random() * kinds.length)];
      const off = pier.width / 2 + (kind === "rowboat" ? 0.9 : 1.6);
      const x = pier.start[0] + d[0] * t + (d[1] / length) * side * off;
      const z = pier.start[1] + d[1] * t - (d[0] / length) * side * off;
      if (depth([x, z]) < -0.8) harbour.boats.push({ x: round2s(x), z: round2s(z), angle: round3(heading + (random() < 0.5 ? 0 : Math.PI)), kind, beached: false });
    }
  };

  if (!scale.quay) {
    // A village: wooden jetties, boats, a boathouse, and boats pulled up on the beach.
    const roots = [site, ...sites.slice(1).filter((s) => Math.hypot(s.x - site.x, s.z - site.z) > 25)].slice(0, scale.jetties);
    for (const root of roots) {
      const pier = jetty([root.x - root.dir[0] * 1.5, root.z - root.dir[1] * 1.5], Math.atan2(root.dir[0], root.dir[1]), 22);
      if (pier) mooring(pier, Math.ceil(scale.boats / roots.length), ["rowboat", "fishing", "rowboat"]);
    }
    for (const side of [1, -1]) {
      for (let u = 3; u < 10; u += 1.5) {
        const p = at(side * u, -1);
        const h = depth(p);
        if (h > SEA_LEVEL + 0.3 && h < SEA_LEVEL + 1.2) {
          harbour.boats.push({ x: round2s(p[0]), z: round2s(p[1]), angle: round3(angle + 0.3 * side), kind: "rowboat", beached: true });
          break;
        }
      }
    }
    harbour.structures.push({ type: "boathouse", centre: round2(at(7, -5)), size: [4.5, 6], angle: round3(angle), onLand: true });
    return harbour;
  }

  // A town: a stone quay half on the shore, half over the water.
  const [qLength, qDepth] = scale.quay;
  const quayCentre = at(0, qDepth / 2 - 2);
  harbour.quays.push({ centre: round2(quayCentre), size: [qLength, qDepth], angle: round3(angle), height: QUAY_HEIGHT });
  harbour.access = round2(at(0, -6));
  const front = (u) => at(u, qDepth - 2); // a point on the quay's seaward edge

  // Breakwater: out from one end of the quay, then curving round in front of it.
  const side = site.shelterSide;
  const [out, across] = scale.mole;
  const raw = [front(side * (qLength / 2 - 2.5)), at(side * (qLength / 2 + 2), qDepth + out * 0.6), at(side * (qLength / 2 - 4), qDepth + out), at(side * (qLength / 2 - 4 - across), qDepth + out + 2)];
  const mole = [];
  for (const p of smoothPath(raw)) {
    if (mole.length > 2 && depth(p) > SEA_LEVEL + 0.3) break; // back on land: stop
    if (p[0] < 4 || p[1] < 4 || p[0] > field.size - 4 || p[1] > field.size - 4) break;
    mole.push(round2(p));
  }
  if (mole.length > 3) {
    harbour.moles.push({ points: mole, width: 5, height: MOLE_HEIGHT });
    const [tx, tz] = mole.at(-1);
    harbour.structures.push({ type: "lighthouse", centre: [tx, tz], size: [3.4, 3.4], angle: round3(angle), floor: MOLE_HEIGHT });
  }

  // Warehouses along the back of the quay, facing the water.
  for (let i = 0; i < scale.warehouses; i++) {
    const u = (i - (scale.warehouses - 1) / 2) * 10.5;
    if (Math.abs(u) > qLength / 2 - 4.5) continue;
    harbour.structures.push({ type: "warehouse", centre: round2(at(u, 1.5)), size: [9, 6.5], angle: round3(angle), floor: QUAY_HEIGHT });
  }
  if (scale.crane) {
    harbour.structures.push({ type: "crane", centre: round2(at(-side * (qLength / 2 - 3), qDepth - 3.5)), size: [2.2, 2.2], angle: round3(angle), floor: QUAY_HEIGHT });
  }

  // Jetties off the quay's front, away from the breakwater; fishing boats along the quay too.
  const slots = [];
  for (let k = 0; k < scale.jetties + scale.marinas; k++) slots.push(-side * (qLength / 2 - 5) + side * k * ((qLength - 10) / Math.max(scale.jetties + scale.marinas - 1, 1)) * 0.75);
  slots.forEach((u, k) => {
    const marina = k < scale.marinas;
    const pier = jetty(front(u), angle, marina ? 28 : 18, marina ? "pontoon" : "jetty");
    if (!pier) return;
    if (marina) marinaFingers(pier, harbour, depth, random);
    else mooring(pier, 4, ["fishing", "fishing", "rowboat"]);
  });
  for (let u = -qLength / 2 + 4; u < qLength / 2 - 4; u += 7) {
    if (harbour.boats.filter((b) => b.kind !== "sailboat").length >= scale.boats) break;
    if (slots.some((s) => Math.abs(s - u) < 4) || random() < 0.35) continue;
    const [x, z] = at(u, qDepth - 2 + 1.8);
    if (depth([x, z]) < -0.8) harbour.boats.push({ x: round2s(x), z: round2s(z), angle: round3(angle + Math.PI / 2), kind: "fishing", beached: false });
  }
  return harbour;
}

// Finger pontoons on both sides of a marina's walkway, with a sailboat in most berths.
function marinaFingers(pier, harbour, depth, random) {
  const d = [pier.end[0] - pier.start[0], pier.end[1] - pier.start[1]];
  const length = Math.hypot(...d);
  const unit = [d[0] / length, d[1] / length], across = [unit[1], -unit[0]];
  for (let t = 5; t < length - 2; t += 4.5) {
    for (const side of [1, -1]) {
      const root = [pier.start[0] + unit[0] * t + across[0] * side * 1, pier.start[1] + unit[1] * t + across[1] * side * 1];
      const tip = [root[0] + across[0] * side * 5, root[1] + across[1] * side * 5];
      if (depth(tip) > -0.6) continue;
      harbour.piers.push({ start: round2(root), end: round2(tip), width: 1.2, height: PONTOON_HEIGHT, kind: "pontoon" });
      if (random() < 0.8) {
        const berth = [root[0] + across[0] * side * 3 + unit[0] * 2.25, root[1] + across[1] * side * 3 + unit[1] * 2.25];
        if (depth(berth) < -0.8) harbour.boats.push({ x: round2s(berth[0]), z: round2s(berth[1]), angle: round3(Math.atan2(across[0] * side, across[1] * side)), kind: "sailboat", beached: false });
      }
    }
  }
}

// Coast points around the settlement, best harbour first: { x, z (on land at the shore),
// dir (out to sea), shelterSide (the side with less shelter, where a breakwater helps), score }.
function findSites(field, settlement) {
  const [cx, cz] = settlement.centre;
  const sites = [];
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const dir = [Math.cos(a), Math.sin(a)];
    let shore = null;
    for (let r = 3; r < field.size; r += 0.5) {
      const x = cx + dir[0] * r, z = cz + dir[1] * r;
      if (x < 4 || z < 4 || x > field.size - 4 || z > field.size - 4) break;
      if (field.heightAt(x, z) < SEA_LEVEL + 0.2) {
        shore = { x: x - dir[0] * 1.5, z: z - dir[1] * 1.5, r };
        break;
      }
    }
    if (!shore || shore.r > settlement.radius * 2.6) continue;
    // Not a cliff: the land just behind the shore stays low.
    let cliff = false;
    for (let s = 1; s <= 8; s++) if (field.heightAt(shore.x - dir[0] * s, shore.z - dir[1] * s) > SEA_LEVEL + 2.8) cliff = true;
    if (cliff) continue;
    // Deep water close in.
    let reach = 0;
    while (reach < 40 && field.heightAt(shore.x + dir[0] * reach, shore.z + dir[1] * reach) > DEEP) reach += 1;
    if (reach >= 40) continue;
    // Shelter: land to either side, out over the water.
    const along = [dir[1], -dir[0]];
    const shelter = { 1: 0, [-1]: 0 };
    for (const side of [1, -1]) {
      for (const off of [0.5, 0.9, 1.3]) {
        const d = [dir[0] * Math.cos(off) + along[0] * side * Math.sin(off), dir[1] * Math.cos(off) + along[1] * side * Math.sin(off)];
        for (let r = 10; r <= 40; r += 5) {
          if (field.heightAt(shore.x + d[0] * r, shore.z + d[1] * r) > SEA_LEVEL) shelter[side]++;
        }
      }
    }
    const score = shore.r * 0.4 + reach - (shelter[1] + shelter[-1]) * 2.5;
    sites.push({ x: shore.x, z: shore.z, dir, shelterSide: shelter[1] <= shelter[-1] ? 1 : -1, score });
  }
  return sites.sort((a, b) => a.score - b.score);
}

// Raises quays and breakwaters out of the water (after the roads have levelled the ground).
// Quays are flat on top with steep sides, blending into the land behind them.
export function buildHarbourTerrain(terrain, field, harbour) {
  if (!harbour) return;
  const n = field.verticesPerSide, cell = field.cell;
  const visit = (x0, z0, x1, z1, margin, fn) => {
    const c0 = Math.max(Math.floor((Math.min(x0, x1) - margin) / cell), 0), c1 = Math.min(Math.ceil((Math.max(x0, x1) + margin) / cell), n - 1);
    const r0 = Math.max(Math.floor((Math.min(z0, z1) - margin) / cell), 0), r1 = Math.min(Math.ceil((Math.max(z0, z1) + margin) / cell), n - 1);
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) fn(row * n + col, col * cell, row * cell);
  };
  for (const q of harbour.quays) {
    const dir = [Math.sin(q.angle), Math.cos(q.angle)], along = [dir[1], -dir[0]];
    const [length, depth] = q.size;
    visit(q.centre[0], q.centre[1], q.centre[0], q.centre[1], Math.hypot(length, depth) / 2 + 6, (k, x, z) => {
      const u = (x - q.centre[0]) * along[0] + (z - q.centre[1]) * along[1];
      const v = (x - q.centre[0]) * dir[0] + (z - q.centre[1]) * dir[1];
      if (Math.abs(u) > length / 2 + 0.01) return;
      if (v >= -depth / 2 && v <= depth / 2) terrain.heights[k] = q.height;
      else if (v < -depth / 2 && v > -depth / 2 - 5) {
        // Behind the quay: blend into the land.
        const t = (-depth / 2 - v) / 5;
        terrain.heights[k] += (q.height - terrain.heights[k]) * (1 - t * t * (3 - 2 * t));
      }
    });
  }
  for (const mole of harbour.moles) {
    for (let i = 1; i < mole.points.length; i++) {
      const [ax, az] = mole.points[i - 1], [bx, bz] = mole.points[i];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      visit(ax, az, bx, bz, mole.width, (k, x, z) => {
        const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / len2, 0), 1);
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= mole.width / 2) terrain.heights[k] = Math.max(terrain.heights[k], mole.height);
      });
    }
  }
}

// A smooth path through some points (Chaikin), sampled about every metre.
function smoothPath(points) {
  let path = points;
  for (let pass = 0; pass < 3; pass++) {
    const next = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      next.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    next.push(path.at(-1));
    path = next;
  }
  const out = [path[0]];
  for (const p of path) if (Math.hypot(p[0] - out.at(-1)[0], p[1] - out.at(-1)[1]) >= 1) out.push(p);
  return out;
}

const round2 = ([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
const round2s = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;
