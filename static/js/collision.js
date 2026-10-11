// Circle-vs-circle collision on the xz plane.
// A body is any object with { x, z, radius, mass }; obstacles are { x, z, radius } and never move.

// Pushes overlapping bodies apart; the lighter body takes more of the correction.
// Bodies overlapping an obstacle are pushed fully out of it.
export function resolveCollisions(bodies, obstacles = [], iterations = 3) {
  const grid = obstacles.length > 64 ? gridFor(obstacles) : null;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        separate(bodies[i], bodies[j], bodies[j].mass / (bodies[i].mass + bodies[j].mass));
      }
      if (grid) for (const obstacle of grid.near(bodies[i])) separate(bodies[i], obstacle, 1);
      else for (const obstacle of obstacles) separate(bodies[i], obstacle, 1);
    }
  }
}

// Long obstacle lists (trees, buildings, fence posts) are bucketed on a grid, built once per
// list (obstacles never move; a list that grows is bucketed again).
const GRID_CELL = 4;
const grids = new WeakMap();

function gridFor(obstacles) {
  const cached = grids.get(obstacles);
  if (cached && cached.count === obstacles.length) return cached;
  const buckets = new Map();
  let reach = 0;
  for (const o of obstacles) {
    const key = cellKey(Math.floor(o.x / GRID_CELL), Math.floor(o.z / GRID_CELL));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
    reach = Math.max(reach, o.radius);
  }
  const grid = {
    count: obstacles.length,
    // Obstacles in the cells a body could touch.
    *near(body) {
      const r = body.radius + reach;
      const c0 = Math.floor((body.x - r) / GRID_CELL), c1 = Math.floor((body.x + r) / GRID_CELL);
      const r0 = Math.floor((body.z - r) / GRID_CELL), r1 = Math.floor((body.z + r) / GRID_CELL);
      for (let c = c0; c <= c1; c++) for (let w = r0; w <= r1; w++) yield* buckets.get(cellKey(c, w)) ?? [];
    },
  };
  grids.set(obstacles, grid);
  return grid;
}

function cellKey(col, row) {
  return col * 100003 + row;
}

// Collision circles along a polyline, close enough together that nothing slips between them.
export function lineObstacles(points, radius) {
  const out = [];
  const step = radius * 1.2;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = i === 1 ? 0 : 1; k <= count; k++) {
      out.push({ x: ax + ((bx - ax) * k) / count, z: az + ((bz - az) * k) / count, radius, static: true });
    }
  }
  return out;
}

// Moves `a` by `shareA` of the overlap and `b` by the rest.
function separate(a, b, shareA) {
  const minDist = a.radius + b.radius;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.abs(dx) >= minDist || Math.abs(dz) >= minDist) return;
  const dist = Math.hypot(dx, dz);
  if (dist >= minDist) return;
  const overlap = minDist - dist;
  // Exactly coincident bodies get an arbitrary push direction.
  const [nx, nz] = dist < 1e-6 ? [1, 0] : [dx / dist, dz / dist];
  a.x -= nx * overlap * shareA;
  a.z -= nz * overlap * shareA;
  b.x += nx * overlap * (1 - shareA);
  b.z += nz * overlap * (1 - shareA);
}

export function clampToBounds(body, size) {
  body.x = Math.min(Math.max(body.x, body.radius), size - body.radius);
  body.z = Math.min(Math.max(body.z, body.radius), size - body.radius);
}
