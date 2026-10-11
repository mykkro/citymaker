// Scatters scenery (trees, rocks, bushes, grass, flowers) over a height field.
//
// Each prop is a compact list so exported worlds stay small:
//   trees:   [x, z, scale, rotation, kind]     kind from TREE_KINDS
//   bushes:  [x, z, scale, rotation, kind]     kind from BUSH_KINDS
//   rocks:   [x, z, scale, rotation, variant]  variant 0..ROCK_VARIANTS-1
//   grass:   [x, z, scale, rotation]
//   flowers: [x, z, scale, rotation]
// Trees and rocks are solid; their footprint radius at scale 1 is solidRadius(kind, item).

import { createRandom } from "../random.js";
import { CLIMATES } from "./climates.js";
import { BEACH, LOWLAND, SEA_LEVEL } from "./heightmap.js";
import { fbm } from "./noise.js";
import { USE } from "./siteplan.js";

export const ROCK_VARIANTS = 4;
export const SPAWN_CLEARANCE = 3.5; // keep the map centre free of solid props
const TREE_RADIUS = { palm: 0.25, cactus: 0.28, cypress: 0.25, olive: 0.28, acacia: 0.22, baobab: 0.55 };

// Lowest ground (above the sea) each kind grows on: plants stay off the sand.
export const MIN_GROUND = { trees: 0.9, rocks: 0.25, bushes: 0.8, grass: 0.75, flowers: 0.8 };
// How far each kind keeps from roads and squares (trees for their crowns, grass barely).
const ROAD_CLEARANCE = { trees: 2, rocks: 1.2, bushes: 1, grass: 0.2, flowers: 0.4 };
// Minimum spacing radius (at scale 1) used when placing, so props don't interpenetrate.
const SPACING = { trees: 0.9, rocks: 0.6, bushes: 0.5 };

export function solidRadius(kind, item) {
  if (kind === "trees") return (TREE_RADIUS[item[4]] ?? 0.3) * item[2];
  if (kind === "rocks") return 0.5 * item[2];
  return 0;
}

// Circles bucketed on a grid for fast "is this spot free" checks.
class SpatialHash {
  constructor(cell = 2) {
    this.cell = cell;
    this.buckets = new Map();
  }

  key(kx, kz) {
    return kx * 100003 + kz;
  }

  add(x, z, r) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (!this.buckets.has(k)) this.buckets.set(k, []);
    this.buckets.get(k).push([x, z, r]);
  }

  isFree(x, z, r) {
    const kx = Math.floor(x / this.cell), kz = Math.floor(z / this.cell);
    const reach = 1 + Math.floor((r + 2) / this.cell); // 2 bounds the largest stored radius
    for (let bx = kx - reach; bx <= kx + reach; bx++) {
      for (let bz = kz - reach; bz <= kz + reach; bz++) {
        for (const [ox, oz, orad] of this.buckets.get(this.key(bx, bz)) ?? []) {
          if (Math.hypot(x - ox, z - oz) < r + orad) return false;
        }
      }
    }
    return true;
  }
}

