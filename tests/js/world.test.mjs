import assert from "node:assert/strict";
import { test } from "node:test";

import { BUSH_KINDS, CLIMATES, TREE_KINDS } from "../../static/js/world/climates.js";
import { createHeightField } from "../../static/js/world/heightfield.js";
import { BEACH, generateHeightmap, LOWLAND, SEA_LEVEL, SEABED } from "../../static/js/world/heightmap.js";
import {
  CLIMATE_IDS, DEFAULT_OPTIONS, normalizeOptions, optionsFromQuery, optionsToQuery, SIZES, terrainSettings,
} from "../../static/js/world/options.js";
import { ROAD_TYPES } from "../../static/js/world/settlement.js";
import { MIN_GROUND, solidRadius } from "../../static/js/world/vegetation.js";
import { generateWorld, worldFromJSON, worldToJSON } from "../../static/js/world/world.js";

const landShare = (heights) => heights.filter((h) => h > SEA_LEVEL).length / heights.length;
const world = generateWorld({ seed: 5 });

test("the heightmap has one value per grid vertex", () => {
  const t = generateHeightmap({ seed: 3, tiles: 4, segments: 5 });
  assert.equal(t.heights.length, 21 * 21);
});

test("it is an island: sea at the edges, land in the middle", () => {
  const field = world.field;
  const size = field.size;
  for (const [x, z] of [[0, 0], [size, 0], [0, size], [size, size], [size / 2, 0.5], [0.5, size / 2]]) {
    assert.ok(field.heightAt(x, z) < SEA_LEVEL - 2, `edge (${x}, ${z}) is open sea`);
  }
  assert.ok(field.heightAt(size / 2, size / 2) > SEA_LEVEL + BEACH, "centre is land");
  assert.ok(Math.min(...world.terrain.heights) >= SEABED - 0.01);
  const cliffTops = 2.5 + world.options.cliffs * 4;
  assert.ok(field.maxHeight <= terrainSettings(world.options).maxHeight + BEACH + LOWLAND + cliffTops + 0.01);
  const land = landShare(world.terrain.heights);
  assert.ok(land > 0.15 && land < 0.45, `land share ${land}`);
});

test("every size, flat or mountainous, makes a valid island", () => {
  for (const size of Object.keys(SIZES)) {
    for (const hilliness of [0, 1]) {
      const { terrain, field } = generateWorld({ seed: 2, size, hilliness });
      assert.equal(field.size, SIZES[size].tiles * 4, size);
      assert.ok(terrain.heights.every(Number.isFinite), `${size}/${hilliness}: finite heights`);
      assert.ok(landShare(terrain.heights) > 0.15, `${size}/${hilliness}: enough land`);
    }
  }
});

test("hilliness raises the terrain", () => {
  const height = (hilliness) => generateWorld({ seed: 4, hilliness, cliffs: 0 }).field.maxHeight;
  const flat = height(0), hills = height(0.5), mountains = height(1);
  assert.ok(flat < 3 && flat < hills && hills < mountains && mountains > 12, `${flat} ${hills} ${mountains}`);
});

test("the same options give the same world, a different seed a different one", () => {
  const again = generateWorld({ seed: 5 });
  assert.deepEqual(again.terrain.heights, world.terrain.heights);
  assert.deepEqual(again.props, world.props);
  assert.notDeepEqual(generateWorld({ seed: 6 }).terrain.heights, world.terrain.heights);
});

test("everything grows on land, inside the map", () => {
  const { field, props } = world;
  for (const [kind, floor] of Object.entries(MIN_GROUND)) {
    assert.ok(props[kind].length > 0, `some ${kind}`);
    for (const [x, z] of props[kind]) {
      // Positions are rounded to 0.01, which can shift the ground height a hair.
      assert.ok(field.heightAt(x, z) >= floor - 0.05, `${kind} at (${x}, ${z})`);
      assert.ok(x >= 0 && z >= 0 && x <= field.size && z <= field.size, `${kind} at (${x}, ${z})`);
    }
  }
});

test("solid props do not overlap", () => {
  const solids = ["trees", "rocks"].flatMap((kind) => world.props[kind].map((item) => [item[0], item[1], solidRadius(kind, item)]));
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const [x1, z1, r1] = solids[i], [x2, z2, r2] = solids[j];
      assert.ok(Math.hypot(x1 - x2, z1 - z2) >= r1 + r2 - 0.02);
    }
  }
});

