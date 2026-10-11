// Generation options: what the editor lets you choose, their defaults, and how
// they map to the generators' numbers.

import { ARCHITECTURE_IDS } from "./architecture.js";

export const SIZES = {
  // tiles along each map edge (4 m each), the island's typical radius, and grid cells per
  // tile (the two biggest use 1 m cells instead of 0.5 m, to stay quick)
  small: { tiles: 24, islandRadius: 30, segments: 8 },
  medium: { tiles: 32, islandRadius: 42, segments: 8 },
  large: { tiles: 48, islandRadius: 64, segments: 8 },
  huge: { tiles: 64, islandRadius: 86, segments: 8 },
  vast: { tiles: 96, islandRadius: 128, segments: 4 },
  giant: { tiles: 128, islandRadius: 172, segments: 4 },
};

export const CLIMATE_IDS = ["mild", "forest", "mediterranean", "tropical", "savanna", "desert", "tundra"];
export const SETTLEMENT_IDS = ["none", "hamlet", "village", "town", "city", "metropolis"];
// What the urban planner may build besides houses.
export const FEATURE_IDS = ["church", "mill", "wells", "market", "farms", "walls", "harbour"];
export const ARCHITECTURE_CHOICES = ["auto", ...ARCHITECTURE_IDS];

export const DEFAULT_OPTIONS = {
  seed: 1,
  size: "medium",
  hilliness: 0.4,   // 0 = flat plain, 1 = mountains
  vegetation: 0.5,  // 0 = bare, 1 = lush
  peaks: 0,         // 0 = none, 1 = one or two high mountains
  bays: 0.3,        // 0 = a round coast, 1 = many deep bays
  cliffs: 0.25,     // 0 = beaches all round, 1 = mostly cliffs
  islets: 0.3,      // 0 = none, 1 = many rocky islets offshore
  climate: "mild",
  settlement: "village",
  architecture: "auto", // "auto" follows the climate
  density: 0.5,         // how many houses: 0 = a few, 1 = packed
  height: 0.3,          // 0 = low, 1 = tall (more storeys)
  variety: 0.5,         // 0 = plain boxes, 1 = L and T shapes, uneven heights
  features: [...FEATURE_IDS],
};

export const MAX_SEED = 2 ** 31 - 1;

// Fills in defaults and clamps anything out of range, so any input gives a valid world.
export function normalizeOptions(options = {}) {
  const pick = (key, ok) => (ok(options[key]) ? options[key] : DEFAULT_OPTIONS[key]);
  const unit = (v) => typeof v === "number" && Number.isFinite(v);
  const seed = Math.trunc(Number(options.seed));
  return {
    seed: Number.isFinite(seed) ? Math.min(Math.max(seed, 0), MAX_SEED) : DEFAULT_OPTIONS.seed,
    size: pick("size", (v) => Object.hasOwn(SIZES, v)),
    hilliness: clamp01(pick("hilliness", unit)),
    vegetation: clamp01(pick("vegetation", unit)),
    peaks: clamp01(pick("peaks", unit)),
    bays: clamp01(pick("bays", unit)),
    cliffs: clamp01(pick("cliffs", unit)),
    islets: clamp01(pick("islets", unit)),
    climate: pick("climate", (v) => CLIMATE_IDS.includes(v)),
    settlement: pick("settlement", (v) => SETTLEMENT_IDS.includes(v)),
    architecture: pick("architecture", (v) => ARCHITECTURE_CHOICES.includes(v)),
    density: clamp01(pick("density", unit)),
    height: clamp01(pick("height", unit)),
    variety: clamp01(pick("variety", unit)),
    features: Array.isArray(options.features)
      ? FEATURE_IDS.filter((id) => options.features.includes(id))
      : [...DEFAULT_OPTIONS.features],
  };
}

// The heightmap generator's settings for a set of options.
export function terrainSettings(options) {
  const { tiles, islandRadius, segments } = SIZES[options.size];
  const h = options.hilliness;
  return {
    seed: options.seed,
    tiles,
    tileSize: 4,
    segments,
    islandRadius,
    maxHeight: 0.8 + 15 * h ** 1.5,   // 0.8 (a plain) .. 15.8 (mountains)
    featureSize: 13 + 10 * h,         // hills get broader as they get taller
    plains: 2.4 - 0.9 * h,            // exponent that flattens valleys into plains
    ridges: smooth(0.45, 1, h) * 0.65, // share of sharp mountain ridges
    peaks: options.peaks,
    bays: options.bays,
    cliffs: options.cliffs,
    islets: options.islets,
  };
}

// Options as URL query parameters, and back.
export function optionsToQuery(given) {
  const options = normalizeOptions(given);
  return new URLSearchParams({
    seed: options.seed,
    size: options.size,
    hills: Math.round(options.hilliness * 100),
    veg: Math.round(options.vegetation * 100),
    peaks: Math.round(options.peaks * 100),
    bays: Math.round(options.bays * 100),
    cliffs: Math.round(options.cliffs * 100),
    islets: Math.round(options.islets * 100),
    climate: options.climate,
    town: options.settlement,
    arch: options.architecture,
    bdens: Math.round(options.density * 100),
    bheight: Math.round(options.height * 100),
    bvar: Math.round(options.variety * 100),
    feat: options.features.join("."),
  }).toString();
}

export function optionsFromQuery(params) {
  const percent = (key) => (params.has(key) ? Number(params.get(key)) / 100 : undefined);
  return normalizeOptions({
    seed: params.get("seed") ?? DEFAULT_OPTIONS.seed,
    size: params.get("size") ?? undefined,
    hilliness: percent("hills"),
    vegetation: percent("veg"),
    peaks: percent("peaks"),
    bays: percent("bays"),
    cliffs: percent("cliffs"),
    islets: percent("islets"),
    climate: params.get("climate") ?? undefined,
    settlement: params.get("town") ?? undefined,
    architecture: params.get("arch") ?? undefined,
    density: percent("bdens"),
    height: percent("bheight"),
    variety: percent("bvar"),
    features: params.has("feat") ? params.get("feat").split(".").filter(Boolean) : undefined,
  });
}

function clamp01(v) {
  return Math.min(Math.max(v, 0), 1);
}

function smooth(lo, hi, v) {
  const t = clamp01((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}
