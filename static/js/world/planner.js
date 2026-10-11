// The urban planner: places the settlement's buildings on the site plan.
//
// In order: a town wall (stone round towns and cities, a wooden palisade round villages)
// with towers and gates where the roads pass; the church facing the square; in towns a town
// hall and market stalls round the square; a well or fountain on the square; windmills on
// high ground out of town; houses along both sides of the roads, facing them, denser toward
// the centre, many with a fenced yard (and some a shed) behind; farms on the outskirts,
// each a barn with haystacks and a field; wells by the roads and shrines at the edge of town.
//
// Buildings are plain data:
//   { type, centre: [x, z], size: [width, depth], angle, floor, storeys, variant, wings, roof? }
// type: house | church | hall | mill | well | fountain | stall | barn | shed | haystack | shrine,
// and by the harbour lighthouse | warehouse | boathouse | crane.
// size is the footprint's bounding box. angle turns the front (local +z) toward the road or
// square: front = [sin(angle), cos(angle)]; local +x runs along the front, [cos(angle), -sin(angle)].
// floor: the height of the levelled ground it stands on.
// wings: the footprint as rectangles [x, z, width, depth, storeys?] in local coordinates; one for
// a plain house, two for an L or a T; each wing gets its own roof. roof: "gable" or "flat" (houses).
// Fences: { type: "fence" | "wall", points: [[x, z], ...] } (closed loops repeat their first point).
// Fields: { centre, size, angle, crop }, painted on the ground.
// Fortifications: { kind: "stone" | "palisade", ring: [[x, z], ...] (closed), gates: [{ x, z, angle, width }],
//   towers: [[x, z], ...] } or null.

import { createRandom } from "../random.js";
import { ARCHITECTURES, resolveArchitecture } from "./architecture.js";
import { SEA_LEVEL } from "./heightmap.js";
import { fbm } from "./noise.js";
import { resample } from "./settlement.js";
import { USE } from "./siteplan.js";

// Per settlement level: how many houses, how tall, how close, how many farms.
const LEVELS = {
  hamlet: { houses: 6, storeys: [1, 1], density: 0.6, mills: 0, farms: 3, square: false },
  village: { houses: 24, storeys: [1, 1.2], density: 0.75, mills: 1, farms: 3, square: true },
  town: { houses: 70, storeys: [1, 2], density: 0.9, mills: 1, farms: 4, square: true },
  city: { houses: 170, storeys: [2, 3], density: 1, mills: 2, farms: 5, square: true },
  metropolis: { houses: 340, storeys: [3, 4], density: 1, mills: 2, farms: 6, square: true },
};

export const CROPS = {
  mild: ["wheat", "furrows", "greens"], forest: ["furrows", "greens", "wheat"],
  mediterranean: ["lavender", "wheat", "vines"], tropical: ["greens", "furrows"],
  savanna: ["millet", "furrows"], desert: ["greens", "furrows"], tundra: ["furrows", "greens"],
};

const GAP = 1.5;          // free ground kept around every building
const MAX_STEP = 2.2;     // largest height difference under a footprint (the plot gets terraced)
const MILL_RADIUS = 3;    // the windmill's footprint, from its centre
const WALL_REACH = 2.5;   // ground the town wall takes on either side of its line

