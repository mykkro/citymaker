// Turns the planner's buildings, fences and town wall into geometry, assembled from parts.js
// in the settlement's architecture style. Everything static is merged into one mesh;
// windmill sails are a separate mesh that the renderer turns. Also returns collision circles.

import { lineObstacles } from "../collision.js";
import * as mat4 from "../mat4.js";
import { box, cone, cylinder, ellipsoid, flatShade, merge, transform } from "../shapes.js";
import { ARCHITECTURES } from "../world/architecture.js";
import { fortificationGeometry } from "./fortifications.js";
import { boatGeometries, harbourGeometry } from "./harbour.js";
import { chimney, coneRoof, cross, door, flatRoof, frustum, gableRoof, GLASS, place, plinth, pyramid, timberFrame, window } from "./parts.js";

const STOREY = 2.6;      // metres per storey
const BASE = 0.35;       // the ground floor sits this far above the plinth's foot
const SLATE = [0.36, 0.38, 0.44];
const SNOW = [0.93, 0.95, 0.97];
const LEAF = [0.42, 0.28, 0.17];
const WOOD = [0.45, 0.33, 0.22];
const DARK_WOOD = [0.3, 0.22, 0.15];
const WATER = [0.22, 0.42, 0.52];
const HAY = [0.85, 0.72, 0.38];
const DOME_BLUE = [0.18, 0.4, 0.75];
const AWNINGS = [[0.78, 0.2, 0.18], [0.2, 0.38, 0.7], [0.25, 0.55, 0.3], [0.9, 0.7, 0.2]];
const GOODS = [[0.85, 0.25, 0.15], [0.95, 0.65, 0.15], [0.45, 0.65, 0.2], [0.6, 0.35, 0.6], [0.9, 0.85, 0.5]];
const SAIL_CLOTH = [0.93, 0.9, 0.82];
export const SAIL_HUB = [0, 8.6, 2.15]; // the sails' hub, in the mill's own frame
const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0], Z_AXIS = [0, 0, 1];

// climateId: the world's climate (tundra roofs carry snow).
// Returns { geometry, sails (geometry around the hub), mills: [{ x, y, z, yaw, phase }], obstacles,
//   boats: [{ x, z, angle, kind, beached, phase }], boatGeometries: { kind: geometry } }.
export function buildBuildings(settlement, field, climateId, random) {
  const style = { ...ARCHITECTURES[settlement.architecture ?? "cottage"], snow: climateId === "tundra" };
  const parts = [], mills = [], obstacles = [];
  const makers = {
    house: style.hut ? hut : house, church: (b, ...rest) => (b.temple === "mosque" ? mosque(b, ...rest) : church(b, ...rest)),
    hall, mill, well, fountain, stall, barn, shed, haystack, shrine,
    lighthouse, warehouse, boathouse, crane, signpost, waymark, noticeboard,
  };
  for (const b of settlement.buildings ?? []) {
    const make = makers[b.type];
    if (!make) continue;
    const toWorld = mat4.multiply(mat4.translation(b.centre[0], b.floor, b.centre[1]), mat4.rotationAxis(Y_AXIS, b.angle));
    const shade = 0.93 + random() * 0.14;
    parts.push(transform(make(b, style, random), toWorld, [shade, shade, shade]));
    obstacles.push(...footprintCircles(b));
    if (b.type === "mill") {
      const [x, y, z] = mat4.transformPoint(toWorld, SAIL_HUB);
      mills.push({ x, y, z, yaw: b.angle, phase: random() * Math.PI });
    }
  }
  for (const fence of settlement.fences ?? []) {
    parts.push(fenceGeometry(fence, field, style, random));
    obstacles.push(...lineObstacles(fence.points, fence.type === "wall" ? 0.35 : 0.2));
  }
  if (settlement.fortifications) {
    const wall = fortificationGeometry(settlement.fortifications, settlement.centre, field, style, random);
    parts.push(wall.geometry);
    obstacles.push(...wall.obstacles);
  }
  const harbour = settlement.harbour;
  if (harbour) parts.push(harbourGeometry(harbour, field, random));
  const boats = (harbour?.boats ?? []).map((b) => ({ ...b, phase: random() * Math.PI * 2 }));
  return { geometry: merge(...parts), sails: sails(), mills, obstacles, boats, boatGeometries: boatGeometries() };
}

// Roof material and colour for gable roofs in this style (snow on tundra roofs).
function roofOf(style, random) {
  if (style.snow) return { material: "snow", color: SNOW };
  const tint = 0.9 + random() * 0.2;
  return { material: style.roof === "thatch" ? "thatch" : "tile", color: style.roofColor.map((c) => Math.min(c * tint, 1)) };
}

// ---------- Houses ----------