test("each climate grows its own plants", () => {
  const kinds = (climate) => new Set(generateWorld({ seed: 8, climate, vegetation: 0.8 }).props.trees.map((t) => t[4]));
  assert.ok(kinds("desert").has("cactus"));
  assert.ok(!kinds("desert").has("oak"));
  assert.ok(kinds("tropical").has("palm"));
  assert.ok(kinds("tundra").has("snowPine"));
  assert.ok(kinds("mild").has("oak"));
  for (const climate of CLIMATE_IDS) {
    const { props } = generateWorld({ seed: 8, climate });
    assert.ok(props.trees.every((t) => TREE_KINDS.includes(t[4])), climate);
    assert.ok(props.bushes.every((b) => BUSH_KINDS.includes(b[4])), climate);
    assert.ok(CLIMATES[climate].ground.grass.length === 3, climate);
  }
});

test("more vegetation means more plants", () => {
  const count = (vegetation) => generateWorld({ seed: 9, vegetation }).props;
  const sparse = count(0.1), lush = count(0.9);
  for (const kind of ["trees", "bushes", "grass"]) assert.ok(lush[kind].length > sparse[kind].length * 2, kind);
});

test("options are normalized: defaults fill gaps, bad values are replaced", () => {
  assert.deepEqual(normalizeOptions(), DEFAULT_OPTIONS);
  assert.deepEqual(
    normalizeOptions({ seed: "42", size: "galactic", hilliness: 3, vegetation: -1, climate: "lava" }),
    { ...DEFAULT_OPTIONS, seed: 42, hilliness: 1, vegetation: 0 },
  );
  assert.equal(normalizeOptions({ seed: "abc" }).seed, DEFAULT_OPTIONS.seed);
});

test("options survive a round trip through the URL", () => {
  const options = normalizeOptions({
    seed: 77, size: "large", hilliness: 0.65, vegetation: 0.2, peaks: 0.5, bays: 0.8, cliffs: 0.1, islets: 0, climate: "tundra", settlement: "city",
    architecture: "nordic", density: 0.8, height: 0.1, variety: 0.9, features: ["mill", "walls"],
  });
  assert.deepEqual(optionsFromQuery(new URLSearchParams(optionsToQuery(options))), options);
  assert.deepEqual(optionsFromQuery(new URLSearchParams(optionsToQuery({ ...options, features: [] }))).features, []);
  assert.deepEqual(optionsFromQuery(new URLSearchParams("")), DEFAULT_OPTIONS);
});

test("a world survives a round trip through JSON", () => {
  const json = JSON.parse(JSON.stringify(worldToJSON(world)));
  assert.equal(json.format, "citymaker-world");
  const loaded = worldFromJSON(json);
  assert.deepEqual(loaded.options, world.options);
  assert.deepEqual(loaded.settlement, world.settlement);
  assert.deepEqual(loaded.props, world.props);
  assert.equal(loaded.field.size, world.field.size);
  for (const [x, z] of [[10, 10], [64, 64], [80.5, 33.3]]) {
    assert.ok(Math.abs(loaded.field.heightAt(x, z) - world.field.heightAt(x, z)) < 1e-3);
  }
});

test("importing rejects files that are not worlds", () => {
  assert.throws(() => worldFromJSON({ hello: "world" }), /not a CityMaker world/);
  const json = worldToJSON(world);
  assert.throws(() => worldFromJSON({ ...json, version: 99 }), /newer/);
  assert.throws(() => worldFromJSON({ ...json, terrain: { ...json.terrain, heights: [1, 2, 3] } }), /heights/);
  assert.throws(() => worldFromJSON({ ...json, terrain: { ...json.terrain, tiles: 0 } }), /terrain size/);
});

const roadLength = (settlement, type) => settlement.roads
  .filter((road) => !type || road.type === type)
  .reduce((sum, { points }) => sum + points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0), 0);

// Distance from (x, z) to a polyline.
function distanceToRoad(x, z, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0), 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

test("a village has a square and roads, all on dry land", () => {
  const { settlement, field } = world; // the default options make a village
  assert.equal(settlement.level, "village");
  assert.equal(settlement.squares.length, 1);
  assert.ok(roadLength(settlement) > 100, `${roadLength(settlement)} m of roads`);
  for (const road of settlement.roads) {
    assert.ok(ROAD_TYPES.includes(road.type));
    for (const [x, z, y] of road.points) {
      assert.ok(field.heightAt(x, z) > SEA_LEVEL + 0.4, `${road.type} at (${x}, ${z}) is in the water`);
      assert.ok(Math.abs(y - field.heightAt(x, z)) < 0.01, "stored heights match the ground");
    }
  }
});