export function planBuildings(field, settlement, sitePlan, options) {
  const level = LEVELS[settlement.level];
  const architecture = resolveArchitecture(options.architecture, options.climate);
  const empty = { architecture, buildings: [], fences: [], fields: [], fortifications: null };
  if (!level || !settlement.centre) return empty;
  const style = ARCHITECTURES[architecture];
  const has = (feature) => options.features.includes(feature);
  const random = createRandom(options.seed * 3301 + 29);
  const n = sitePlan.cellsPerSide, cell = sitePlan.cell;
  const taken = new Uint8Array(n * n); // footprints plus GAP, yards, fields, the wall
  const buildings = [], fences = [], fields = [];
  const [cx, cz] = settlement.centre;
  const squareFloor = settlement.squares[0]?.height ?? field.heightAt(cx, cz);
  const town = ["town", "city", "metropolis"].includes(settlement.level); // as opposed to a village
  const grand = settlement.level === "city" || settlement.level === "metropolis";

  // Grid vertices inside a rotated rectangle (grown by `margin`).
  const cellsOf = (centre, [w, d], angle, margin, fn) => {
    const front = [Math.sin(angle), Math.cos(angle)], side = [front[1], -front[0]];
    const reach = Math.hypot(w, d) / 2 + margin;
    const c0 = Math.max(Math.floor((centre[0] - reach) / cell), 0), c1 = Math.min(Math.ceil((centre[0] + reach) / cell), n - 1);
    const r0 = Math.max(Math.floor((centre[1] - reach) / cell), 0), r1 = Math.min(Math.ceil((centre[1] + reach) / cell), n - 1);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const dx = col * cell - centre[0], dz = row * cell - centre[1];
        if (Math.abs(dx * side[0] + dz * side[1]) <= w / 2 + margin && Math.abs(dx * front[0] + dz * front[1]) <= d / 2 + margin) {
          fn(row * n + col, col * cell, row * cell);
        }
      }
    }
  };
  const take = (centre, size, angle, margin) => cellsOf(centre, size, angle, margin, (k) => { taken[k] = 1; });

  // The town wall comes first: it bounds where the town may build.
  const fortifications = has("walls") && settlement.level !== "hamlet"
    ? planWall(field, settlement, settlement.level === "village" ? "palisade" : "stone", options.seed, (x, z) => sitePlan.useAt(x, z) === USE.square && field.heightAt(x, z) < 1.6)
    : null;
  if (fortifications) {
    const { ring, gates, towers } = fortifications;
    for (let i = 1; i < ring.length; i++) {
      for (const [x, z] of resample([ring[i - 1], ring[i]], 0.5)) {
        if (gates.some((g) => Math.hypot(x - g.x, z - g.z) < g.width / 2)) continue;
        take([x, z], [0, 0], 0, WALL_REACH);
      }
    }
    for (const [x, z] of towers) take([x, z], [0, 0], 0, 3.5);
  }
  const insideWall = (x, z) => !fortifications || insidePolygon(x, z, fortifications.ring);

  // Whether a footprint fits: dry, unpaved, fairly level ground, clear of everything else by a
  // little more than its own edge (and inside the wall, unless `outside` is allowed).
  // Returns its floor height, or null.
  const fits = (centre, size, angle, { outside = false, step = MAX_STEP } = {}) => {
    let lo = Infinity, hi = -Infinity, sum = 0, count = 0, ok = outside || insideWall(...centre);
    if (ok) cellsOf(centre, size, angle, 0, (k, x, z) => {
      if (!ok) return;
      const h = field.heights[k];
      if (sitePlan.use[k] !== USE.free || sitePlan.distance[k] < 0.5 || h < SEA_LEVEL + 0.8) ok = false;
      if (!outside && !insideWall(x, z)) ok = false;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      sum += h;
      count++;
    });
    if (ok) cellsOf(centre, size, angle, 0.6, (k) => { if (taken[k]) ok = false; });
    if (!ok || !count || hi - lo > step) return null;
    return round3(sum / count);
  };
  const add = (building, gap = GAP) => {
    buildings.push({ storeys: 1, variant: 0, wings: [[0, 0, ...building.size]], ...building, centre: round2(building.centre), angle: round3(building.angle) });
    take(building.centre, building.size, building.angle, gap);
  };

  // Harbour buildings: on the quay and breakwater as planned; the boathouse where the shore has room.
  for (const s of settlement.harbour?.structures ?? []) {
    if (s.onLand) {
      const floor = fits(s.centre, s.size, s.angle, { outside: true });
      if (floor !== null) add({ type: s.type, centre: s.centre, size: s.size, angle: s.angle, floor });
    } else {
      add({ type: s.type, centre: s.centre, size: s.size, angle: s.angle, floor: s.floor });
    }
  }

  // Frontages: spots along both sides of the roads (not footpaths), nearest the centre first.
  const frontages = [];
  for (const road of settlement.roads) {
    if (road.type === "path") continue;
    for (const [x, z, side] of roadsideSpots(road, 1)) {
      frontages.push({ x, z, side, road, d: Math.hypot(x - cx, z - cz) });
    }
  }
  frontages.sort((a, b) => a.d - b.d);
  const near = frontages.filter((f) => f.d < settlement.radius * 1.15);
  // A rotated footprint standing back from a frontage, its front toward the road.
  const facing = (f, depth, setback) => {
    const out = f.road.width / 2 + setback + depth / 2;
    return { centre: [f.x + f.side[0] * out, f.z + f.side[1] * out], angle: Math.atan2(-f.side[0], -f.side[1]) };
  };

  // The church: facing the square, or else on a street near the centre, with a walled churchyard.
  if (has("church") && level.square) {
    const preferred = settlement.level === "metropolis" ? [12, 20] : settlement.level === "city" ? [10, 18] : settlement.level === "town" ? [8, 16] : [7, 14];
    churchSearch: for (const size of [preferred, [7, 14]]) {
      for (const spot of [...squareSpots(settlement, size), ...streetSpots(near, size, facing)]) {
        const floor = fits(spot.centre, [size[0] + 2, size[1] + 2], spot.angle);
        if (floor === null) continue;
        const yardSize = [size[0] + 5, size[1] + 5];
        const walled = fits(spot.centre, yardSize, spot.angle) !== null;
        add({ type: "church", centre: spot.centre, size, angle: spot.angle, floor });
        if (walled) {
          fences.push({ type: "wall", points: yard(spot.centre, yardSize, spot.angle, true) });
          take(spot.centre, yardSize, spot.angle, 0.8);
        }
        break churchSearch;
      }
    }
  }

  // Market: in towns, a town hall facing the square and stalls round its edge.
  if (has("market") && town) {
    const size = grand ? [14, 10] : [12, 9];
    for (const spot of [...squareSpots(settlement, size), ...streetSpots(near.slice(0, 200), size, facing)]) {
      const floor = fits(spot.centre, [size[0] + 1, size[1] + 1], spot.angle);
      if (floor === null) continue;
      add({ type: "hall", centre: spot.centre, size, angle: spot.angle, floor, storeys: settlement.level === "metropolis" ? 4 : grand ? 3 : 2 });
      break;
    }
  }
  if (has("market") && level.square) {
    for (const stall of marketStalls(settlement.squares[0], settlement.level === "village" ? 3 : 10, random)) {
      buildings.push({ type: "stall", ...stall, floor: squareFloor, storeys: 1, variant: Math.floor(random() * 4), wings: [[0, 0, ...stall.size]] });
    }
  }

  // A well (villages) or a fountain (towns) in the middle of every square.
  if (has("wells") && level.square) {
    settlement.squares.forEach((sq, i) => {
      const fountain = town && (i === 0 || sq.size[0] >= 12);
      const size = fountain ? (i === 0 ? [5, 5] : [3.6, 3.6]) : [2.2, 2.2];
      buildings.push({ type: fountain ? "fountain" : "well", centre: sq.centre, size, angle: round3(sq.angle), floor: sq.height, storeys: 1, variant: 0, wings: [[0, 0, ...size]] });
    });
  }

  // Windmills: on the highest free ground beside the roads out of town.
  if (has("mill")) {
    const millSpots = [];
    for (const road of settlement.roads) {
      for (const [x, z, side] of roadsideSpots(road, 2)) {
        const d = Math.hypot(x - cx, z - cz);
        if (d < settlement.radius * 0.7 || d > settlement.radius * 2.6) continue;
        const out = road.width / 2 + MILL_RADIUS + 2;
        const centre = [x + side[0] * out, z + side[1] * out];
        millSpots.push({ centre, angle: Math.atan2(-side[0], -side[1]), height: field.heightAt(...centre) });
      }
    }
    millSpots.sort((a, b) => b.height - a.height);
    for (const spot of millSpots) {
      if (buildings.filter((b) => b.type === "mill").length >= level.mills) break;
      if (buildings.some((b) => b.type === "mill" && Math.hypot(b.centre[0] - spot.centre[0], b.centre[1] - spot.centre[1]) < 30)) continue;
      const size = [MILL_RADIUS * 2, MILL_RADIUS * 2];
      const floor = fits(spot.centre, size, spot.angle, { outside: true });
      if (floor !== null) add({ type: "mill", centre: spot.centre, size, angle: spot.angle, floor });
    }
  }

  // Houses along the roads, nearest the centre first.
  const maxHouses = Math.round(level.houses * (0.5 + options.density));
  const density = Math.min(level.density * (0.25 + options.density * 1.3), 1);
  const spacing = GAP + (1 - options.density) * 3; // scattered houses keep further apart
  const lift = Math.round(options.height * 2.4 - 0.7); // extra storeys from the height option
  const storeyRange = [Math.max(1, level.storeys[0] + Math.max(lift, 0)), Math.max(1, level.storeys[1] + lift)];
  const houseCount = () => buildings.filter((b) => b.type === "house").length;
  for (const f of near) {
    if (houseCount() >= maxHouses) break;
    if (random() > density * (1 - smooth(settlement.radius * 0.5, settlement.radius * 1.15, f.d))) continue;
    const plan = style.hut ? hutPlan(random) : housePlan(random, settlement.level, options.variety);
    const [width, depth] = plan.size;
    const { centre, angle } = facing(f, depth, random.range(1, 2.5));
    const floor = fits(centre, [width, depth], angle);
    if (floor === null) continue;
    const storeys = Math.max(1, Math.round(random.range(storeyRange[0], storeyRange[1] + 0.49)));
    const roof = !style.hut && random() < style.flatShare ? "flat" : "gable";
    // Flat-roofed houses step down toward the back when variety is high.
    const wings = plan.wings.map((wing, i) => (i > 0 && roof === "flat" && storeys > 1 && random() < options.variety ? [...wing, storeys - 1] : wing));
    // A fenced yard behind some houses (checked before the house claims its surroundings).
    const yardDepth = random.range(4, 7);
    const back = [-Math.sin(angle), -Math.cos(angle)], side = [Math.cos(angle), -Math.sin(angle)];
    const yardCentre = [centre[0] + back[0] * (depth / 2 + yardDepth / 2 + 0.6), centre[1] + back[1] * (depth / 2 + yardDepth / 2 + 0.6)];
    const yardSize = [width + 1.5, yardDepth];
    const fenced = random() < 0.6 && fits(yardCentre, yardSize, angle) !== null;
    add({ type: "house", centre, size: [round2s(width), round2s(depth)], angle, floor, storeys: style.hut ? 1 : storeys, variant: Math.floor(random() * 4), wings, roof }, spacing);
    if (fenced) {
      fences.push({ type: style.fence, points: yard(yardCentre, yardSize, angle, false) });
      take(yardCentre, yardSize, angle, 0.8);
      // A shed in a back corner of some yards.
      if (yardDepth > 4.5 && random() < 0.4) {
        const corner = random() < 0.5 ? -1 : 1;
        const shedCentre = [
          yardCentre[0] + side[0] * corner * (yardSize[0] / 2 - 1.5) + back[0] * (yardDepth / 2 - 1.6),
          yardCentre[1] + side[1] * corner * (yardSize[0] / 2 - 1.5) + back[1] * (yardDepth / 2 - 1.6),
        ];
        buildings.push({ type: "shed", centre: round2(shedCentre), size: [2.2, 2.6], angle: round3(angle), floor: round3(field.heightAt(...shedCentre)), storeys: 1, variant: 0, wings: [[0, 0, 2.2, 2.6]] });
      }
    }
  }

  // Farms on the outskirts: a barn by the road, haystacks beside it, a field behind.
  if (has("farms")) {
    const crops = CROPS[options.climate] ?? CROPS.mild;
    const farms = Math.round(level.farms * (0.6 + options.density * 0.8));
    const outskirts = frontages.filter((f) => f.d > settlement.radius * 0.95 && f.d < settlement.radius * 2.4);
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < farms && outskirts.length; tries++) {
      const f = outskirts[Math.floor(random() * outskirts.length)];
      const size = style.hut ? [7, 7] : [random.range(10, 13), random.range(7, 8.5)];
      const { centre, angle } = facing(f, size[1], random.range(2, 4));
      const floor = fits(centre, size, angle, { outside: true });
      if (floor === null) continue;
      const back = [-Math.sin(angle), -Math.cos(angle)], side = [Math.cos(angle), -Math.sin(angle)];
      const fieldSize = [random.range(14, 24), random.range(10, 18)];
      const fieldCentre = [centre[0] + back[0] * (size[1] / 2 + 3 + fieldSize[1] / 2), centre[1] + back[1] * (size[1] / 2 + 3 + fieldSize[1] / 2)];
      const fieldFits = fits(fieldCentre, fieldSize, angle, { outside: true, step: 3.5 }) !== null;
      add({ type: "barn", centre, size: [round2s(size[0]), round2s(size[1])], angle, floor, variant: Math.floor(random() * 4) });
      if (fieldFits) {
        fields.push({ centre: round2(fieldCentre), size: [round2s(fieldSize[0]), round2s(fieldSize[1])], angle: round3(angle), crop: crops[Math.floor(random() * crops.length)] });
        take(fieldCentre, fieldSize, angle, 1);
      }
      for (let h = 0; h < 3; h++) {
        const s = (size[0] / 2 + 2.5 + h * 2.6) * (h % 2 ? -1 : 1);
        const stack = [centre[0] + side[0] * s + back[0] * random.range(-1, 2), centre[1] + side[1] * s + back[1] * random.range(-1, 2)];
        const hayFloor = fits(stack, [2, 2], angle, { outside: true });
        if (hayFloor !== null) add({ type: "haystack", centre: stack, size: [2, 2], angle: random.range(0, Math.PI), floor: hayFloor, variant: Math.floor(random() * 4) });
      }
      placed++;
    }
  }

  // Wells by the roads (villages and hamlets: one for every eight houses or so).
  if (has("wells") && (settlement.level === "hamlet" || settlement.level === "village")) {
    let wells = Math.max(1, Math.round(houseCount() / 8));
    for (const f of near) {
      if (wells <= 0) break;
      if (random() > 0.08) continue;
      const { centre, angle } = facing(f, 2.2, 0.6);
      if (buildings.some((b) => b.type === "well" && Math.hypot(b.centre[0] - centre[0], b.centre[1] - centre[1]) < 15)) continue;
      const floor = fits(centre, [2.2, 2.2], angle);
      if (floor === null) continue;
      add({ type: "well", centre, size: [2.2, 2.2], angle, floor });
      wells--;
    }
  }

  // Wayside shrines on the roads out of town.
  if (has("church")) {
    let shrines = settlement.level === "hamlet" ? 1 : 2;
    const roadsOut = frontages.filter((f) => f.road.type !== "street" && f.d > settlement.radius * 1.1 && f.d < settlement.radius * 1.8);
    for (let tries = 0; shrines > 0 && tries < 200 && roadsOut.length; tries++) {
      const f = roadsOut[Math.floor(random() * roadsOut.length)];
      const { centre, angle } = facing(f, 1.2, 0.8);
      if (buildings.some((b) => b.type === "shrine" && Math.hypot(b.centre[0] - centre[0], b.centre[1] - centre[1]) < 30)) continue;
      const floor = fits(centre, [1.2, 1.2], angle, { outside: true });
      if (floor === null) continue;
      add({ type: "shrine", centre, size: [1.2, 1.2], angle, floor });
      shrines--;
    }
  }

  return { architecture, buildings, fences, fields, fortifications };
}

