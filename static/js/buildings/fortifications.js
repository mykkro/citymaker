// Town walls: a stone curtain wall with battlements, round towers and gatehouses, or a
// wooden palisade of sharpened logs with watchtowers and timber gates. The wall follows
// the ground in short, level sections, stepping up and down hills.

import * as mat4 from "../mat4.js";
import { box, cone, cylinder, merge, transform } from "../shapes.js";
import { coneRoof, gableRoof, place, pyramid } from "./parts.js";

const SECTION = 2.4;         // longest level stretch of wall
const STONE_HEIGHT = 5.5;
const STONE_THICK = 1.6;
const PALISADE_HEIGHT = 3.4;
const LOG = [0.45, 0.33, 0.22], DARK_LOG = [0.33, 0.24, 0.16];
const SLATE = [0.36, 0.38, 0.44];

// wall: { kind, ring, gates, towers } from the planner. Returns { geometry, obstacles }.
export function fortificationGeometry(wall, centre, field, style, random) {
  const stone = wall.kind === "stone";
  const parts = [], obstacles = [];
  const wallStone = style.stone.map((c) => c * 0.92);
  const roofColor = style.snow ? [0.93, 0.95, 0.97] : style.roof === "thatch" ? SLATE : style.roofColor;
  const flatTops = style.roof === "flat" || style.church === "dome";
  // How much of the wall each gate leaves open (its towers stand in the rest of the gap).
  const openings = wall.gates.map((g) => ({ ...g, half: g.width / 2 + (stone ? 3.4 : 0.6) }));
  const inGate = (x, z) => openings.some((g) => Math.hypot(x - g.x, z - g.z) < g.half);

  for (let i = 1; i < wall.ring.length; i++) {
    const [ax, az] = wall.ring[i - 1], [bx, bz] = wall.ring[i];
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SECTION));
    for (let k = 0; k < count; k++) {
      const x0 = ax + ((bx - ax) * k) / count, z0 = az + ((bz - az) * k) / count;
      const x1 = ax + ((bx - ax) * (k + 1)) / count, z1 = az + ((bz - az) * (k + 1)) / count;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (inGate(mx, mz)) continue;
      const length = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      const y0 = field.heightAt(x0, z0), y1 = field.heightAt(x1, z1);
      const low = Math.min(y0, y1), high = Math.max(y0, y1);
      if (stone) {
        const top = high - low + STONE_HEIGHT + 1;
        const section = [box([0, top / 2, 0], [STONE_THICK, top, length + 0.25], wallStone.map((c) => c * (0.95 + random() * 0.1)))];
        // Battlements on both edges of the wall walk.
        for (let m = -length / 2 + 0.4; m < length / 2; m += 1.2) {
          for (const side of [-1, 1]) section.push(box([side * (STONE_THICK / 2 - 0.15), top + 0.35, m], [0.3, 0.7, 0.6], wallStone));
        }
        parts.push(place(merge(...section), mx, low - 1, mz, yaw));
      } else {
        // Sharpened logs, slightly uneven.
        const logs = Math.max(2, Math.round(length / 0.42));
        for (let l = 0; l < logs; l++) {
          const t = (l + 0.5) / logs;
          const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
          const h = PALISADE_HEIGHT + random() * 0.5;
          const ground = field.heightAt(x, z) - 0.5;
          parts.push(cylinder([x, ground + h, z], 0.2, h, LOG, 6));
          parts.push(transform(cone([0, 0, 0], 0.2, 0.45, DARK_LOG, 6), mat4.multiply(mat4.translation(x, ground + h, z), mat4.rotationAxis([1, 0, 0], -Math.PI / 2))));
        }
        // A rail along the inside, holding the logs together.
        parts.push(place(box([0, 0, 0], [0.12, 0.15, length], DARK_LOG), mx, (y0 + y1) / 2 + 1.6, mz, yaw));
      }
      obstacles.push({ x: mx, z: mz, radius: stone ? 1.1 : 0.45, static: true });
    }
  }

  // Towers along the wall.
  for (const [x, z] of wall.towers) {
    const ground = field.heightAt(x, z);
    if (stone) {
      const height = STONE_HEIGHT + 3;
      parts.push(cylinder([x, ground + height, z], 2.6, height + 1, wallStone, 12));
      for (let m = 0; m < 10; m++) {
        const a = (m / 10) * Math.PI * 2;
        parts.push(place(box([0, 0, 0], [0.6, 0.75, 0.35], wallStone), x + Math.cos(a) * 2.45, ground + height + 0.35, z + Math.sin(a) * 2.45, -a + Math.PI / 2));
      }
      if (!flatTops) parts.push(place(coneRoof({ radius: 3, height: 3.4, color: roofColor, sides: 12 }), x, ground + height + 0.7, z));
      // Arrow slits.
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2 + 0.4;
        parts.push(place(box([0, 0, 0], [0.18, 1, 0.1], [0.12, 0.11, 0.1]), x + Math.cos(a) * 2.6, ground + height * 0.6, z + Math.sin(a) * 2.6, Math.atan2(Math.cos(a), Math.sin(a))));
      }
      obstacles.push({ x, z, radius: 2.6, static: true });
    } else {
      parts.push(watchtower(x, ground, z, style, roofColor));
      obstacles.push({ x, z, radius: 1.4, static: true });
    }
  }

  // Gates: two towers and a passage over the road, or timber posts with a beam and a little roof.
  for (const g of wall.gates) {
    const dir = [Math.sin(g.angle), Math.cos(g.angle)];
    const ground = field.heightAt(g.x, g.z);
    if (stone) {
      const height = STONE_HEIGHT + 3.2;
      for (const side of [-1, 1]) {
        const x = g.x + dir[0] * side * (g.width / 2 + 1.7), z = g.z + dir[1] * side * (g.width / 2 + 1.7);
        const tower = [box([0, (height + 1) / 2, 0], [3.6, height + 1, 3.6], wallStone)];
        for (const [mx, mz] of [[-1.5, -1.5], [-1.5, 0], [-1.5, 1.5], [0, -1.5], [0, 1.5], [1.5, -1.5], [1.5, 0], [1.5, 1.5]]) {
          tower.push(box([mx, height + 1.35, mz], [0.55, 0.7, 0.55], wallStone));
        }
        if (!flatTops) tower.push(place(pyramid({ size: 3.9, height: 3, color: roofColor }), 0, height + 1.05, 0));
        parts.push(place(merge(...tower), x, field.heightAt(x, z) - 1, z, g.angle));
        obstacles.push({ x, z, radius: 1.8, static: true });
      }
      // The passage over the gate.
      parts.push(place(box([0, 0, 0], [3.2, 2.6, g.width + 0.2], wallStone), g.x, ground + 5.6, g.z, g.angle));
      parts.push(place(box([0, 0, 0], [3.3, 0.3, g.width + 0.3], wallStone.map((c) => c * 0.85)), g.x, ground + 4.2, g.z, g.angle));
    } else {
      for (const side of [-1, 1]) {
        const x = g.x + dir[0] * side * (g.width / 2 + 0.2), z = g.z + dir[1] * side * (g.width / 2 + 0.2);
        parts.push(cylinder([x, field.heightAt(x, z) + 4.6, z], 0.26, 5.1, DARK_LOG, 6));
      }
      parts.push(place(box([0, 0, 0], [0.35, 0.35, g.width + 1], DARK_LOG), g.x, ground + 4.2, g.z, g.angle));
      parts.push(place(gableRoof({ length: g.width + 1.4, span: 1.4, pitch: 0.7, material: style.snow ? "snow" : "tile", color: roofColor, gableColor: LOG }), g.x, ground + 4.4, g.z, g.angle + Math.PI / 2));
    }
  }
  return { geometry: merge(...parts), obstacles };
}

// A wooden watchtower: four legs, a railed platform and a little roof.
function watchtower(x, ground, z, style, roofColor) {
  const parts = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(box([sx * 1.1, 2.6, sz * 1.1], [0.22, 5.8, 0.22], DARK_LOG));
  parts.push(box([0, 4.4, 0], [2.8, 0.2, 2.8], LOG));
  for (const [w, d, ox, oz] of [[2.8, 0.1, 0, 1.35], [2.8, 0.1, 0, -1.35], [0.1, 2.8, 1.35, 0], [0.1, 2.8, -1.35, 0]]) {
    parts.push(box([ox, 5, oz], [w, 1, d], LOG));
  }
  parts.push(place(pyramid({ size: 3.2, height: 1.6, color: style.roof === "thatch" ? style.roofColor : roofColor }), 0, 5.6, 0));
  return place(merge(...parts), x, ground - 0.4, z);
}
