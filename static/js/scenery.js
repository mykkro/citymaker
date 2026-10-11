// Builds all static scenery (trees, rocks, bushes, grass, flowers) into one merged
// geometry, plus the solid obstacles used for collision. Placement comes from the
// world generator (world/vegetation.js); colours from the world's climate.

import * as mat4 from "./mat4.js";
import { cone, cylinder, ellipsoid, flatShade, jitter, merge, transform } from "./shapes.js";
import { ROCK_VARIANTS, solidRadius } from "./world/vegetation.js";

const BARK = [0.45, 0.3, 0.18];
const LEAF = [0.33, 0.58, 0.22];
const LEAF_DARK = [0.24, 0.47, 0.2];
const PINE = [0.17, 0.4, 0.25];
const PINE_COLD = [0.15, 0.33, 0.26];
const SNOW = [0.94, 0.96, 0.98];
const BIRCH_BARK = [0.88, 0.86, 0.8];
const BIRCH_MARK = [0.22, 0.2, 0.18];
const BIRCH_LEAF = [0.5, 0.7, 0.3];
const PALM_BARK = [0.62, 0.5, 0.34];
const PALM_RING = [0.52, 0.41, 0.27];
const PALM_LEAF = [0.27, 0.56, 0.2];
const PALM_LEAF_DARK = [0.2, 0.46, 0.17];
const COCONUT = [0.4, 0.27, 0.14];
const CACTUS = [0.32, 0.55, 0.3];
const DEAD_WOOD = [0.44, 0.38, 0.32];
const JUNGLE = [0.15, 0.43, 0.16];
const JUNGLE_LIGHT = [0.23, 0.53, 0.19];
const STONE = [0.56, 0.54, 0.51];
const BUSH = [0.27, 0.5, 0.2];
const SHRUB = [0.55, 0.5, 0.3];
const SHRUB_LIGHT = [0.64, 0.57, 0.36];
const STEM = [0.25, 0.5, 0.2];
const OLIVE_WOOD = [0.42, 0.38, 0.32];
const OLIVE_LEAF = [0.52, 0.6, 0.42];
const OLIVE_LEAF_DARK = [0.42, 0.5, 0.35];
const CYPRESS = [0.14, 0.3, 0.17];
const STONE_PINE = [0.2, 0.42, 0.22];
const PINE_BARK = [0.52, 0.36, 0.26];
const ACACIA_LEAF = [0.38, 0.52, 0.22];
const ACACIA_BARK = [0.36, 0.3, 0.24];
const BAOBAB_BARK = [0.58, 0.5, 0.43];

const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0], Z_AXIS = [0, 0, 1];
const POINT_UP = mat4.rotationAxis(X_AXIS, -Math.PI / 2); // turns +z-pointing cones to +y

// A cylinder from `base` going `length` up, then tilted away from vertical by `tilt`
// and turned by `yaw`: a branch, a cactus arm, a palm trunk segment.
function limb(base, yaw, tilt, length, radius, color, sides = 5) {
  const m = [mat4.translation(...base), mat4.rotationAxis(Y_AXIS, yaw), mat4.rotationAxis(Z_AXIS, tilt)]
    .reduce((acc, next) => mat4.multiply(acc, next));
  return transform(cylinder([0, length, 0], radius, length, color, sides), m);
}

function upCone(y, radius, height, color, sides = 7) {
  return flatShade(transform(cone([0, 0, 0], radius, height, color, sides), mat4.multiply(mat4.translation(0, y, 0), POINT_UP)));
}

function oak() {
  return merge(
    cylinder([0, 1.4, 0], 0.14, 1.55, BARK),
    flatShade(ellipsoid([0, 1.95, 0], [0.95, 0.8, 0.95], LEAF, 5, 8)),
    flatShade(ellipsoid([0.4, 2.45, 0.15], [0.6, 0.55, 0.6], LEAF, 5, 7)),
    flatShade(ellipsoid([-0.35, 2.35, -0.25], [0.55, 0.5, 0.55], LEAF_DARK, 5, 7)),
  );
}

const PINE_TIERS = [[0.6, 0.95, 1.3], [1.25, 0.75, 1.1], [1.85, 0.5, 0.95]]; // [y, radius, height]

function pine() {
  return merge(cylinder([0, 0.8, 0], 0.12, 0.95, BARK), ...PINE_TIERS.map(([y, r, h]) => upCone(y, r, h, PINE)));
}

// A pine with snow on the upper part of every tier (the snow cone sits just outside the green one).
function snowPine() {
  return merge(
    cylinder([0, 0.8, 0], 0.12, 0.95, BARK),
    ...PINE_TIERS.flatMap(([y, r, h]) => [upCone(y, r, h, PINE_COLD), upCone(y + h * 0.45, r * 0.6, h * 0.56, SNOW)]),
  );
}