// Levels the ground under each building (and a little around it) to its floor height.
// Things standing on squares, quays and the breakwater are left alone (they are level already).
const ON_PAVING = new Set(["stall", "fountain", "lighthouse", "warehouse", "crane"]);
export function gradeBuildings(terrain, field, buildings) {
  const n = field.verticesPerSide, cell = field.cell;
  for (const b of buildings) {
    if (ON_PAVING.has(b.type)) continue;
    const [w, d] = b.size;
    const front = [Math.sin(b.angle), Math.cos(b.angle)], side = [front[1], -front[0]];
    const reach = Math.hypot(w, d) / 2 + 3;
    const c0 = Math.max(Math.floor((b.centre[0] - reach) / cell), 0), c1 = Math.min(Math.ceil((b.centre[0] + reach) / cell), n - 1);
    const r0 = Math.max(Math.floor((b.centre[1] - reach) / cell), 0), r1 = Math.min(Math.ceil((b.centre[1] + reach) / cell), n - 1);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const dx = col * cell - b.centre[0], dz = row * cell - b.centre[1];
        const outside = Math.max(Math.abs(dx * side[0] + dz * side[1]) - w / 2, Math.abs(dx * front[0] + dz * front[1]) - d / 2);
        const k = row * n + col;
        terrain.heights[k] += (b.floor - terrain.heights[k]) * (1 - smooth(0.4, 2.5, outside));
      }
    }
  }
}