test("the ground under the square is level", () => {
  const { field, settlement } = generateWorld({ seed: 11, hilliness: 0.7, settlement: "town" });
  const [square] = settlement.squares;
  const [cx, cz] = square.centre, [w, d] = square.size;
  const u = [Math.cos(square.angle), Math.sin(square.angle)], v = [-Math.sin(square.angle), Math.cos(square.angle)];
  for (let a = -0.4; a <= 0.4; a += 0.2) {
    for (let c = -0.4; c <= 0.4; c += 0.2) {
      const x = cx + u[0] * a * w + v[0] * c * d, z = cz + u[1] * a * w + v[1] * c * d;
      assert.ok(Math.abs(field.heightAt(x, z) - square.height) < 0.05, `(${x}, ${z})`);
    }
  }
});

test("trees and rocks keep off roads and squares", () => {
  const { props, settlement } = generateWorld({ seed: 6, settlement: "town", vegetation: 1, climate: "forest" });
  for (const kind of ["trees", "rocks"]) {
    for (const [x, z] of props[kind]) {
      for (const road of settlement.roads) {
        assert.ok(distanceToRoad(x, z, road.points) > road.width / 2 + 0.8, `${kind} at (${x}, ${z}) on a ${road.type}`);
      }
    }
  }
});

test("bigger settlements have more streets; none has no roads", () => {
  const plan = (settlement) => generateWorld({ seed: 2, size: "large", settlement }).settlement;
  assert.deepEqual(plan("none").roads, []);
  assert.equal(plan("hamlet").squares.length, 0);
  assert.equal(roadLength(plan("hamlet"), "street"), 0);
  const town = roadLength(plan("town"), "street"), city = roadLength(plan("city"), "street");
  assert.ok(town > 200 && city > town, `town ${town} m, city ${city} m of streets`);
});

test("settlements are deterministic", () => {
  assert.deepEqual(generateWorld({ seed: 5 }).settlement, world.settlement);
});

test("files from before settlements still load, without one", () => {
  const json = JSON.parse(JSON.stringify(worldToJSON(world)));
  delete json.settlement;
  json.version = 1;
  const loaded = worldFromJSON(json);
  assert.equal(loaded.settlement.level, "none");
  assert.deepEqual(loaded.settlement.roads, []);
});

test("the coast options shape the island", () => {
  const land = (options) => generateWorld({ seed: 12, settlement: "none", ...options }).terrain.heights.filter((h) => h > SEA_LEVEL).length;
  assert.ok(land({ bays: 1, islets: 0 }) < land({ bays: 0, islets: 0 }) * 0.95, "bays take land away");
  // Cliffs: steep drops right at the waterline.
  const steepCoast = (cliffs) => {
    const { field } = generateWorld({ seed: 12, settlement: "none", cliffs, bays: 0, islets: 0 });
    let steep = 0, coast = 0;
    for (let x = 1; x < field.size; x += 1) {
      for (let z = 1; z < field.size; z += 1) {
        if (Math.abs(field.heightAt(x, z) - 0.3) > 0.3) continue;
        coast++;
        if (field.slopeAt(x, z) > 1) steep++;
      }
    }
    return steep / coast;
  };
  assert.ok(steepCoast(1) > steepCoast(0) + 0.15, `${steepCoast(1)} vs ${steepCoast(0)}`);
  // Islets: land out beyond the main island's coast.
  const offshore = (islets) => {
    const { field } = generateWorld({ seed: 12, settlement: "none", islets, bays: 0 });
    let count = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      for (let r = field.size * 0.4; r < field.size * 0.5; r += 0.5) {
        if (field.heightAt(field.size / 2 + Math.cos(a) * r, field.size / 2 + Math.sin(a) * r) > SEA_LEVEL) count++;
      }
    }
    return count;
  };
  assert.ok(offshore(1) > offshore(0), "islets rise offshore");
  const peak = (peaks) => generateWorld({ seed: 12, settlement: "none", peaks, hilliness: 0.3 }).field.maxHeight;
  assert.ok(peak(1) > peak(0) + 8, "peaks add mountains");
});