function birch() {
  return merge(
    cylinder([0, 2.2, 0], 0.08, 2.25, BIRCH_BARK),
    ...[0.45, 0.9, 1.35, 1.75].map((y) => cylinder([0, y, 0], 0.085, 0.05, BIRCH_MARK)),
    flatShade(ellipsoid([0, 2.45, 0], [0.55, 0.85, 0.55], BIRCH_LEAF, 5, 7)),
    flatShade(ellipsoid([0.25, 2.1, 0.1], [0.4, 0.5, 0.4], BIRCH_LEAF, 4, 6)),
    flatShade(ellipsoid([-0.2, 2.8, -0.1], [0.35, 0.45, 0.35], LEAF, 4, 6)),
  );
}

// Curved, ringed trunk with a crown of drooping fronds and a few coconuts.
function palm() {
  const parts = [];
  const segments = 6, step = 0.48;
  const lean = (y) => 0.09 * y * y;
  for (let i = 0; i < segments; i++) {
    const y0 = i * step, y1 = (i + 1) * step;
    const dx = lean(y1) - lean(y0);
    const length = Math.hypot(dx, step);
    const radius = 0.13 - i * 0.008;
    parts.push(limb([lean(y0), y0, 0], 0, -Math.atan2(dx, step), length, radius, i % 2 ? PALM_RING : PALM_BARK, 6));
  }
  const top = [lean(segments * step), segments * step, 0];
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const droop = i % 2 ? 0.65 : 0.3;
    const leaf = ellipsoid([0, 0, 0.7], [0.2, 0.03, 0.75], i % 3 ? PALM_LEAF : PALM_LEAF_DARK, 3, 6);
    const m = [mat4.translation(...top), mat4.rotationAxis(Y_AXIS, (i / fronds) * Math.PI * 2 + i * 0.3), mat4.rotationAxis(X_AXIS, droop)]
      .reduce((acc, next) => mat4.multiply(acc, next));
    parts.push(flatShade(transform(leaf, m)));
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    parts.push(ellipsoid([top[0] + Math.cos(a) * 0.13, top[1] - 0.12, Math.sin(a) * 0.13], [0.09, 0.1, 0.09], COCONUT, 4, 6));
  }
  return merge(...parts);
}

// A saguaro: a column with two upturned arms.
function cactus() {
  const arm = (side, y, rise) => [
    limb([0, y, 0], side > 0 ? 0 : Math.PI, -Math.PI / 2, 0.36, 0.09, CACTUS, 6),
    ellipsoid([0.38 * side, y, 0], [0.1, 0.1, 0.1], CACTUS, 4, 6),
    cylinder([0.38 * side, y + rise, 0], 0.1, rise, CACTUS, 6),
    ellipsoid([0.38 * side, y + rise, 0], [0.1, 0.08, 0.1], CACTUS, 3, 6),
  ];
  return flatShade(merge(
    cylinder([0, 1.75, 0], 0.17, 1.8, CACTUS, 8),
    ellipsoid([0, 1.75, 0], [0.17, 0.13, 0.17], CACTUS, 4, 8),
    ...arm(1, 0.8, 0.55),
    ...arm(-1, 1.1, 0.42),
  ));
}

function deadTree() {
  return merge(
    cylinder([0, 1.8, 0], 0.11, 1.85, DEAD_WOOD),
    limb([0, 1.2, 0], 0, 0.8, 0.75, 0.05, DEAD_WOOD),
    limb([0, 1.5, 0], 2.2, 0.7, 0.6, 0.045, DEAD_WOOD),
    limb([0, 1.75, 0], 4.1, 0.45, 0.5, 0.04, DEAD_WOOD),
    limb([0, 0.9, 0], 3.4, 1.0, 0.5, 0.045, DEAD_WOOD),
    limb([0.4, 1.68, 0], 0.6, -0.5, 0.3, 0.03, DEAD_WOOD),
  );
}

// Tall broadleaf with a wide, flat crown.
function jungleTree() {
  return merge(
    cylinder([0, 2.6, 0], 0.16, 2.65, BARK),
    limb([0, 0.25, 0], 0.4, 0.9, 0.45, 0.08, BARK), // buttress roots
    limb([0, 0.25, 0], 2.6, 0.9, 0.45, 0.08, BARK),
    limb([0, 0.25, 0], 4.5, 0.9, 0.45, 0.08, BARK),
    flatShade(ellipsoid([0, 2.85, 0], [1.3, 0.5, 1.3], JUNGLE, 4, 9)),
    flatShade(ellipsoid([0.5, 3.2, 0.3], [0.8, 0.42, 0.8], JUNGLE_LIGHT, 4, 7)),
    flatShade(ellipsoid([-0.55, 3.1, -0.35], [0.75, 0.38, 0.75], JUNGLE, 4, 7)),
  );
}