// A ring round the town, just outside where its houses go, kept on dry ground (and off the
// quays: `blocked`); gates where roads cross it, towers along it.
function planWall(field, settlement, kind, seed, blocked) {
  const [cx, cz] = settlement.centre;
  const radius = settlement.radius * 1.15 + (kind === "stone" ? 6 : 4);
  const count = Math.max(12, Math.round((Math.PI * 2 * radius) / 10));
  const raw = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const wobble = 0.92 + 0.16 * fbm(Math.cos(a) * 1.5 + 3, Math.sin(a) * 1.5 + 3, seed + 61, 3);
    let best = null;
    for (let r = 8; r <= radius * wobble; r += 1) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (field.heightAt(x, z) < SEA_LEVEL + 1 || blocked(x, z) || x < 3 || z < 3 || x > field.size - 3 || z > field.size - 3) break;
      best = [x, z];
    }
    if (best) raw.push(best);
  }
  if (raw.length < 8) return null;
  // Smooth the ring, then close it.
  const ring = raw.map((p, i) => {
    const a = raw[(i + raw.length - 1) % raw.length], b = raw[(i + 1) % raw.length];
    return round2([(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]);
  });
  ring.push(ring[0]);

  // Gates where roads (not footpaths) cross the ring.
  const gates = [];
  for (const road of settlement.roads) {
    if (road.type === "path") continue;
    for (let i = 1; i < road.points.length; i++) {
      for (let j = 1; j < ring.length; j++) {
        const hit = intersect(road.points[i - 1], road.points[i], ring[j - 1], ring[j]);
        if (!hit || gates.some((g) => Math.hypot(g.x - hit[0], g.z - hit[1]) < 8)) continue;
        const angle = Math.atan2(ring[j][0] - ring[j - 1][0], ring[j][1] - ring[j - 1][1]);
        gates.push({ x: round2s(hit[0]), z: round2s(hit[1]), angle: round3(angle), width: round2s(road.width + 1.8) });
      }
    }
  }
  // Towers every few ring points, not crowding a gate (gates get their own towers).
  const towers = [];
  const every = kind === "stone" ? 3 : 4;
  for (let i = 0; i < ring.length - 1; i += every) {
    const [x, z] = ring[i];
    if (gates.some((g) => Math.hypot(g.x - x, g.z - z) < 9)) continue;
    towers.push([x, z]);
  }
  return { kind, ring, gates, towers };
}

