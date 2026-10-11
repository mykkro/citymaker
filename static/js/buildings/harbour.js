// Harbour geometry: wooden jetties on posts, floating pontoons, bollards along the quays,
// rock armour along the breakwaters, and the boats (built once per kind, drawn bobbing on
// the waves by the renderer).

import * as mat4 from "../mat4.js";
import { box, cylinder, ellipsoid, flatShade, jitter, merge, transform } from "../shapes.js";

const DECK = [0.55, 0.42, 0.3], DECK_LIGHT = [0.66, 0.52, 0.37], POST = [0.32, 0.24, 0.17];
const PONTOON = [0.62, 0.58, 0.52], FLOAT = [0.22, 0.24, 0.27];
const IRON = [0.16, 0.17, 0.19];
const ROCK = [0.52, 0.5, 0.48];
const Y_AXIS = [0, 1, 0];

export const BOAT_KINDS = ["rowboat", "fishing", "sailboat"];

// Static harbour pieces (jetties, pontoons, bollards, rock armour) as one geometry.
export function harbourGeometry(harbour, field, random) {
  const parts = [];
  for (const pier of harbour.piers) parts.push(pier.kind === "pontoon" ? pontoon(pier) : jetty(pier, field));
  for (const q of harbour.quays) {
    const dir = [Math.sin(q.angle), Math.cos(q.angle)], along = [dir[1], -dir[0]];
    for (let u = -q.size[0] / 2 + 1.5; u <= q.size[0] / 2 - 1.5; u += 4) {
      const x = q.centre[0] + along[0] * u + dir[0] * (q.size[1] / 2 - 0.5), z = q.centre[1] + along[1] * u + dir[1] * (q.size[1] / 2 - 0.5);
      parts.push(cylinder([x, q.height + 0.5, z], 0.18, 0.5, IRON, 8), cylinder([x, q.height + 0.58, z], 0.24, 0.08, IRON, 8));
    }
  }
  for (const mole of harbour.moles) {
    // Boulders tumbling into the water along both sides.
    for (let i = 1; i < mole.points.length; i++) {
      const [ax, az] = mole.points[i - 1], [bx, bz] = mole.points[i];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const side = [-(bz - az) / len, (bx - ax) / len];
      for (const s of [1, -1]) {
        if (random() < 0.3) continue;
        const r = 0.6 + random() * 0.6;
        const x = ax + side[0] * s * (mole.width / 2 + 0.3), z = az + side[1] * s * (mole.width / 2 + 0.3);
        const shade = 0.85 + random() * 0.25;
        parts.push(flatShade(jitter(ellipsoid([x, 0.2, z], [r, r * 0.8, r], ROCK.map((c) => c * shade), 3, 6), [x, 0.2, z], 0.25, random)));
      }
    }
  }
  return merge(...parts);
}

// A wooden jetty: planks across a deck on posts that reach down to the seabed.
function jetty(pier, field) {
  const [sx, sz] = pier.start, [ex, ez] = pier.end;
  const length = Math.hypot(ex - sx, ez - sz);
  const yaw = Math.atan2(ex - sx, ez - sz);
  const parts = [box([0, -0.1, length / 2], [pier.width, 0.12, length], POST)];
  for (let t = 0.15; t < length; t += 0.32) parts.push(box([0, 0, t], [pier.width + 0.1, 0.06, 0.26], t % 0.64 < 0.32 ? DECK : DECK_LIGHT));
  const toWorld = mat4.multiply(mat4.translation(sx, pier.height, sz), mat4.rotationAxis(Y_AXIS, yaw));
  const geometry = [transform(merge(...parts), toWorld)];
  // Posts, down to the ground below each one.
  for (let t = 0.6; t <= length; t += 2.5) {
    for (const side of [-1, 1]) {
      const local = [side * (pier.width / 2 - 0.1), 0, t];
      const [x, , z] = mat4.transformPoint(toWorld, local);
      const bottom = Math.min(field.heightAt(x, z), 0) - 0.3;
      geometry.push(cylinder([x, pier.height + 0.35, z], 0.13, pier.height + 0.35 - bottom, POST, 6));
    }
  }
  return merge(...geometry);
}

// A floating pontoon: a pale deck on dark floats, with cleats along its edges.
function pontoon(pier) {
  const [sx, sz] = pier.start, [ex, ez] = pier.end;
  const length = Math.hypot(ex - sx, ez - sz);
  const parts = [box([0, 0, length / 2], [pier.width, 0.18, length], PONTOON)];
  for (let t = 1; t < length; t += 2) parts.push(box([0, -0.28, t], [pier.width * 0.8, 0.4, 1.2], FLOAT));
  for (let t = 1.5; t < length; t += 3) for (const side of [-1, 1]) parts.push(box([side * (pier.width / 2 - 0.1), 0.15, t], [0.1, 0.12, 0.35], IRON));
  return transform(merge(...parts), mat4.multiply(mat4.translation(sx, pier.height, sz), mat4.rotationAxis(Y_AXIS, Math.atan2(ex - sx, ez - sz))));
}

