// Low-poly primitive geometry for building stylized models.
// Every shape returns { positions, normals, colors, indices } like the other meshes.

// `color` is an [r, g, b] or a function of the unit-sphere direction, for patterns.
export function ellipsoid(center, radii, color, rings = 8, slices = 12) {
  const b = builder();
  const grid = [];
  for (let i = 0; i <= rings; i++) {
    const theta = (i / rings) * Math.PI;
    const row = [];
    for (let j = 0; j <= slices; j++) {
      const phi = (j / slices) * Math.PI * 2;
      const u = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      const pos = u.map((c, k) => center[k] + c * radii[k]);
      row.push(b.vertex(pos, normalize(u.map((c, k) => c / radii[k])), typeof color === "function" ? color(u) : color));
    }
    grid.push(row);
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < slices; j++) b.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
  }
  return b.build();
}

// Cone pointing along +z from the center of its base.
export function cone(baseCenter, radius, length, color, sides = 8) {
  const b = builder();
  const slope = radius / length;
  const tip = [baseCenter[0], baseCenter[1], baseCenter[2] + length];
  const capCenter = b.vertex(baseCenter, [0, 0, -1], color);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const ring = (a) => [baseCenter[0] + Math.cos(a) * radius, baseCenter[1] + Math.sin(a) * radius, baseCenter[2]];
    const side = (a) => normalize([Math.cos(a), Math.sin(a), slope]);
    b.tri(b.vertex(ring(a0), side(a0), color), b.vertex(ring(a1), side(a1), color), b.vertex(tip, side(am), color));
    b.tri(capCenter, b.vertex(ring(a0), [0, 0, -1], color), b.vertex(ring(a1), [0, 0, -1], color));
  }
  return b.build();
}

// Capped cylinder hanging down along -y from the center of its top.
export function cylinder(top, radius, length, color, sides = 6) {
  const b = builder();
  const bottomY = top[1] - length;
  const upCenter = b.vertex(top, [0, 1, 0], color);
  const downCenter = b.vertex([top[0], bottomY, top[2]], [0, -1, 0], color);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const at = (a, y) => [top[0] + Math.cos(a) * radius, y, top[2] + Math.sin(a) * radius];
    const out = (a) => [Math.cos(a), 0, Math.sin(a)];
    b.quad(
      b.vertex(at(a0, top[1]), out(a0), color), b.vertex(at(a1, top[1]), out(a1), color),
      b.vertex(at(a1, bottomY), out(a1), color), b.vertex(at(a0, bottomY), out(a0), color),
    );
    b.tri(upCenter, b.vertex(at(a0, top[1]), [0, 1, 0], color), b.vertex(at(a1, top[1]), [0, 1, 0], color));
    b.tri(downCenter, b.vertex(at(a0, bottomY), [0, -1, 0], color), b.vertex(at(a1, bottomY), [0, -1, 0], color));
  }
  return b.build();
}

export function box(center, size, color) {
  const b = builder();
  const h = size.map((s) => s / 2);
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const normal = [0, 0, 0];
      normal[axis] = sign;
      const corner = (su, sv) => {
        const p = [...center];
        p[axis] += sign * h[axis];
        p[u] += su * h[u];
        p[v] += sv * h[v];
        return b.vertex(p, normal, color);
      };
      b.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
    }
  }
  return b.build();
}

export function merge(...parts) {
  const total = (key) => parts.reduce((n, p) => n + p[key].length, 0);
  const out = {
    positions: new Float32Array(total("positions")),
    normals: new Float32Array(total("normals")),
    colors: new Float32Array(total("colors")),
    indices: new Uint32Array(total("indices")),
  };
  let v = 0, i = 0;
  for (const p of parts) {
    out.positions.set(p.positions, v);
    out.normals.set(p.normals, v);
    out.colors.set(p.colors, v);
    out.indices.set(p.indices.map((index) => index + v / 3), i);
    v += p.positions.length;
    i += p.indices.length;
  }
  return out;
}

// Applies a rigid transform with optional uniform scale (a mat4) and multiplies colors by `tint`.
export function transform(geometry, matrix, tint = [1, 1, 1]) {
  const m = matrix;
  const { positions: p, normals: n, colors: c } = geometry;
  const positions = new Float32Array(p.length);
  const normals = new Float32Array(n.length);
  const colors = new Float32Array(c.length);
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
    positions[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    positions[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    positions[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const [nx, ny, nz] = [n[i], n[i + 1], n[i + 2]];
    normals.set(normalize([
      m[0] * nx + m[4] * ny + m[8] * nz,
      m[1] * nx + m[5] * ny + m[9] * nz,
      m[2] * nx + m[6] * ny + m[10] * nz,
    ]), i);
    colors[i] = c[i] * tint[0];
    colors[i + 1] = c[i + 1] * tint[1];
    colors[i + 2] = c[i + 2] * tint[2];
  }
  return { positions, normals, colors, indices: geometry.indices };
}

// Pushes each vertex away from `center` by a random factor in [1 - amount, 1 + amount].
// Vertices at the same position move together, so seams stay closed.
export function jitter(geometry, center, amount, random) {
  const positions = new Float32Array(geometry.positions);
  const factors = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const key = [0, 1, 2].map((k) => positions[i + k].toFixed(4)).join(",");
    if (!factors.has(key)) factors.set(key, 1 + (random() * 2 - 1) * amount);
    const f = factors.get(key);
    for (let k = 0; k < 3; k++) positions[i + k] = center[k] + (positions[i + k] - center[k]) * f;
  }
  return { ...geometry, positions };
}

// Splits vertices per triangle and uses face normals, for a faceted low-poly look.
export function flatShade(geometry) {
  const { positions: p, colors: c, indices } = geometry;
  const count = indices.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const at = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  for (let t = 0; t < count; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    const [a, b, d] = tri.map((i) => at(p, i));
    const face = normalize(cross(sub(b, a), sub(d, a)));
    tri.forEach((index, k) => {
      positions.set(at(p, index), (t + k) * 3);
      normals.set(face, (t + k) * 3);
      colors.set(at(c, index), (t + k) * 3);
    });
  }
  return { positions, normals, colors, indices: Uint32Array.from({ length: count }, (_, i) => i) };
}

// Collects vertices and triangles; build() flips any triangle whose winding
// disagrees with its vertex normals, so shapes need not track orientation.
function builder() {
  const positions = [], normals = [], colors = [], indices = [];
  return {
    vertex(p, n, c) {
      positions.push(...p);
      normals.push(...n);
      colors.push(...c);
      return positions.length / 3 - 1;
    },
    tri(a, b, c) { indices.push(a, b, c); },
    quad(a, b, c, d) { indices.push(a, b, c, a, c, d); },
    build() {
      const at = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
      for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const pa = at(positions, a), pb = at(positions, b), pc = at(positions, c);
        const face = cross(sub(pb, pa), sub(pc, pa));
        const n = [0, 1, 2].map((k) => normals[a * 3 + k] + normals[b * 3 + k] + normals[c * 3 + k]);
        if (face[0] * n[0] + face[1] * n[1] + face[2] * n[2] < 0) {
          indices[t + 1] = c;
          indices[t + 2] = b;
        }
      }
      return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        colors: new Float32Array(colors),
        indices: new Uint32Array(indices),
      };
    },
  };
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
