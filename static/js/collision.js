// Circle-vs-circle collision on the xz plane.
// A body is any object with { x, z, radius, mass }; obstacles are { x, z, radius } and never move.

// Pushes overlapping bodies apart; the lighter body takes more of the correction.
// Bodies overlapping an obstacle are pushed fully out of it.
export function resolveCollisions(bodies, obstacles = [], iterations = 3) {
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        separate(bodies[i], bodies[j], bodies[j].mass / (bodies[i].mass + bodies[j].mass));
      }
      for (const obstacle of obstacles) separate(bodies[i], obstacle, 1);
    }
  }
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