// ---------- Boats ----------

// Geometry per boat kind, in the boat's frame: bow toward +z, the waterline at y = 0.
export function boatGeometries() {
  return { rowboat: rowboat(), fishing: fishingBoat(), sailboat: sailboat() };
}

// A hull lofted through cross-sections: `width` and `length` overall, `depth` below the
// gunwale at `top`; an outer skin of `hull` colour and an inner one of `inside` colour.
function hull({ width, length, depth, top, color, inside }) {
  const stations = 9;
  const positions = [], normals = [], colors = [], indices = [];
  const section = (i) => {
    const t = (i / (stations - 1)) * 2 - 1;            // -1 stern .. 1 bow
    const bow = Math.max(t, 0);
    const half = (width / 2) * Math.pow(1 - t * t * (t > 0 ? 1 : 0.55), 0.6) + 0.01;
    const z = (t * length) / 2;
    const keel = top - depth * Math.pow(1 - bow * bow, 0.4);
    return [[-half, top + bow * 0.15, z], [0, keel, z], [half, top + bow * 0.15, z]];
  };
  const tri = (a, b, c, color, flip) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map((v) => (v / len) * (flip ? -1 : 1));
    const base = positions.length / 3;
    for (const p of [a, b, c]) {
      positions.push(...p);
      normals.push(...n);
      colors.push(...color);
    }
    indices.push(...(flip ? [base, base + 2, base + 1] : [base, base + 1, base + 2]));
  };
  for (let i = 0; i < stations - 1; i++) {
    const [l0, k0, r0] = section(i), [l1, k1, r1] = section(i + 1);
    // Outside (normals pointing away from the boat's centre line), then inside.
    for (const [g0, g1, sign] of [[l0, l1, 1], [r0, r1, -1]]) {
      tri(g0, k0, k1, color, sign < 0);
      tri(g0, k1, g1, color, sign < 0);
      tri(g0, k0, k1, inside, sign > 0);
      tri(g0, k1, g1, inside, sign > 0);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}

function rowboat() {
  const wood = [0.5, 0.36, 0.24];
  return merge(
    hull({ width: 1.3, length: 3.4, depth: 0.55, top: 0.3, color: [0.3, 0.42, 0.55], inside: wood }),
    box([0, 0.1, 0.2], [1.1, 0.06, 0.3], wood),
    box([0, 0.1, -0.9], [0.9, 0.06, 0.3], wood),
    box([0.55, 0.32, 0.2], [0.6, 0.04, 0.06], wood.map((c) => c * 0.8)), // an oar shipped along the side
  );
}

function fishingBoat() {
  const hullColor = [0.75, 0.22, 0.18], deck = [0.55, 0.42, 0.3], white = [0.93, 0.93, 0.9];
  return merge(
    hull({ width: 2.4, length: 6.5, depth: 1, top: 0.55, color: hullColor, inside: deck }),
    box([0, 0.45, -0.2], [2.1, 0.08, 5.2], deck),
    box([0, 1.15, -0.9], [1.4, 1.3, 1.6], white),
    box([0, 1.85, -0.9], [1.6, 0.1, 1.8], [0.3, 0.3, 0.33]),
    box([0, 1.2, -0.08], [1, 0.4, 0.02], [0.2, 0.27, 0.34]),
    cylinder([0, 4.2, 1.2], 0.07, 3.8, [0.4, 0.3, 0.2], 6),
    box([0, 2.6, 1.2], [0.05, 0.05, 1.8], [0.4, 0.3, 0.2]),
  );
}

function sailboat() {
  const white = [0.95, 0.95, 0.93], deck = [0.7, 0.58, 0.42], navy = [0.15, 0.2, 0.35];
  return merge(
    hull({ width: 2.2, length: 7, depth: 0.9, top: 0.45, color: white, inside: deck }),
    box([0, 0.38, 0], [1.9, 0.08, 6], deck),
    box([0, 0.65, -0.6], [1.3, 0.55, 2.2], white),
    box([0, 0.66, 0.53], [1.1, 0.3, 0.02], [0.2, 0.27, 0.34]),
    cylinder([0, 8.6, 0.8], 0.07, 8.2, [0.85, 0.85, 0.85], 6),
    transform(cylinder([0, 1.5, 0], 0.15, 3, navy, 6), mat4.multiply(mat4.translation(0, 1.6, 0.75), mat4.rotationAxis([1, 0, 0], -Math.PI / 2))), // sail furled on the boom
  );
}