// A house of one or more wings: plinth, walls, roof, the style's wall treatment (timber
// framing, log courses, corner boards) and windows and doors along every outside wall.
// Local frame: front toward +z, floor at y = 0.
function house(b, style, random) {
  const walls = style.walls[b.variant % style.walls.length];
  const trim = style.trim;
  const timbered = style.timber && style.timbered > 0 && (b.variant % 4) / 4 < style.timbered;
  const shutters = style.shutters[b.variant % style.shutters.length];
  const flat = b.roof === "flat" || style.roof === "flat";
  const roof = roofOf(style, random);
  const parts = [];

  b.wings.forEach(([wx, wz, w, d, wingStoreys = b.storeys], wingIndex) => {
    const eave = BASE + wingStoreys * STOREY;
    parts.push(place(plinth(w, d, style.stone), wx, 0, wz));
    parts.push(box([wx, eave / 2, wz], [w, eave, d], walls));
    if (flat) {
      parts.push(place(flatRoof({ width: w, depth: d, color: walls.map((c) => c * 0.97), beams: style.roof === "flat" ? style.timber : null }), wx, eave, wz));
      if (style.merlons) parts.push(place(merlons(w, d, walls.map((c) => c * 0.97)), wx, eave + 0.6, wz));
    } else {
      const along = w >= d; // the ridge runs along the wing's longer side
      parts.push(place(gableRoof({
        length: along ? w : d, span: along ? d : w, pitch: style.pitch, material: roof.material, color: roof.color, gableColor: walls,
      }), wx, eave, wz, along ? 0 : Math.PI / 2));
    }
    if (style.cornerBoards) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box([wx + sx * (w / 2 - 0.05), eave / 2 + 0.1, wz + sz * (d / 2 - 0.05)], [0.22, eave - 0.2, 0.22], trim));
    }
    // Windows and doors on the outside walls (not where another wing covers the wall).
    for (const face of faces(wx, wz, w, d)) {
      const covered = b.wings.some(([ox, oz, ow, od], i) => i !== wingIndex &&
        Math.abs(face.x + face.normal[0] * 0.3 - ox) < ow / 2 && Math.abs(face.z + face.normal[1] * 0.3 - oz) < od / 2);
      if (covered) continue;
      if (timbered) parts.push(place(timberFrame(face.length, eave - BASE, wingStoreys, style.timber), face.x, BASE, face.z, face.yaw));
      if (style.logs) parts.push(place(logCourses(face.length, eave, walls), face.x, 0, face.z, face.yaw));
      const slots = Math.max(1, Math.floor((face.length - 0.6) / 2.2));
      const proud = style.logs ? 0.14 : 0; // openings sit out past log courses
      const isFront = wingIndex === 0 && face.side === "front";
      const doorSlot = isFront ? Math.floor(slots / 2) : -1;
      for (let s = 0; s < slots; s++) {
        const offset = -face.length / 2 + ((s + 0.5) * face.length) / slots;
        const [px, pz] = [face.x + face.tangent[0] * offset + face.normal[0] * proud, face.z + face.tangent[1] * offset + face.normal[1] * proud];
        for (let storey = 0; storey < wingStoreys; storey++) {
          if (storey === 0 && s === doorSlot) {
            parts.push(place(door({ width: 1, height: 2, frame: trim, leaf: style.door ?? LEAF, arched: style.arches }), px, BASE - 0.3, pz, face.yaw));
          } else if (style.arches) {
            // Small arched windows; some behind a wooden lattice.
            const y = BASE + storey * STOREY + 1.3;
            parts.push(place(window({ width: 0.7, height: 0.9, frame: trim, sill: style.stone, style: "arched" }), px, y, pz, face.yaw));
            if (shutters) parts.push(place(box([0, -0.05, 0.12], [0.9, 0.95, 0.12], shutters), px, y, pz, face.yaw));
          } else {
            parts.push(place(window({ width: 0.8, height: 0.95, frame: trim, sill: style.stone, shutters }), px, BASE + storey * STOREY + 1.45, pz, face.yaw));
          }
        }
      }
    }
  });

  // A chimney through the main wing's roof (or a stub on a flat one).
  const [wx, wz, w, d, mainStoreys = b.storeys] = b.wings[0];
  const eave = BASE + mainStoreys * STOREY;
  if (!flat) {
    const along = w >= d;
    const span = along ? d : w;
    const rise = (span / 2) * Math.tan(style.pitch);
    const off = (along ? w : d) * 0.3 * (b.variant % 2 ? 1 : -1);
    const [cx, cz] = along ? [wx + off, wz - span * 0.12] : [wx - span * 0.12, wz + off];
    parts.push(place(chimney({ height: rise * 0.75 + 1.1, color: style.stone }), cx, eave + rise * 0.3, cz));
  } else if (b.variant % 2) {
    parts.push(place(chimney({ height: 1, color: walls.map((c) => c * 0.95) }), wx + w * 0.3, eave + 0.2, wz - d * 0.25));
  }
  return merge(...parts);
}

// Horizontal logs across a wall facing +z, `length` wide, sticking out past the corners.
// Stepped crenellations round the edge of a flat roof, `w` x `d`, standing on y = 0.
function merlons(w, d, color) {
  const parts = [];
  const edges = [[w, true, d / 2 - 0.1], [w, true, -d / 2 + 0.1], [d, false, w / 2 - 0.1], [d, false, -w / 2 + 0.1]];
  for (const [length, alongX, fixed] of edges) {
    for (let t = -length / 2 + 0.3; t <= length / 2 - 0.2; t += 0.8) {
      parts.push(alongX ? box([t, 0.18, fixed], [0.4, 0.36, 0.22], color) : box([fixed, 0.18, t], [0.22, 0.36, 0.4], color));
    }
  }
  return merge(...parts);
}

function logCourses(length, height, color) {
  const dark = color.map((c) => c * 0.82);
  const parts = [];
  for (let y = 0.45; y < height - 0.1; y += 0.32) {
    parts.push(transform(cylinder([0, (length + 0.5) / 2, 0], 0.11, length + 0.5, dark, 5), mat4.multiply(mat4.translation(0, y, 0.02), mat4.rotationAxis(Z_AXIS, Math.PI / 2))));
  }
  return merge(...parts);
}

// A round hut: a mud wall under a tall cone of thatch, with a door.
function hut(b, style, random) {
  const r = b.size[0] / 2;
  const walls = style.walls[b.variant % style.walls.length];
  const roof = roofOf(style, random);
  return merge(
    cylinder([0, 0.2, 0], r + 0.08, 0.8, style.walls[(b.variant + 1) % style.walls.length].map((c) => c * 0.8), 12),
    cylinder([0, 2.2, 0], r, 2.2, walls, 12),
    place(coneRoof({ radius: r + 0.6, height: r * 1.25, color: roof.color, sides: 12 }), 0, 2.05, 0),
    place(door({ width: 0.9, height: 1.7, frame: style.trim, leaf: LEAF }), 0, -0.05, r - 0.05),
  );
}

