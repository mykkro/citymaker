// The site plan: what every spot of the island is used for, as a raster on the
// terrain grid (one cell per heightmap vertex, 0.5 m apart by default). It is the
// urban planner's map: plants keep off paving with it, and buildings and walls
// will use it to find free ground along the streets.
//
// For each cell:
//   use       one of USE: free ground, water, the grandest paving covering it, a building
//             (its footprint and a metre around it), a fenced yard, the town wall or a field
//   distance  metres to the nearest paving edge (negative on paving); Infinity
//             further than `reach` from any paving

import { SEA_LEVEL } from "./heightmap.js";

export const USE = { free: 0, water: 1, path: 2, road: 3, street: 4, square: 5, building: 6, yard: 7, wall: 8, field: 9 };

export function createSitePlan(field, settlement, reach = 16) {
  const n = field.verticesPerSide, cell = field.cell;
  const use = new Uint8Array(n * n);
  const distance = new Float32Array(n * n).fill(Infinity);
  for (let k = 0; k < n * n; k++) if (field.heights[k] < SEA_LEVEL) use[k] = USE.water;

  // Visits grid vertices within `margin` of the box [x0, z0]-[x1, z1].
  const visit = (x0, z0, x1, z1, margin, fn) => {
    const c0 = Math.max(Math.floor((Math.min(x0, x1) - margin) / cell), 0);
    const c1 = Math.min(Math.ceil((Math.max(x0, x1) + margin) / cell), n - 1);
    const r0 = Math.max(Math.floor((Math.min(z0, z1) - margin) / cell), 0);
    const r1 = Math.min(Math.ceil((Math.max(z0, z1) + margin) / cell), n - 1);
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) fn(row * n + col, col * cell, row * cell);
  };
  const mark = (k, d, kind) => {
    if (d < distance[k]) distance[k] = d;
    if (d <= 0 && kind > use[k]) use[k] = kind;
  };

  for (const road of settlement.roads) {
    const kind = USE[road.type], half = road.width / 2;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      visit(ax, az, bx, bz, half + reach, (k, x, z) => {
        const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / len2, 0), 1);
        mark(k, Math.hypot(x - ax - dx * t, z - az - dz * t) - half, kind);
      });
    }
  }
  // Quays and breakwaters are paved like squares.
  for (const q of settlement.harbour?.quays ?? []) {
    const outside = squareDistance({ centre: q.centre, size: q.size, angle: -q.angle });
    visit(q.centre[0], q.centre[1], q.centre[0], q.centre[1], Math.hypot(...q.size) / 2 + reach, (k, x, z) => mark(k, outside(x, z), USE.square));
  }
  for (const mole of settlement.harbour?.moles ?? []) {
    for (let i = 1; i < mole.points.length; i++) {
      const [ax, az] = mole.points[i - 1], [bx, bz] = mole.points[i];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      visit(ax, az, bx, bz, mole.width / 2 + reach, (k, x, z) => {
        const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / len2, 0), 1);
        mark(k, Math.hypot(x - ax - dx * t, z - az - dz * t) - mole.width / 2, USE.square);
      });
    }
  }
  for (const square of settlement.squares) {
    const outside = squareDistance(square);
    const [sx, sz] = square.centre;
    visit(sx, sz, sx, sz, Math.hypot(...square.size) / 2 + reach, (k, x, z) => mark(k, outside(x, z), USE.square));
  }

  // Fenced yards (closed loops), then buildings over everything else.
  for (const fence of settlement.fences ?? []) {
    const xs = fence.points.map((p) => p[0]), zs = fence.points.map((p) => p[1]);
    visit(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), 0, (k, x, z) => {
      if (use[k] === USE.free && insidePolygon(x, z, fence.points)) use[k] = USE.yard;
    });
  }
  for (const f of settlement.fields ?? []) {
    const outside = squareDistance({ centre: f.centre, size: f.size, angle: -f.angle });
    visit(f.centre[0], f.centre[1], f.centre[0], f.centre[1], Math.hypot(...f.size) / 2, (k, x, z) => {
      if (use[k] === USE.free && outside(x, z) <= 0) use[k] = USE.field;
    });
  }
  const wall = settlement.fortifications;
  if (wall) {
    for (let i = 1; i < wall.ring.length; i++) {
      const [ax, az] = wall.ring[i - 1], [bx, bz] = wall.ring[i];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      visit(ax, az, bx, bz, 2, (k, x, z) => {
        const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / len2, 0), 1);
        const px = ax + dx * t, pz = az + dz * t;
        if (Math.hypot(x - px, z - pz) > 1.8 || wall.gates.some((g) => Math.hypot(px - g.x, pz - g.z) < g.width / 2)) return;
        if (use[k] < USE.path || use[k] === USE.free) use[k] = USE.wall;
      });
    }
    for (const [x0, z0] of wall.towers) {
      visit(x0, z0, x0, z0, 3, (k, x, z) => { if (Math.hypot(x - x0, z - z0) <= 2.8) use[k] = USE.wall; });
    }
  }
  for (const b of settlement.buildings ?? []) {
    // A building's width runs along [cos(angle), -sin(angle)], i.e. a square turned by -angle.
    const outside = squareDistance({ centre: b.centre, size: b.size, angle: -b.angle });
    visit(b.centre[0], b.centre[1], b.centre[0], b.centre[1], Math.hypot(...b.size) / 2 + 1, (k, x, z) => {
      if (outside(x, z) <= 1) use[k] = USE.building;
    });
  }

  const index = (x, z) => {
    const col = Math.min(Math.max(Math.round(x / cell), 0), n - 1);
    const row = Math.min(Math.max(Math.round(z / cell), 0), n - 1);
    return row * n + col;
  };
  return {
    cell,
    cellsPerSide: n,
    use,
    distance,
    useAt: (x, z) => use[index(x, z)],
    distanceAt: (x, z) => distance[index(x, z)],
  };
}

function insidePolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Distance from a point to a rotated rectangular square's edge (negative inside).
export function squareDistance({ centre: [sx, sz], size: [w, d], angle }) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return (x, z) => {
    const u = (x - sx) * cos + (z - sz) * sin, v = -(x - sx) * sin + (z - sz) * cos;
    const qu = Math.abs(u) - w / 2, qv = Math.abs(v) - d / 2;
    return Math.hypot(Math.max(qu, 0), Math.max(qv, 0)) + Math.min(Math.max(qu, qv), 0);
  };
}