// Where segments p1-p2 and p3-p4 cross, or null.
function intersect([x1, z1], [x2, z2], [x3, z3], [x4, z4]) {
  const d = (x2 - x1) * (z4 - z3) - (z2 - z1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x3 - x1) * (z4 - z3) - (z3 - z1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (z2 - z1) - (z3 - z1) * (x2 - x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [x1 + t * (x2 - x1), z1 + t * (z2 - z1)] : null;
}

export function insidePolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Market stalls along the inside of a square's long edges, facing into it, clear of its middle.
function marketStalls(square, max, random) {
  if (!square) return [];
  const [sx, sz] = square.centre, [w, d] = square.size;
  const u = [Math.cos(square.angle), Math.sin(square.angle)], v = [-Math.sin(square.angle), Math.cos(square.angle)];
  const stalls = [];
  for (const edge of [1, -1]) {
    for (let a = -w / 2 + 2.6; a <= w / 2 - 2.6 && stalls.length < max; a += 3.4) {
      if (Math.abs(a) < 3.5 || random() < 0.25) continue; // keep the middle (well, fountain) clear
      const c = edge * (d / 2 - 2.2);
      const centre = [sx + u[0] * a + v[0] * c, sz + u[1] * a + v[1] * c];
      // Facing into the square: front = -edge * v.
      stalls.push({ centre: round2(centre), size: [2.6, 2], angle: round3(Math.atan2(-edge * v[0], -edge * v[1])) });
    }
  }
  return stalls;
}

// Spots facing the square from just outside each of its sides.
function squareSpots(settlement, [, d]) {
  const spots = [];
  for (const square of settlement.squares) {
    const [sx, sz] = square.centre, [sw, sd] = square.size;
    const u = [Math.cos(square.angle), Math.sin(square.angle)], v = [-Math.sin(square.angle), Math.cos(square.angle)];
    for (const [dir, half] of [[v, sd / 2], [[-v[0], -v[1]], sd / 2], [u, sw / 2], [[-u[0], -u[1]], sw / 2]]) {
      for (const gap of [6, 10, 14, 18]) { // room for the street between
        for (const shift of [0, -4, 4]) {
          const out = half + gap + d / 2;
          const along = [dir[1], -dir[0]];
          spots.push({
            centre: [sx + dir[0] * out + along[0] * shift, sz + dir[1] * out + along[1] * shift],
            angle: Math.atan2(-dir[0], -dir[1]), // front toward the square
          });
        }
      }
    }
  }
  return spots;
}

// Spots on the streets: facing them, or standing sideways along them.
function streetSpots(frontages, size, facing) {
  return frontages.slice(0, 600).flatMap((f) => {
    const front = facing(f, size[1], 3), side = facing(f, size[0], 3);
    return [front, { centre: side.centre, angle: side.angle + Math.PI / 2 }];
  });
}

// A house's footprint: a plain rectangle, an L (a wing going back from one end of the front
// range) or, in towns, a T (a wing going back from the middle). variety (0..1) makes the
// shaped ones likelier. Returns { size, wings }.
function housePlan(random, level, variety) {
  const w = random.range(5.5, 9), d = random.range(4.5, 6.2);
  const pick = random();
  const shaped = 0.15 + variety * 0.7;
  const shape = pick > shaped ? "rect" : pick < shaped * 0.75 || level === "hamlet" || level === "village" ? "L" : "T";
  if (shape === "rect") return { size: [w, d], wings: [[0, 0, round2s(w), round2s(d)]] };
  const ww = random.range(3.5, Math.min(5, w * 0.6)), wd = random.range(3, 5.5); // the back wing
  const total = d + wd;
  const front = [0, round2s(total / 2 - d / 2), round2s(w), round2s(d)];
  const x = shape === "T" ? 0 : (random() < 0.5 ? -1 : 1) * (w / 2 - ww / 2);
  // The back wing reaches 0.5 m into the front range, so the two join without a gap.
  const back = [round2s(x), round2s(-total / 2 + (wd + 0.5) / 2), round2s(ww), round2s(wd + 0.5)];
  return { size: [w, total], wings: [front, back] };
}

function hutPlan(random) {
  const r = random.range(4.5, 6);
  return { size: [r, r], wings: [[0, 0, round2s(r), round2s(r)]] };
}

// Points along a road every `step` metres, on both sides: [x, z, outward unit vector].
function roadsideSpots(road, step) {
  const samples = resample(road.points, step);
  const spots = [];
  samples.forEach(([x, z], i) => {
    const a = samples[Math.max(i - 1, 0)], b = samples[Math.min(i + 1, samples.length - 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const left = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    spots.push([x, z, left], [x, z, [-left[0], -left[1]]]);
  });
  return spots;
}

// The outline of a rotated rectangle as a closed loop; with an opening in the middle of the front.
function yard(centre, [w, d], angle, gate) {
  const front = [Math.sin(angle), Math.cos(angle)], side = [front[1], -front[0]];
  const at = (s, f) => round2([centre[0] + side[0] * s + front[0] * f, centre[1] + side[1] * s + front[1] * f]);
  const opening = gate ? 1.5 : 0;
  return [at(opening, d / 2), at(w / 2, d / 2), at(w / 2, -d / 2), at(-w / 2, -d / 2), at(-w / 2, d / 2), at(-opening, d / 2)];
}

function smooth(lo, hi, v) {
  const t = Math.min(Math.max((v - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
}

const round2 = ([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
const round2s = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;