// The four walls of a wing [x, z, w, d]: their middle, outward normal, along-wall direction,
// length and the yaw that turns a wall part (built facing +z) to face outward.
function faces(x, z, w, d) {
  return [
    { side: "front", x, z: z + d / 2, normal: [0, 1], tangent: [1, 0], length: w, yaw: 0 },
    { side: "back", x, z: z - d / 2, normal: [0, -1], tangent: [-1, 0], length: w, yaw: Math.PI },
    { side: "right", x: x + w / 2, z, normal: [1, 0], tangent: [0, -1], length: d, yaw: Math.PI / 2 },
    { side: "left", x: x - w / 2, z, normal: [-1, 0], tangent: [0, 1], length: d, yaw: -Math.PI / 2 },
  ];
}

// ---------- Church ----------

// Nave, a tower at the front, a round apse at the back, arched windows, a big arched door.
// The tower carries a spire (north), a low pyramid (warm climates) or, with "dome" (Aegean),
// the nave gets a flat roof and a blue dome. Front toward +z.
function church(b, style) {
  const [w, d] = b.size;
  const kind = b.temple ?? style.church;
  const walls = kind === "spire" ? style.stone : style.walls[0];
  const roofColor = style.snow ? SNOW : style.roof === "tile" && kind !== "spire" ? style.roofColor : kind === "spire" ? SLATE : walls.map((c) => c * 0.85);
  const t = w * 0.62;                       // tower width
  const naveLength = d - t + 0.5;
  const naveZ = -d / 2 + naveLength / 2;
  const eave = w * 0.75 + 1.5;
  const towerHeight = kind === "dome" ? eave * 1.6 : eave * 2.1;
  const frame = kind === "dome" ? style.trim : style.stone.map((c) => c * 0.8);
  const parts = [
    place(plinth(w, naveLength, style.stone.map((c) => c * 0.8)), 0, 0, naveZ),
    box([0, eave / 2, naveZ], [w, eave, naveLength], walls),
    // Apse: a half-round end at the back (a cylinder, mostly hidden inside the nave).
    cylinder([0, eave * 0.8, -d / 2 + 0.2], w * 0.38, eave * 0.8 + 0.6, walls, 10),
    place(coneRoof({ radius: w * 0.38 + 0.3, height: w * 0.4, color: kind === "dome" ? DOME_BLUE : roofColor }), 0, eave * 0.8, -d / 2 + 0.2),
    // Tower.
    place(plinth(t, t, style.stone.map((c) => c * 0.8)), 0, 0, d / 2 - t / 2),
    box([0, towerHeight / 2, d / 2 - t / 2], [t, towerHeight, t], walls),
    box([0, towerHeight - 0.15, d / 2 - t / 2], [t + 0.3, 0.3, t + 0.3], frame), // cornice
  ];
  if (kind === "dome") {
    // Flat nave roof, a drum and a blue dome over its middle, a small blue dome on the tower.
    parts.push(place(flatRoof({ width: w, depth: naveLength, color: walls }), 0, eave, naveZ));
    parts.push(cylinder([0, eave + 1.6, naveZ], w * 0.36, 1.6, walls, 12));
    parts.push(flatShade(ellipsoid([0, eave + 1.6, naveZ], [w * 0.38, w * 0.36, w * 0.38], style.dome ?? DOME_BLUE, 6, 12)));
    parts.push(flatShade(ellipsoid([0, towerHeight, d / 2 - t / 2], [t * 0.42, t * 0.45, t * 0.42], style.dome ?? DOME_BLUE, 5, 10)));
    parts.push(place(cross(frame), 0, towerHeight + t * 0.42, d / 2 - t / 2));
    parts.push(place(cross(frame), 0, eave + 1.6 + w * 0.34, naveZ));
  } else {
    parts.push(place(gableRoof({ length: naveLength, span: w, pitch: 0.8, material: style.snow ? "snow" : "tile", color: roofColor, gableColor: walls }), 0, eave, naveZ, Math.PI / 2));
    const spire = kind === "spire" ? t * 2.4 : t * 0.55;
    parts.push(place(pyramid({ size: t + 0.3, height: spire, color: roofColor }), 0, towerHeight, d / 2 - t / 2));
    parts.push(place(cross(kind === "spire" ? [0.75, 0.62, 0.3] : frame), 0, towerHeight + spire - 0.1, d / 2 - t / 2));
  }
  // Belfry openings near the top of the tower, one per side.
  for (const [yaw, nx, nz] of [[0, 0, 1], [Math.PI, 0, -1], [Math.PI / 2, 1, 0], [-Math.PI / 2, -1, 0]]) {
    parts.push(place(window({ width: t * 0.32, height: 1.3, frame, style: "arched" }), nx * t / 2, towerHeight - 1.6, d / 2 - t / 2 + nz * t / 2, yaw));
  }
  parts.push(place(door({ width: 1.6, height: 2.6, frame, leaf: kind === "dome" ? style.trim : LEAF, arched: true }), 0, -0.05, d / 2));
  parts.push(place(window({ width: 0.9, height: 1.4, frame, style: "arched" }), 0, 5, d / 2));
  const bays = Math.max(2, Math.floor(naveLength / 3.2));
  for (let i = 0; i < bays; i++) {
    const z = -d / 2 + 1.6 + ((i + 0.5) * (naveLength - 2)) / bays;
    for (const side of [1, -1]) parts.push(place(window({ width: 0.9, height: 2, frame, style: "arched" }), side * w / 2, eave * 0.45, z, side * Math.PI / 2));
  }
  return merge(...parts);
}

// ---------- Mosque ----------

