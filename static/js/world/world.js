// A world is everything generated from a set of options: the terrain and what
// grows on it. It is plain data, so it can be exported to JSON and loaded back.

import { BUSH_KINDS, TREE_KINDS } from "./climates.js";
import { createHeightField } from "./heightfield.js";
import { generateHeightmap } from "./heightmap.js";
import { normalizeOptions, terrainSettings } from "./options.js";
import { planSettlement, ROAD_TYPES, SETTLEMENT_LEVELS } from "./settlement.js";
import { createSitePlan } from "./siteplan.js";
import { ARCHITECTURE_IDS } from "./architecture.js";
import { gradeBuildings, planBuildings } from "./planner.js";
import { generateVegetation } from "./vegetation.js";

export const FORMAT = "citymaker-world";
export const VERSION = 5; // 2 added the settlement (roads, squares), 3 buildings and fences, 4 fields, walls and the architecture, 5 the harbour
const PROP_KINDS = ["trees", "rocks", "bushes", "grass", "flowers"];
const NO_SETTLEMENT = {
  level: "none", centre: null, radius: 0, angle: 0, squares: [], roads: [],
  architecture: "cottage", buildings: [], fences: [], fields: [], fortifications: null, harbour: null,
};
const BUILDING_TYPES = [
  "house", "church", "hall", "mill", "well", "fountain", "stall", "barn", "shed", "haystack", "shrine",
  "lighthouse", "warehouse", "boathouse", "crane", "signpost", "waymark", "noticeboard",
];
const BOAT_KINDS = ["rowboat", "fishing", "sailboat"];

// Terrain first, then the settlement's roads (which level the ground they run on), then its
// buildings (levelling their plots), then plants around it all.
// sitePlan (what each spot is used for) is derived from the rest, so it is not saved in JSON.
export function generateWorld(options) {
  const normalized = normalizeOptions(options);
  const terrain = generateHeightmap(terrainSettings(normalized));
  const settlement = planSettlement(terrain, normalized);
  let field = createHeightField(terrain);
  Object.assign(settlement, planBuildings(field, settlement, createSitePlan(field, settlement), normalized));
  gradeBuildings(terrain, field, settlement.buildings);
  field = createHeightField(terrain);
  // Levelling the plots can nudge the ground at the roadside; keep the roads' heights true to it.
  for (const road of settlement.roads) {
    road.points = road.points.map(([x, z]) => [x, z, Math.round(field.heightAt(x, z) * 1000) / 1000]);
  }
  const sitePlan = createSitePlan(field, settlement);
  const props = generateVegetation(field, normalized, { sitePlan, settlement });
  return { options: normalized, terrain, field, settlement, sitePlan, props };
}

// JSON-ready object (heights rounded to millimetres).
export function worldToJSON(world) {
  const { tiles, tileSize, segments, heights } = world.terrain;
  return {
    format: FORMAT,
    version: VERSION,
    options: world.options,
    terrain: { tiles, tileSize, segments, heights: Array.from(heights, (h) => Math.round(h * 1000) / 1000) },
    settlement: world.settlement,
    props: world.props,
  };
}

// Rebuilds a world from worldToJSON() output; throws a readable error for anything else.
export function worldFromJSON(data) {
  // (Files saved before the rename to CityMaker say "citybuilder-world".)
  if (data?.format !== FORMAT && data?.format !== "citybuilder-world") throw new Error("not a CityMaker world file");
  if (data.version > VERSION) throw new Error(`world file version ${data.version} is newer than this app`);
  const t = data.terrain ?? {};
  const count = (v) => Number.isInteger(v) && v > 0;
  if (!count(t.tiles) || !count(t.segments) || !(t.tileSize > 0)) throw new Error("terrain size is missing or invalid");
  if (!Array.isArray(t.heights) || !t.heights.every(Number.isFinite)) throw new Error("terrain.heights is missing or invalid");
  const terrain = { tiles: t.tiles, tileSize: t.tileSize, segments: t.segments, heights: Float32Array.from(t.heights) };
  const field = createHeightField(terrain); // also checks the number of heights

  const props = {};
  for (const kind of PROP_KINDS) {
    const items = data.props?.[kind] ?? [];
    if (!Array.isArray(items)) throw new Error(`props.${kind} must be a list`);
    props[kind] = items.filter((item) => Array.isArray(item) && Number.isFinite(item[0]) && Number.isFinite(item[1]));
  }
  props.trees = props.trees.filter((item) => TREE_KINDS.includes(item[4]));
  props.bushes = props.bushes.filter((item) => BUSH_KINDS.includes(item[4]));
  const settlement = settlementFromJSON(data.settlement);
  return { options: normalizeOptions(data.options), terrain, field, settlement, sitePlan: createSitePlan(field, settlement), props };
}