// Short, gnarled trunk splitting in two under a silvery, lumpy crown.
function olive(random) {
  return merge(
    limb([0, 0, 0], 0, 0.25, 0.9, 0.12, OLIVE_WOOD),
    limb([-0.2, 0.85, 0], 2.5, 0.5, 0.6, 0.08, OLIVE_WOOD),
    limb([-0.2, 0.85, 0], 0.4, -0.55, 0.65, 0.08, OLIVE_WOOD),
    flatShade(jitter(ellipsoid([0, 1.55, 0], [0.95, 0.55, 0.9], OLIVE_LEAF, 4, 8), [0, 1.55, 0], 0.15, random)),
    flatShade(jitter(ellipsoid([0.45, 1.75, 0.2], [0.55, 0.4, 0.55], OLIVE_LEAF_DARK, 4, 7), [0.45, 1.75, 0.2], 0.15, random)),
    flatShade(jitter(ellipsoid([-0.5, 1.7, -0.25], [0.5, 0.38, 0.5], OLIVE_LEAF, 4, 7), [-0.5, 1.7, -0.25], 0.15, random)),
  );
}

// A tall, dark, narrow flame.
function cypress() {
  return merge(
    cylinder([0, 0.5, 0], 0.1, 0.55, BARK),
    flatShade(ellipsoid([0, 2.1, 0], [0.42, 1.75, 0.42], CYPRESS, 7, 8)),
    upCone(3.4, 0.25, 0.75, CYPRESS, 6),
  );
}

// Stone pine: a tall bare trunk carrying a wide, flat umbrella of a crown.
function umbrellaPine() {
  return merge(
    limb([0, 0, 0], 0, 0.12, 3.1, 0.13, PINE_BARK),
    limb([-0.3, 2.6, 0], 3.4, 0.9, 0.8, 0.06, PINE_BARK),
    limb([-0.3, 2.7, 0], 0.4, -0.8, 0.9, 0.06, PINE_BARK),
    flatShade(ellipsoid([-0.3, 3.35, 0], [1.6, 0.42, 1.5], STONE_PINE, 4, 10)),
    flatShade(ellipsoid([0.2, 3.6, 0.3], [0.9, 0.3, 0.9], LEAF_DARK, 3, 8)),
  );
}

// Flat-topped acacia: a slim trunk forking into a wide, thin canopy.
function acacia() {
  const forks = [0, 2.1, 4.2].map((yaw) => limb([0, 1.3, 0], yaw, 0.75, 1.3, 0.06, ACACIA_BARK));
  return merge(
    limb([0, 0, 0], 0, 0.1, 1.35, 0.1, ACACIA_BARK),
    ...forks,
    flatShade(ellipsoid([0, 2.45, 0], [1.9, 0.22, 1.7], ACACIA_LEAF, 3, 10)),
    flatShade(ellipsoid([0.6, 2.6, -0.4], [0.9, 0.18, 0.9], LEAF, 3, 8)),
  );
}

// Baobab: a fat bottle of a trunk with a few stubby branches and small tufts of leaves.
function baobab() {
  const branches = [0, 1.3, 2.5, 3.8, 5.0].flatMap((yaw, i) => {
    const tilt = 0.9 + (i % 2) * 0.3;
    // Where limb() puts the branch's end: tilted off vertical, then turned by yaw.
    const tip = [-Math.cos(yaw) * Math.sin(tilt) * 0.85, 2.25 + Math.cos(tilt) * 0.85, Math.sin(yaw) * Math.sin(tilt) * 0.85];
    return [limb([0, 2.25, 0], yaw, tilt, 0.85, 0.1, BAOBAB_BARK), flatShade(ellipsoid(tip, [0.4, 0.22, 0.4], LEAF, 3, 6))];
  });
  return merge(
    ellipsoid([0, 1.15, 0], [0.62, 1.3, 0.62], BAOBAB_BARK, 6, 9),
    cylinder([0, 2.4, 0], 0.32, 0.4, BAOBAB_BARK, 8),
    ...branches,
  );
}

function rock(random, color) {
  return flatShade(jitter(ellipsoid([0, 0.22, 0], [0.6, 0.45, 0.55], color, 4, 7), [0, 0.22, 0], 0.22, random));
}

function bush() {
  return merge(
    ellipsoid([0, 0.3, 0], [0.5, 0.4, 0.5], BUSH, 6, 9),
    ellipsoid([0.35, 0.25, 0.15], [0.35, 0.3, 0.35], LEAF, 5, 8),
    ellipsoid([-0.3, 0.22, -0.1], [0.35, 0.28, 0.35], LEAF_DARK, 5, 8),
  );
}