// A prayer hall under a big dome on a drum, a tall arched portal at the front flanked by two
// small domes, arched windows, and a minaret with a balcony at a back corner. Front toward +z.
function mosque(b, style) {
  const [w, d] = b.size;
  const walls = style.walls[0];
  const domeColor = style.dome ?? DOME_BLUE;
  const frame = style.trim;
  const gold = [0.8, 0.68, 0.3];
  const eave = 4.5 + w * 0.15;
  const r = Math.min(w, d) * 0.4;
  const domeZ = -d * 0.08;
  const parts = [
    place(plinth(w, d, style.stone), 0, 0, 0),
    box([0, eave / 2, 0], [w, eave, d], walls),
    place(flatRoof({ width: w, depth: d, color: walls }), 0, eave, 0),
    // The dome on its drum, over the middle of the hall, with a gilded finial.
    cylinder([0, eave + 1.5, domeZ], r, 1.5, walls, 16),
    flatShade(ellipsoid([0, eave + 1.5, domeZ], [r, r * 1.1, r], domeColor, 7, 16)),
    cylinder([0, eave + 1.5 + r * 1.1 + 0.9, domeZ], 0.05, 1, gold, 6),
    flatShade(ellipsoid([0, eave + 1.5 + r * 1.1 + 0.15, domeZ], [0.15, 0.15, 0.15], gold, 4, 6)),
    // The portal: a tall frame round an arched doorway.
    box([0, (eave + 1.4) / 2, d / 2 + 0.25], [3.6, eave + 1.4, 0.6], walls.map((c) => c * 0.96)),
    box([0, eave + 1.5, d / 2 + 0.25], [3.8, 0.2, 0.7], style.stone),
    place(door({ width: 1.8, height: 2.8, frame, leaf: style.door ?? LEAF, arched: true }), 0, -0.05, d / 2 + 0.55),
    place(window({ width: 1.2, height: 0.8, frame, style: "arched" }), 0, 4.4, d / 2 + 0.55),
  ];
  if (style.merlons) parts.push(place(merlons(w, d, walls), 0, eave + 0.6, 0));
  for (const side of [-1, 1]) {
    parts.push(cylinder([side * (w / 2 - 1.4), eave + 0.6, d / 2 - 1.4], 0.9, 0.6, walls, 10));
    parts.push(flatShade(ellipsoid([side * (w / 2 - 1.4), eave + 0.6, d / 2 - 1.4], [0.9, 0.95, 0.9], domeColor, 5, 10)));
  }
  const bays = Math.max(2, Math.floor(d / 3));
  for (let i = 0; i < bays; i++) {
    const z = -d / 2 + ((i + 0.5) * d) / bays;
    for (const side of [1, -1]) parts.push(place(window({ width: 0.9, height: 1.6, frame, style: "arched" }), side * w / 2, eave * 0.45, z, side * Math.PI / 2));
  }
  // The minaret, at a back corner: shaft, balcony with a railing, upper shaft, pointed cap.
  const mx = -(w / 2 - 1.2), mz = -(d / 2 - 1.2);
  const height = eave * 2.7;
  parts.push(place(frustum({ r0: 1.15, r1: 0.95, y0: -0.3, y1: height, color: walls, sides: 8 }), mx, 0, mz, Math.PI / 8));
  parts.push(cylinder([mx, height + 0.25, mz], 1.4, 0.3, style.stone, 12));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(box([mx + Math.cos(a) * 1.3, height + 0.6, mz + Math.sin(a) * 1.3], [0.08, 0.6, 0.08], frame));
  }
  parts.push(place(frustum({ r0: 0.7, r1: 0.65, y0: height, y1: height + 2.6, color: walls, sides: 8 }), mx, 0, mz, Math.PI / 8));
  parts.push(place(coneRoof({ radius: 0.85, height: 2.2, color: domeColor, sides: 8 }), mx, height + 2.55, mz));
  parts.push(cylinder([mx, height + 5.4, mz], 0.04, 0.8, gold, 6));
  for (const y of [height * 0.35, height * 0.7]) parts.push(place(window({ width: 0.4, height: 0.9, frame, style: "arched" }), mx, y, mz + 1.05));
  return merge(...parts);
}

// ---------- Town hall ----------

// A wide hall over an arcade, with a clock tower on its roof. Front toward +z.
function hall(b, style, random) {
  const [w, d] = b.size;
  const walls = style.walls[0].map((c) => c * 0.97);
  const height = BASE + b.storeys * 3;
  const flat = style.roof === "flat" || style.flatShare > 0.5;
  const roof = roofOf(style, random);
  const parts = [
    place(plinth(w, d, style.stone), 0, 0, 0),
    box([0, height / 2, 0], [w, height, d], walls),
    box([0, 3.2, d / 2 + 0.05], [w + 0.1, 0.25, 0.25], style.stone), // the arcade's top course
  ];
  const bays = Math.max(3, Math.floor(w / 2.6));
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / bays;
    // Arcade: tall dark arches at street level; windows above.
    parts.push(place(window({ width: 1.5, height: 2, frame: style.stone, sill: style.stone, style: "arched" }), x, 1.3, d / 2));
    for (let s = 1; s < b.storeys; s++) parts.push(place(window({ width: 0.9, height: 1.4, frame: style.trim, sill: style.stone }), x, BASE + s * 3 + 1.5, d / 2));
  }
  if (flat) {
    parts.push(place(flatRoof({ width: w, depth: d, color: walls }), 0, height, 0));
  } else {
    parts.push(place(gableRoof({ length: w, span: d, pitch: Math.min(style.pitch, 0.6), material: roof.material, color: roof.color, gableColor: walls }), 0, height, 0));
  }
  // Clock tower on the roof.
  const rise = flat ? 0.5 : (d / 2) * Math.tan(Math.min(style.pitch, 0.6));
  const top = height + rise + 3.2;
  parts.push(box([0, height + (rise + 3.2) / 2, 0], [2.4, rise + 3.2, 2.4], walls));
  parts.push(place(pyramid({ size: 2.7, height: 2.4, color: style.snow ? SNOW : flat ? style.dome ?? DOME_BLUE : style.roof === "thatch" ? SLATE : roof.color }), 0, top, 0));
  for (const [yaw, nx, nz] of [[0, 0, 1], [Math.PI, 0, -1]]) {
    const face = mat4.multiply(mat4.translation(nx * 1.22, top - 1.4, nz * 1.22), mat4.multiply(mat4.rotationAxis(Y_AXIS, yaw), mat4.rotationAxis(X_AXIS, Math.PI / 2)));
    parts.push(transform(cylinder([0, 0.05, 0], 0.75, 0.1, [0.95, 0.94, 0.88], 12), face));
    parts.push(place(box([0, 0.25, 0.07], [0.08, 0.55, 0.03], [0.1, 0.1, 0.1]), nx * 1.22, top - 1.4, nz * 1.22, yaw));
    parts.push(place(transform(box([0, 0.18, 0.07], [0.08, 0.4, 0.03], [0.1, 0.1, 0.1]), mat4.rotationAxis(Z_AXIS, -1.2)), nx * 1.22, top - 1.4, nz * 1.22, yaw));
  }
  parts.push(place(door({ width: 1.4, height: 2.3, frame: style.trim, leaf: LEAF, arched: true }), 0, -0.05, d / 2 - 0.6));
  return merge(...parts);
}