// Version 1 files have no settlement; anything malformed is dropped rather than rejected.
function settlementFromJSON(data) {
  if (!data || !Object.hasOwn(SETTLEMENT_LEVELS, data.level) || !data.centre) return { ...NO_SETTLEMENT };
  const finite = (...values) => values.every(Number.isFinite);
  const roads = (Array.isArray(data.roads) ? data.roads : []).filter((road) =>
    ROAD_TYPES.includes(road?.type) && road.width > 0 && Array.isArray(road.points) && road.points.length >= 2 &&
    road.points.every((p) => Array.isArray(p) && finite(p[0], p[1])));
  const squares = (Array.isArray(data.squares) ? data.squares : []).filter((s) =>
    finite(s?.centre?.[0], s?.centre?.[1], s?.size?.[0], s?.size?.[1], s?.angle, s?.height));
  const buildings = (Array.isArray(data.buildings) ? data.buildings : []).filter((b) =>
    BUILDING_TYPES.includes(b?.type) && finite(b.centre?.[0], b.centre?.[1], b.size?.[0], b.size?.[1], b.angle, b.floor));
  const points = (list, min) => Array.isArray(list) && list.length >= min && list.every((p) => finite(p?.[0], p?.[1]));
  const fences = (Array.isArray(data.fences) ? data.fences : []).filter((f) => ["fence", "wall"].includes(f?.type) && points(f.points, 2));
  const fields = (Array.isArray(data.fields) ? data.fields : []).filter((f) =>
    finite(f?.centre?.[0], f?.centre?.[1], f?.size?.[0], f?.size?.[1], f?.angle) && typeof f.crop === "string");
  const wall = data.fortifications;
  const fortifications = wall && ["stone", "palisade"].includes(wall.kind) && points(wall.ring, 4) && points(wall.towers ?? [], 0) &&
    Array.isArray(wall.gates) && wall.gates.every((g) => finite(g?.x, g?.z, g?.angle, g?.width))
    ? { kind: wall.kind, ring: wall.ring, gates: wall.gates, towers: wall.towers ?? [] }
    : null;
  return {
    level: data.level, centre: data.centre, radius: Number(data.radius) || 0, angle: Number(data.angle) || 0, squares, roads,
    architecture: ARCHITECTURE_IDS.includes(data.architecture) ? data.architecture : "cottage",
    buildings, fences, fields, fortifications, harbour: harbourFromJSON(data.harbour),
  };
}

function harbourFromJSON(data) {
  if (!data || typeof data !== "object") return null;
  const finite = (...values) => values.every(Number.isFinite);
  const list = (value, ok) => (Array.isArray(value) ? value.filter(ok) : []);
  return {
    quays: list(data.quays, (q) => finite(q?.centre?.[0], q?.centre?.[1], q?.size?.[0], q?.size?.[1], q?.angle, q?.height)),
    moles: list(data.moles, (m) => finite(m?.width, m?.height) && Array.isArray(m.points) && m.points.length >= 2 && m.points.every((p) => finite(p?.[0], p?.[1]))),
    piers: list(data.piers, (p) => finite(p?.start?.[0], p?.start?.[1], p?.end?.[0], p?.end?.[1], p?.width, p?.height) && ["jetty", "pontoon"].includes(p.kind)),
    boats: list(data.boats, (b) => finite(b?.x, b?.z, b?.angle) && BOAT_KINDS.includes(b.kind)),
    structures: list(data.structures, (s) => BUILDING_TYPES.includes(s?.type) && finite(s.centre?.[0], s.centre?.[1], s.size?.[0], s.size?.[1], s.angle)),
    access: data.access ?? null,
  };
}