test("the height field interpolates between grid points", () => {
  const field = createHeightField({ tiles: 1, tileSize: 2, segments: 1, heights: [0, 2, 4, 6] });
  assert.equal(field.heightAt(0, 0), 0);
  assert.equal(field.heightAt(1, 0), 1);
  assert.equal(field.heightAt(1, 1), 3);
  assert.equal(field.heightAt(5, 5), 6, "clamped to the map");
  assert.throws(() => createHeightField({ tiles: 2, tileSize: 2, segments: 1, heights: [0] }));
});

test("the world exports as a GLB with one node per layer", async () => {
  const { buildGlb } = await import("../../static/js/glb.js");
  const { worldLayers } = await import("../../static/js/layers.js");
  // A stand-in PNG: the painted paving needs a browser canvas.
  const pavingImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const glb = new DataView(buildGlb(worldLayers(generateWorld({ seed: 2, size: "small", settlement: "town" }), { pavingImage })));
  assert.equal(glb.getUint32(0, true), 0x46546c67, "glTF magic");
  assert.equal(glb.getUint32(4, true), 2, "version 2");
  assert.equal(glb.getUint32(8, true), glb.byteLength);
  const jsonLength = glb.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb.buffer, 20, jsonLength)));
  assert.deepEqual(json.nodes.map((n) => n.name), ["island", "water", "roads", "buildings", "plants"]);
  const binLength = glb.getUint32(20 + jsonLength, true);
  assert.equal(binLength, json.buffers[0].byteLength);
  for (const view of json.bufferViews) assert.ok(view.byteOffset + view.byteLength <= binLength);
  assert.equal(json.images.length, 1);
  assert.equal(json.materials[json.meshes[2].primitives[0].material].pbrMetallicRoughness.baseColorTexture.index, 0);
  assert.ok(json.meshes[2].primitives[0].attributes.TEXCOORD_0 !== undefined, "roads have texture coordinates");
  for (const mesh of json.meshes) {
    const { POSITION, NORMAL, COLOR_0 } = mesh.primitives[0].attributes;
    assert.equal(json.accessors[POSITION].count, json.accessors[NORMAL].count);
    assert.equal(json.accessors[POSITION].count, json.accessors[COLOR_0].count);
  }
});

test("the site plan marks paving and measures the distance to it", async () => {
  const { USE } = await import("../../static/js/world/siteplan.js");
  const { settlement, sitePlan, field } = world;
  const [square] = settlement.squares;
  // (The middle of the square holds the well; look a little off it.)
  const [sx, sz] = [square.centre[0] + Math.cos(square.angle) * 3, square.centre[1] + Math.sin(square.angle) * 3];
  assert.equal(sitePlan.useAt(sx, sz), USE.square);
  assert.ok(sitePlan.distanceAt(sx, sz) < -2, "deep inside the square");
  const road = settlement.roads.find((r) => r.type === "road");
  const [x, z] = road.points[Math.floor(road.points.length / 2)];
  assert.ok(sitePlan.useAt(x, z) >= USE.path, "the middle of a road is paved");
  assert.equal(sitePlan.useAt(1, 1), USE.water, "the map corner is sea");
  let free = 0;
  for (const u of sitePlan.use) if (u === USE.free) free++;
  assert.ok(free > sitePlan.use.length * 0.1, "most land is still free");
  assert.equal(sitePlan.cellsPerSide, field.verticesPerSide);
});

test("the paving detail tiles seamlessly and keeps its average brightness", async () => {
  const { createPavingDetail, DETAIL_MEAN } = await import("../../static/js/pavingdetail.js");
  const { size, data } = createPavingDetail(128, 3);
  for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let i = 0; i < size * size; i++) sum += data[i * 4 + c];
    assert.ok(Math.abs(sum / (size * size) / 255 - DETAIL_MEAN) < 0.03, `channel ${c} mean`);
  }
});