// ---------- Windmill ----------

// A tapering tower with a cap; the sails are drawn separately at SAIL_HUB so they can turn.
function mill(b, style) {
  const walls = style.roof === "flat" ? style.walls[0] : [0.92, 0.9, 0.85];
  const capColor = style.snow ? SNOW : style.roof === "thatch" ? style.roofColor : SLATE;
  return merge(
    place(frustum({ r0: 2.6, r1: 1.8, y0: -0.6, y1: 8, color: walls, sides: 8 }), 0, 0, 0, Math.PI / 8), // a face, not a corner, to the front
    place(coneRoof({ radius: 2.2, height: 2.2, color: capColor, sides: 8 }), 0, 7.95, 0),
    box([0, 8.6, 1.2], [0.5, 0.5, 2], WOOD),             // the axle housing
    place(door({ width: 1, height: 2, frame: WOOD, leaf: LEAF }), 0, -0.05, 2.3),
    place(window({ width: 0.6, height: 0.7, frame: WOOD }), 0, 4.6, 1.98),
    place(window({ width: 0.6, height: 0.7, frame: WOOD }), 0, 4.6, -1.98, Math.PI),
  );
}

// Four sails around the hub (the origin), in the x-y plane, facing +z.
function sails() {
  const length = 6.2;
  const arm = merge(
    box([0, length / 2, 0], [0.18, length, 0.12], WOOD),
    box([0.62, length * 0.58, -0.02], [1.05, length * 0.74, 0.04], SAIL_CLOTH),
    ...[0.3, 0.5, 0.7, 0.9].map((f) => box([0.62, length * f, 0.03], [1.15, 0.06, 0.05], WOOD)),
  );
  return merge(
    ...[0, 1, 2, 3].map((k) => transform(arm, mat4.rotationAxis(Z_AXIS, (k * Math.PI) / 2))),
    transform(cylinder([0, 0.3, 0], 0.32, 0.6, WOOD, 8), mat4.rotationAxis(X_AXIS, Math.PI / 2)),
  );
}

// ---------- Small things ----------

// A well: a round stone wall round dark water, two posts, a little roof and a bucket.
function well(b, style, random) {
  const roof = roofOf(style, random);
  return merge(
    cylinder([0, 0.85, 0], 0.85, 1.1, style.stone, 10),
    cylinder([0, 0.6, 0], 0.68, 0.1, WATER, 10),
    box([0.75, 1.15, 0], [0.12, 2.3, 0.12], WOOD),
    box([-0.75, 1.15, 0], [0.12, 2.3, 0.12], WOOD),
    transform(cylinder([0, 0.8, 0], 0.06, 1.6, WOOD, 6), mat4.multiply(mat4.translation(0, 1.7, 0), mat4.rotationAxis(Z_AXIS, Math.PI / 2))),
    cylinder([0.2, 1.35, 0], 0.15, 0.3, DARK_WOOD, 6),
    place(gableRoof({ length: 1.7, span: 1.4, pitch: 0.7, material: roof.material === "thatch" ? "tile" : roof.material, color: roof.color, gableColor: WOOD }), 0, 2.3, 0),
  );
}

// A fountain: an eight-sided basin of water, a column and a bowl at the top (5 m across,
// scaled to the footprint).
function fountain(b, style) {
  return transform(merge(
    place(frustum({ r0: 2.4, r1: 2.5, y0: -0.3, y1: 0.6, color: style.stone, sides: 8 }), 0, 0, 0, Math.PI / 8),
    cylinder([0, 0.62, 0], 2.45, 0.08, style.stone.map((c) => c * 0.9), 8),
    cylinder([0, 0.45, 0], 2.25, 0.3, WATER, 16),
    cylinder([0, 1.9, 0], 0.32, 1.6, style.stone, 8),
    frustum({ r0: 0.3, r1: 0.95, y0: 1.85, y1: 2.25, color: style.stone, sides: 10 }),
    cylinder([0, 2.24, 0], 0.85, 0.02, WATER, 10),
    flatShade(ellipsoid([0, 2.55, 0], [0.18, 0.35, 0.18], style.stone, 4, 6)),
  ), mat4.scaling(b.size[0] / 5));
}