// Dry, twiggy desert or tundra scrub.
function shrub(random) {
  return merge(
    flatShade(jitter(ellipsoid([0, 0.22, 0], [0.42, 0.28, 0.42], SHRUB, 4, 7), [0, 0.22, 0], 0.3, random)),
    flatShade(jitter(ellipsoid([0.2, 0.3, 0.1], [0.25, 0.2, 0.25], SHRUB_LIGHT, 3, 6), [0.2, 0.3, 0.1], 0.3, random)),
  );
}

// Thin upright triangles, emitted double-sided with upward normals so both faces
// light the same way: grass blades and flower stems.
function blades(random, count, { base, tip, spread, height, lean, width = 0.035 }) {
  const positions = [], normals = [], colors = [], indices = [], tips = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.8;
    const r = spread[0] + random() * spread[1];
    const bx = Math.cos(angle) * r, bz = Math.sin(angle) * r;
    const h = height[0] + random() * height[1];
    const l = lean[0] + random() * lean[1];
    const side = [-Math.sin(angle) * width, Math.cos(angle) * width];
    const top = [bx + Math.cos(angle) * l, h, bz + Math.sin(angle) * l];
    tips.push(top);
    const first = positions.length / 3;
    [[bx - side[0], 0, bz - side[1]], [bx + side[0], 0, bz + side[1]], top].forEach((v, k) => {
      positions.push(...v);
      normals.push(0, 1, 0);
      colors.push(...(k === 2 ? tip : base));
    });
    indices.push(first, first + 1, first + 2, first, first + 2, first + 1);
  }
  return {
    geometry: {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: new Uint32Array(indices),
    },
    tips,
  };
}

function grassTuft(random, colors, tall = 1) {
  return blades(random, 5, { ...colors, spread: [0.04, 0.08], height: [0.3 * tall, 0.25 * tall], lean: [0.08 * tall, 0.12 * tall] }).geometry;
}

// A few flowers on thin stems, in one or two of the climate's colours.
function flowerPatch(random, palette) {
  const stems = blades(random, 5, { base: STEM, tip: STEM, spread: [0.05, 0.15], height: [0.22, 0.14], lean: [0.02, 0.05], width: 0.012 });
  const first = palette[Math.floor(random() * palette.length)];
  const second = palette[Math.floor(random() * palette.length)];
  const heads = stems.tips.map((p, i) => ellipsoid(p, [0.05, 0.035, 0.05], i % 2 ? second : first, 3, 5));
  return merge(stems.geometry, ...heads);
}

export function buildScenery(props, field, climate, random) {
  const rockColor = STONE.map((v, i) => (v + climate.ground.rock[i]) / 2);
  const templates = {
    trees: {
      oak: oak(), pine: pine(), birch: birch(), palm: palm(), cactus: cactus(), snowPine: snowPine(), deadTree: deadTree(),
      jungle: jungleTree(), olive: olive(random), cypress: cypress(), umbrellaPine: umbrellaPine(), acacia: acacia(), baobab: baobab(),
    },
    rocks: Array.from({ length: ROCK_VARIANTS }, () => rock(random, rockColor)),
    bushes: { bush: bush(), shrub: shrub(random) },
    grass: Array.from({ length: 6 }, () => grassTuft(random, climate.grassTuft, climate.grassHeight)),
    flowers: Array.from({ length: 6 }, () => flowerPatch(random, climate.flowerColors)),
  };
  // How far each kind sinks into the ground (per unit scale), to hide gaps on slopes.
  const sink = { trees: 0.05, rocks: 0.12, bushes: 0.08, grass: 0.02, flowers: 0.02 };

  const parts = [];
  const obstacles = [];
  for (const kind of Object.keys(templates)) {
    for (const item of props[kind] ?? []) {
      const [x, z, scale, rotation, variant] = item;
      const options = templates[kind];
      const template = options[variant ?? Math.floor(random() * options.length)];
      if (!template) continue;
      const y = field.heightAt(x, z) - sink[kind] * scale;
      const model = mat4.multiply(
        mat4.multiply(mat4.translation(x, y, z), mat4.rotationAxis(Y_AXIS, rotation)),
        mat4.scaling(scale),
      );
      const shade = 0.88 + random() * 0.24;
      const tint = [shade * (0.96 + random() * 0.08), shade, shade * (0.96 + random() * 0.08)];
      parts.push(transform(template, model, tint));
      const radius = solidRadius(kind, item);
      if (radius > 0) obstacles.push({ x, z, radius, static: true });
    }
  }
  return { geometry: merge(...parts), obstacles };
}