// options: normalized generation options (seed, climate, vegetation).
// sitePlan: keeps plants off paving, buildings and (except grass and flowers) yards;
// settlement: its built-up area keeps few trees and rocks.
export function generateVegetation(field, options, { sitePlan = null, settlement = null } = {}) {
  const climate = CLIMATES[options.climate];
  const { seed } = options;
  const random = createRandom(seed * 7919 + 17);
  const size = field.size;
  const centre = size / 2;
  const taken = new SpatialHash();
  const lush = options.vegetation * 2; // 0..2, 1 at the default
  const area = size * size;
  const snowLine = climate.snowLine ?? Infinity;

  const spot = (margin = 1) => [random.range(margin, size - margin), random.range(margin, size - margin)];
  const clearanceAt = sitePlan ? sitePlan.distanceAt : () => Infinity;
  const blocked = (kind, x, z) => {
    const use = sitePlan?.useAt(x, z);
    return use === USE.building || use === USE.wall || use === USE.field || (use === USE.yard && kind !== "grass" && kind !== "flowers");
  };
  const ground = (kind, x, z) => field.heightAt(x, z) >= SEA_LEVEL + MIN_GROUND[kind] &&
    clearanceAt(x, z) >= ROAD_CLEARANCE[kind] && !blocked(kind, x, z);
  // 0 in the middle of the settlement, 1 out in the countryside.
  const countryside = (x, z) => {
    if (!settlement?.centre) return 1;
    const d = Math.hypot(x - settlement.centre[0], z - settlement.centre[1]);
    return smoothstep(settlement.radius * 0.6, settlement.radius * 1.1, d);
  };
  const nearSpawn = (x, z) => Math.hypot(x - centre, z - centre) < SPAWN_CLEARANCE;
  // Low-frequency mask in [0, 1]; high values are forest clusters.
  const forest = (x, z) => fbm(x / 18, z / 18, seed + 500, 3);
  const forestLine = climate.forest - (options.vegetation - 0.5) * 0.15;
  const r2 = (v) => Math.round(v * 100) / 100;
  const angle = () => r2(random.range(0, Math.PI * 2));
  // Grass and flowers are capped, so the biggest islands stay quick to build and draw.
  const CAPS = { grass: 60000, flowers: 6000 };
  const tries = (perArea, kind) => Math.min(Math.round(area * perArea * climate.density[kind] * (kind === "rocks" ? 1 : lush)), CAPS[kind] ?? Infinity);
  const describe = (x, z) => {
    const height = field.heightAt(x, z);
    const altitude = Math.min(Math.max((height - BEACH - LOWLAND) / 10, 0), 1);
    return { height, altitude, slope: field.slopeAt(x, z) };
  };

  const trees = [];
  for (let i = tries(0.15, "trees"); i > 0; i--) {
    const [x, z] = spot();
    const chance = Math.max((forest(x, z) - forestLine) * 4, climate.scattered) * countryside(x, z);
    if (random() > chance || field.slopeAt(x, z) > 0.6 || nearSpawn(x, z) || !ground("trees", x, z)) continue;
    const here = describe(x, z);
    if (here.height > snowLine - 0.8) continue; // tree line
    const kind = climate.treeKind(random, here);
    const scale = random.range(0.8, 1.35);
    const radius = SPACING.trees * scale;
    if (!taken.isFree(x, z, radius)) continue;
    taken.add(x, z, radius);
    trees.push([r2(x), r2(z), r2(scale), angle(), kind]);
  }

  const rocks = [];
  for (let i = tries(0.06, "rocks"); i > 0; i--) {
    const [x, z] = spot();
    const here = describe(x, z);
    const chance = (0.12 + here.slope * 1.2 + here.altitude * 0.25) * Math.min(climate.density.rocks, 1.5) * countryside(x, z);
    if (random() > chance || nearSpawn(x, z) || !ground("rocks", x, z)) continue;
    const scale = random() < 0.9 ? random.range(0.5, 1.2) : random.range(1.6, 2.4); // occasional boulder
    const radius = SPACING.rocks * scale;
    if (!taken.isFree(x, z, radius)) continue;
    taken.add(x, z, radius);
    rocks.push([r2(x), r2(z), r2(scale), angle(), Math.floor(random() * ROCK_VARIANTS)]);
  }

  const bushes = [];
  for (let i = tries(0.08, "bushes"); i > 0; i--) {
    const [x, z] = spot();
    // Most bushes sit around forest edges, a few anywhere.
    const edge = 1 - Math.abs(forest(x, z) - forestLine - 0.05) * 6;
    if (random() > Math.max(edge, 0.08) * (0.3 + 0.7 * countryside(x, z)) || field.slopeAt(x, z) > 0.7 || !ground("bushes", x, z)) continue;
    const here = describe(x, z);
    if (here.height > snowLine) continue;
    const scale = random.range(0.6, 1.3);
    const radius = SPACING.bushes * scale;
    if (!taken.isFree(x, z, radius)) continue;
    taken.add(x, z, radius);
    bushes.push([r2(x), r2(z), r2(scale), angle(), climate.bushKind(random, here)]);
  }

  // Grass and flowers are small and soft, so they may overlap each other.
  const grass = [];
  for (let i = tries(0.9, "grass"); i > 0; i--) {
    const [x, z] = spot(0.3);
    if (field.slopeAt(x, z) > 0.55 || random() < (field.heightAt(x, z) / field.maxHeight) * 0.6) continue;
    if (!ground("grass", x, z) || field.heightAt(x, z) > snowLine - 0.3) continue;
    grass.push([r2(x), r2(z), r2(random.range(0.7, 1.4)), angle()]);
  }

  const flowers = [];
  for (let i = tries(0.12, "flowers"); i > 0; i--) {
    const [x, z] = spot(0.3);
    // Flowers prefer meadows: open ground away from forests.
    if (random() < forest(x, z) * 1.4 - 0.3 || field.slopeAt(x, z) > 0.4) continue;
    if (!ground("flowers", x, z) || field.heightAt(x, z) > snowLine - 0.5) continue;
    if (!taken.isFree(x, z, 0.15)) continue;
    flowers.push([r2(x), r2(z), r2(random.range(0.7, 1.2)), angle()]);
  }

  return { trees, rocks, bushes, grass, flowers };
}

function smoothstep(lo, hi, v) {
  const t = Math.min(Math.max((v - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
}