// A market stall: a counter with goods, four posts and a striped awning sloping to the front.
function stall(b) {
  const colour = AWNINGS[b.variant % AWNINGS.length];
  const parts = [
    box([0, 0.45, 0.45], [2.4, 0.9, 0.7], WOOD),
    ...[[-1.15, 0.8], [1.15, 0.8], [-1.15, -0.9], [1.15, -0.9]].map(([x, z]) => box([x, 1.15, z], [0.09, 2.3, 0.09], DARK_WOOD)),
  ];
  // Awning stripes, tilted down toward the front.
  const tilt = mat4.multiply(mat4.translation(0, 2.3, 0), mat4.rotationAxis(X_AXIS, 0.25));
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + (i + 0.5) * (2.5 / 6);
    parts.push(transform(box([x, 0, 0], [2.5 / 6, 0.05, 2.2], i % 2 ? [0.95, 0.93, 0.88] : colour), tilt));
  }
  // Goods on the counter: little heaps of fruit and boxes.
  for (let i = 0; i < 4; i++) {
    const g = GOODS[(b.variant + i) % GOODS.length];
    parts.push(flatShade(ellipsoid([-0.85 + i * 0.57, 1, 0.45], [0.24, 0.13, 0.22], g, 3, 6)));
  }
  return merge(...parts);
}

// A barn: big double doors, a loft hatch, under the style's roof (round granaries for huts).
function barn(b, style, random) {
  const [w, d] = b.size;
  const walls = style.barn.map((c) => c * (0.92 + (b.variant % 3) * 0.05));
  const roof = roofOf(style, random);
  if (style.hut) {
    // A granary: a round store raised on posts, under a cone of thatch.
    const r = w / 2 - 0.6;
    return merge(
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => box([sx * r * 0.6, 0.5, sz * r * 0.6], [0.2, 1, 0.2], DARK_WOOD)),
      cylinder([0, 3, 0], r, 2, walls, 12),
      place(coneRoof({ radius: r + 0.6, height: r * 1.2, color: roof.color, sides: 12 }), 0, 2.9, 0),
    );
  }
  const eave = 4;
  const trim = style.cornerBoards ? style.trim : style.barn.map((c) => c * 0.7);
  const parts = [
    place(plinth(w, d, style.stone), 0, 0, 0),
    box([0, eave / 2, 0], [w, eave, d], walls),
    box([-0.8, 1.5, d / 2 + 0.04], [1.55, 3, 0.08], DARK_WOOD),
    box([0.8, 1.5, d / 2 + 0.04], [1.55, 3, 0.08], DARK_WOOD),
    place(window({ width: 0.9, height: 0.9, frame: trim }), 0, 3.4, d / 2),
  ];
  // White cross-bracing on the doors (Nordic and cottage barns).
  if (style.cornerBoards || style.roof === "thatch") {
    for (const sx of [-0.8, 0.8]) for (const a of [0.85, -0.85]) parts.push(transform(box([0, 0, 0], [0.1, 3.2, 0.03], trim), mat4.multiply(mat4.translation(sx, 1.5, d / 2 + 0.1), mat4.rotationAxis(Z_AXIS, a * 0.45))));
  }
  if (style.roof === "flat") parts.push(place(flatRoof({ width: w, depth: d, color: walls.map((c) => c * 0.95), beams: style.timber }), 0, eave, 0));
  else parts.push(place(gableRoof({ length: w, span: d, pitch: Math.max(style.pitch, 0.6), material: roof.material, color: roof.color, gableColor: walls }), 0, eave, 0));
  return merge(...parts);
}

// A small wooden shed with a door and a roof sloping to the back.
function shed(b, style, random) {
  const roof = roofOf(style, random);
  const walls = style.logs || style.cornerBoards ? style.walls[b.variant % style.walls.length] : WOOD;
  const lean = mat4.multiply(mat4.translation(0, 2.15, 0), mat4.rotationAxis(X_AXIS, -0.3));
  return merge(
    box([0, 1, 0], [2.2, 2.1, 2.6], walls),
    transform(box([0, 0, 0], [2.6, 0.12, 3.1], roof.material === "snow" ? SNOW : roof.color.map((c) => c * 0.9)), lean),
    place(door({ width: 0.8, height: 1.7, frame: DARK_WOOD, leaf: LEAF }), 0, -0.1, 1.3),
  );
}

// A haystack: a rounded heap of hay on a pole.
function haystack(b) {
  const hay = HAY.map((c) => c * (0.9 + (b.variant % 3) * 0.05));
  return merge(
    flatShade(ellipsoid([0, 1, 0], [1, 1.25, 1], hay, 5, 8)),
    flatShade(transform(cone([0, 0, 0], 0.7, 0.9, hay.map((c) => c * 0.92), 8), mat4.multiply(mat4.translation(0, 1.9, 0), mat4.rotationAxis(X_AXIS, -Math.PI / 2)))),
    box([0, 2.7, 0], [0.06, 0.6, 0.06], DARK_WOOD),
  );
}

// A wayside shrine: a stone pillar with a little roofed niche (a tiny chapel in the Aegean).
function shrine(b, style, random) {
  if (style.church === "dome") {
    return merge(
      box([0, 0.75, 0], [1.1, 1.5, 1.1], style.walls[0]),
      flatShade(ellipsoid([0, 1.5, 0], [0.5, 0.45, 0.5], DOME_BLUE, 4, 8)),
      box([0, 0.8, 0.56], [0.4, 0.6, 0.02], GLASS),
      place(cross(style.trim), 0, 1.9, 0),
    );
  }
  const roof = roofOf(style, random);
  return merge(
    box([0, 0.15, 0], [0.8, 0.3, 0.8], style.stone.map((c) => c * 0.85)),
    box([0, 1, 0], [0.45, 1.8, 0.45], style.stone),
    box([0, 1.45, 0.2], [0.3, 0.4, 0.08], [0.2, 0.18, 0.2]),
    place(gableRoof({ length: 0.7, span: 0.7, pitch: 0.8, material: roof.material === "thatch" ? "tile" : roof.material, color: roof.color, gableColor: style.stone }), 0, 1.9, 0),
    place(cross([0.75, 0.62, 0.3]), 0, 2.25, 0),
  );
}