test("a village gets a church, a windmill and houses, each on level ground off the roads", () => {
  const { settlement, field } = generateWorld({ seed: 7, size: "large", settlement: "village" });
  const count = (type) => settlement.buildings.filter((b) => b.type === type).length;
  assert.equal(count("church"), 1);
  assert.equal(count("mill"), 1);
  assert.ok(count("house") >= 8, `${count("house")} houses`);
  const onSquare = new Set(["well", "fountain", "stall"]); // these stand on the square on purpose
  for (const b of settlement.buildings.filter((x) => !(onSquare.has(x.type) && x.floor === settlement.squares[0].height))) {
    const front = [Math.sin(b.angle), Math.cos(b.angle)], side = [front[1], -front[0]];
    for (const [wx, wz, w, d] of b.wings) {
      for (const [fx, fz] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
        const lx = wx + fx * w, lz = wz + fz * d;
        const x = b.centre[0] + side[0] * lx + front[0] * lz, z = b.centre[1] + side[1] * lx + front[1] * lz;
        assert.ok(Math.abs(field.heightAt(x, z) - b.floor) < 0.1, `${b.type} at (${x.toFixed(1)}, ${z.toFixed(1)}) is level`);
        for (const road of settlement.roads) {
          assert.ok(distanceToRoad(x, z, road.points) > road.width / 2, `${b.type} stands on a ${road.type}`);
        }
      }
    }
  }
});

test("buildings do not overlap", () => {
  const { buildings } = generateWorld({ seed: 4, size: "large", settlement: "town" }).settlement;
  // Bounding circles of the footprints may touch, but no centre lies inside another footprint.
  for (const a of buildings) {
    for (const b of buildings) {
      if (a === b) continue;
      const front = [Math.sin(b.angle), Math.cos(b.angle)], side = [front[1], -front[0]];
      const dx = a.centre[0] - b.centre[0], dz = a.centre[1] - b.centre[1];
      const inside = Math.abs(dx * side[0] + dz * side[1]) < b.size[0] / 2 && Math.abs(dx * front[0] + dz * front[1]) < b.size[1] / 2;
      assert.ok(!inside, `${a.type} at ${a.centre} is inside ${b.type} at ${b.centre}`);
    }
  }
});

test("buildings and fences survive a round trip through JSON", () => {
  const generated = generateWorld({ seed: 7, settlement: "village", climate: "savanna" });
  const loaded = worldFromJSON(JSON.parse(JSON.stringify(worldToJSON(generated))));
  assert.deepEqual(loaded.settlement.buildings, generated.settlement.buildings);
  assert.deepEqual(loaded.settlement.fences, generated.settlement.fences);
  assert.ok(generated.settlement.buildings.length > 0);
});

test("a walled town gets its hall, market, fountain, gates and towers, with houses inside the wall", async () => {
  const { insidePolygon } = await import("../../static/js/world/planner.js");
  const { settlement } = generateWorld({ seed: 9, size: "large", settlement: "town" });
  const types = new Set(settlement.buildings.map((b) => b.type));
  for (const type of ["church", "hall", "fountain", "stall", "house"]) assert.ok(types.has(type), type);
  const wall = settlement.fortifications;
  assert.equal(wall.kind, "stone");
  assert.ok(wall.gates.length >= 1 && wall.towers.length >= 4, `${wall.gates.length} gates, ${wall.towers.length} towers`);
  for (const house of settlement.buildings.filter((b) => b.type === "house")) {
    assert.ok(insidePolygon(...house.centre, wall.ring), `house at ${house.centre} is outside the wall`);
  }
});

test("buildings options: features can be switched off, architecture follows the climate or the choice", () => {
  const bare = generateWorld({ seed: 7, size: "large", settlement: "village", features: [] }).settlement;
  assert.deepEqual([...new Set(bare.buildings.map((b) => b.type))].filter((t) => t !== "house" && t !== "shed"), []);
  assert.equal(bare.fortifications, null);
  assert.deepEqual(bare.fields, []);
  assert.equal(generateWorld({ seed: 7, climate: "tundra" }).settlement.architecture, "nordic");
  assert.equal(generateWorld({ seed: 7, climate: "tundra", architecture: "adobe" }).settlement.architecture, "adobe");
  const village = generateWorld({ seed: 7, size: "huge", settlement: "village" }).settlement;
  assert.equal(village.fortifications?.kind, "palisade");
  assert.ok(village.buildings.some((b) => b.type === "barn"), "farms on the outskirts");
});

test("density adds houses", () => {
  const houses = (density) => generateWorld({ seed: 9, size: "large", settlement: "town", density, features: [] })
    .settlement.buildings.filter((b) => b.type === "house").length;
  assert.ok(houses(1) > houses(0) * 1.3, `${houses(0)} vs ${houses(1)}`);
});