// ---------- Harbour buildings ----------

// A lighthouse: a white tapering tower with red bands, a railed gallery, a glowing lantern
// and a red cap.
function lighthouse() {
  const white = [0.95, 0.95, 0.92], red = [0.75, 0.15, 0.13];
  const parts = [
    frustum({ r0: 1.6, r1: 1.1, y0: -0.3, y1: 10, color: white, sides: 12 }),
    frustum({ r0: 1.47, r1: 1.4, y0: 3, y1: 4.3, color: red, sides: 12 }),
    frustum({ r0: 1.3, r1: 1.24, y0: 6.6, y1: 7.9, color: red, sides: 12 }),
    cylinder([0, 10.2, 0], 1.55, 0.25, [0.25, 0.25, 0.27], 12),
    cylinder([0, 11.6, 0], 0.85, 1.4, [1, 0.93, 0.62], 10),
    place(coneRoof({ radius: 1.1, height: 1.1, color: red, sides: 12 }), 0, 11.55, 0),
    place(door({ width: 0.9, height: 1.9, frame: [0.3, 0.3, 0.32], leaf: [0.25, 0.32, 0.45] }), 0, -0.05, 1.56),
  ];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(box([Math.cos(a) * 1.5, 10.6, Math.sin(a) * 1.5], [0.06, 0.6, 0.06], [0.2, 0.2, 0.22]));
  }
  parts.push(frustum({ r0: 1.52, r1: 1.52, y0: 10.85, y1: 10.92, color: [0.2, 0.2, 0.22], sides: 12 }));
  return merge(...parts);
}

// A warehouse on the quay: two tall storeys, big doors facing the water, a loading door
// and hoist beam above them.
function warehouse(b, style, random) {
  const [w, d] = b.size;
  const brick = style.roof === "flat" || style.church === "dome" ? style.walls[0].map((c) => c * 0.95) : [0.6, 0.36, 0.28];
  const roof = roofOf(style, random);
  const eave = 5.2;
  const parts = [
    place(plinth(w, d, style.stone), 0, 0, 0),
    box([0, eave / 2, 0], [w, eave, d], brick),
    box([-2, 1.4, d / 2 + 0.04], [2, 2.8, 0.08], DARK_WOOD),
    box([2, 1.4, d / 2 + 0.04], [2, 2.8, 0.08], DARK_WOOD),
    box([0, 3.9, d / 2 + 0.04], [1.4, 1.5, 0.08], DARK_WOOD),
    box([0, eave - 0.3, d / 2 + 0.6], [0.2, 0.2, 1.4], DARK_WOOD), // hoist beam
    box([0, eave - 1.1, d / 2 + 1.25], [0.03, 1.5, 0.03], [0.2, 0.2, 0.2]),
  ];
  for (const x of [-w / 2 + 1, w / 2 - 1]) parts.push(place(window({ width: 0.7, height: 0.8, frame: style.trim }), x, 3.9, d / 2));
  if (style.roof === "flat") parts.push(place(flatRoof({ width: w, depth: d, color: brick }), 0, eave, 0));
  else parts.push(place(gableRoof({ length: w, span: d, pitch: Math.min(style.pitch, 0.6), material: roof.material === "thatch" ? "tile" : roof.material, color: roof.material === "thatch" ? SLATE : roof.color, gableColor: brick }), 0, eave, 0));
  return merge(...parts);
}

// A boathouse on the shore: a wooden shed open toward the water.
function boathouse(b, style, random) {
  const [w, d] = b.size;
  const roof = roofOf(style, random);
  return merge(
    box([0, 1.4, 0], [w, 2.8, d], WOOD),
    box([0, 1.1, d / 2 + 0.02], [w - 1, 2.2, 0.05], [0.08, 0.08, 0.1]),
    place(gableRoof({ length: d, span: w, pitch: Math.max(style.pitch, 0.6), material: roof.material, color: roof.color, gableColor: WOOD }), 0, 2.8, 0, Math.PI / 2),
  );
}

// A harbour crane: a timber mast on a stone base, a jib reaching out over the water, a rope and a crate.
function crane() {
  const tilt = mat4.multiply(mat4.translation(0, 6, 0), mat4.rotationAxis(X_AXIS, 0.55));
  const tip = mat4.transformPoint(tilt, [0, 0, 5]);
  return merge(
    box([0, 0.3, 0], [2, 0.6, 2], [0.62, 0.6, 0.56]),
    box([0, 3.3, 0], [0.4, 6, 0.4], WOOD),
    transform(box([0, 0, 2.5], [0.28, 0.28, 5], WOOD), tilt),
    box([tip[0], tip[1] - 1.6, tip[2]], [0.04, 3.2, 0.04], [0.2, 0.2, 0.2]),
    box([tip[0], tip[1] - 3.5, tip[2]], [0.9, 0.7, 0.9], [0.62, 0.46, 0.3]),
  );
}

// ---------- Signs ----------

const SIGN_BOARD = [0.93, 0.89, 0.76], SIGN_EDGE = [0.3, 0.22, 0.15], MARK = [0.78, 0.2, 0.16];

// An arrow board pointing along +z: a plank with a pointed end (a diamond half buried in it).
function arrowBoard(length, height, color) {
  return merge(
    box([0, 0, 0.1 + length / 2], [0.05, height, length], color),
    transform(box([0, 0, 0], [0.05, height * 0.72, height * 0.72], color), mat4.multiply(mat4.translation(0, 0, 0.1 + length), mat4.rotationAxis(X_AXIS, Math.PI / 4))),
    box([0.03, height / 2 - 0.02, 0.1 + length / 2], [0.02, 0.03, length], SIGN_EDGE),
    box([0.03, -height / 2 + 0.02, 0.1 + length / 2], [0.02, 0.03, length], SIGN_EDGE),
  );
}

// A fingerpost: a post with an arrow (as yet unlettered) for each way out of the junction.
// b.arrows are world headings.
function signpost(b) {
  const parts = [
    box([0, 1.25, 0], [0.13, 2.5, 0.13], WOOD),
    place(pyramid({ size: 0.2, height: 0.18, color: DARK_WOOD }), 0, 2.5, 0),
  ];
  (b.arrows ?? []).forEach((heading, i) => {
    parts.push(place(arrowBoard(0.85, 0.2, SIGN_BOARD), 0, 2.2 - i * 0.28, 0, heading - b.angle));
  });
  return merge(...parts);
}

// A waymark: a short stake with one painted arrow, where a footpath leaves the road.
function waymark(b) {
  return merge(
    box([0, 0.55, 0], [0.09, 1.1, 0.09], WOOD),
    place(arrowBoard(0.35, 0.14, MARK), 0, 0.95, 0, (b.arrows?.[0] ?? 0) - b.angle),
  );
}

// A notice board: two posts, a framed board with papers pinned to it, and a little roof.
function noticeboard(b, style, random) {
  const roof = roofOf(style, random);
  const parts = [
    box([-0.75, 0.95, 0], [0.1, 1.9, 0.1], WOOD),
    box([0.75, 0.95, 0], [0.1, 1.9, 0.1], WOOD),
    box([0, 1.35, 0], [1.6, 1, 0.06], DARK_WOOD),
    box([0, 1.35, 0.02], [1.45, 0.86, 0.04], [0.62, 0.48, 0.34]),
    place(gableRoof({ length: 1.9, span: 0.5, pitch: 0.6, material: roof.material === "thatch" ? "tile" : roof.material, color: roof.color, gableColor: WOOD }), 0, 1.95, 0),
  ];
  const papers = [[0.96, 0.95, 0.9], [0.95, 0.9, 0.7], [0.88, 0.92, 0.95], [0.97, 0.85, 0.85]];
  for (let i = 0; i < 5; i++) {
    const w = 0.22 + random() * 0.15, h = 0.25 + random() * 0.15;
    parts.push(box([-0.55 + i * 0.27, 1.25 + random() * 0.2, 0.05], [w, h, 0.01], papers[i % papers.length]));
  }
  return merge(...parts);
}

// ---------- Fences and walls ----------

// Wooden post-and-rail fences, or dry-stone walls, following the ground in short pieces.
function fenceGeometry(fence, field, style, random) {
  const parts = [];
  const pieces = [];
  for (let i = 1; i < fence.points.length; i++) {
    const [ax, az] = fence.points[i - 1], [bx, bz] = fence.points[i];
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2.2));
    for (let k = 0; k < count; k++) {
      pieces.push([ax + ((bx - ax) * k) / count, az + ((bz - az) * k) / count, ax + ((bx - ax) * (k + 1)) / count, az + ((bz - az) * (k + 1)) / count]);
    }
  }
  for (const [ax, az, bx, bz] of pieces) {
    const length = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    const ya = field.heightAt(ax, az), yb = field.heightAt(bx, bz);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, low = Math.min(ya, yb);
    if (fence.type === "wall") {
      const stone = style.stone.map((c) => c * (0.88 + random() * 0.2));
      parts.push(place(merge(
        box([0, 0.35, 0], [0.5, 1.3, length + 0.3], stone),
        box([0, 1.04, 0], [0.6, 0.12, length + 0.35], stone.map((c) => c * 0.85)),
      ), mx, low - 0.3, mz, yaw));
    } else {
      parts.push(place(box([0, 0.5, 0], [0.12, 1.2, 0.12], WOOD), ax, ya - 0.1, az));
      for (const h of [0.45, 0.85]) parts.push(place(box([0, 0, 0], [0.05, 0.08, length], WOOD), mx, (ya + yb) / 2 + h, mz, yaw));
    }
  }
  if (fence.type !== "wall" && fence.points.length) {
    const [x, z] = fence.points.at(-1);
    parts.push(place(box([0, 0.5, 0], [0.12, 1.2, 0.12], WOOD), x, field.heightAt(x, z) - 0.1, z));
  }
  return merge(...parts);
}

// ---------- Collision ----------

// Circles covering each wing's rectangle (or the round hut / mill), in world coordinates.
// Small things (stalls, haystacks, shrines) are left walkable.
function footprintCircles(b) {
  if (["stall", "haystack", "shrine", "crane", "signpost", "waymark", "noticeboard"].includes(b.type)) return [];
  if (b.type === "lighthouse") return [{ x: b.centre[0], z: b.centre[1], radius: 1.6, static: true }];
  const front = [Math.sin(b.angle), Math.cos(b.angle)], side = [front[1], -front[0]];
  const toWorld = (x, z) => [b.centre[0] + side[0] * x + front[0] * z, b.centre[1] + side[1] * x + front[1] * z];
  if (b.type === "mill") return [{ x: b.centre[0], z: b.centre[1], radius: 2.5, static: true }];
  if (b.type === "well" || b.type === "fountain") return [{ x: b.centre[0], z: b.centre[1], radius: b.size[0] / 2 - 0.1, static: true }];
  const circles = [];
  for (const [wx, wz, w, d] of b.wings ?? [[0, 0, ...b.size]]) {
    const r = Math.min(w, d) / 2;
    const long = Math.max(w, d);
    const count = Math.max(1, Math.ceil(long / r) - 1);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : -long / 2 + r + ((long - 2 * r) * i) / (count - 1);
      const [x, z] = toWorld(w >= d ? wx + t : wx, w >= d ? wz : wz + t);
      circles.push({ x, z, radius: r, static: true });
    }
  }
  return circles;
}
