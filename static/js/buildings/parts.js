// A library of building parts: walls, windows, doors, roofs, chimneys, timber framing,
// towers. Each returns geometry ({ positions, normals, colors, indices }) in its own local
// frame; models.js places and combines them into houses, churches and mills.
//
// Wall-mounted parts (windows, doors) are built on a wall facing +z, centred on the opening,
// with z = 0 at the wall's surface; they stand a few centimetres proud of it.

import * as mat4 from "../mat4.js";
import { box, cone, cylinder, ellipsoid, flatShade, merge, transform } from "../shapes.js";

const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0], Z_AXIS = [0, 0, 1];
export const GLASS = [0.2, 0.27, 0.34];
const STEP = [0.6, 0.58, 0.55];

export function place(geometry, x, y, z, yaw = 0) {
  return transform(geometry, mat4.multiply(mat4.translation(x, y, z), mat4.rotationAxis(Y_AXIS, yaw)));
}

// A window: frame, glass split by a mullion and a transom, a sill, and (optionally) shutters.
// style: "plain" | "shutters" | "arched" (tall church window with a round top).
export function window({ width = 0.8, height = 0.9, frame, sill = frame, shutters = null, style = "plain" }) {
  const parts = [
    box([0, 0, 0.02], [width + 0.16, height + 0.16, 0.06], frame),
    box([0, 0, 0.04], [width, height, 0.04], GLASS),
    box([0, 0, 0.065], [0.05, height, 0.02], frame),
    box([0, -height / 2 - 0.06, 0.08], [width + 0.3, 0.07, 0.18], sill),
  ];
  if (style !== "arched") parts.push(box([0, height * 0.12, 0.065], [width, 0.05, 0.02], frame));
  if (style === "arched") {
    parts.push(flatShade(ellipsoid([0, height / 2, 0.02], [width / 2 + 0.08, width / 2 + 0.08, 0.03], frame, 4, 10)));
    parts.push(flatShade(ellipsoid([0, height / 2, 0.04], [width / 2, width / 2, 0.025], GLASS, 4, 10)));
  }
  if (shutters) {
    for (const side of [-1, 1]) parts.push(box([side * (width * 0.5 + 0.08 + width * 0.27), 0, 0.05], [width * 0.52, height + 0.1, 0.05], shutters));
  }
  return merge(...parts);
}

// A door: frame, a leaf of two planks with a handle, and a step in front.
export function door({ width = 1, height = 2, frame, leaf, arched = false }) {
  const plank = leaf.map((c) => c * 0.85);
  const parts = [
    box([0, height / 2, 0.02], [width + 0.2, height + 0.1, 0.06], frame),
    box([0, height / 2, 0.05], [width, height, 0.05], leaf),
    box([-width / 4, height / 2, 0.08], [width * 0.08, height, 0.01], plank),
    box([width / 4, height / 2, 0.08], [width * 0.08, height, 0.01], plank),
    box([width * 0.32, height * 0.48, 0.1], [0.08, 0.08, 0.05], [0.15, 0.13, 0.1]),
    box([0, 0.06, 0.25], [width + 0.4, 0.14, 0.45], STEP),
  ];
  if (arched) {
    parts.push(flatShade(ellipsoid([0, height, 0.02], [width / 2 + 0.1, width / 2 + 0.1, 0.03], frame, 4, 10)));
    parts.push(flatShade(ellipsoid([0, height, 0.05], [width / 2, width / 2, 0.025], leaf, 4, 10)));
  }
  return merge(...parts);
}

// Timber framing on a wall facing +z, `length` wide and `height` tall from y = 0:
// posts at the corners and every ~1.3 m, a beam at each floor and under the eaves.
export function timberFrame(length, height, floors, color) {
  const parts = [];
  const posts = Math.max(2, Math.round(length / 1.3) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + 0.07 + (i / (posts - 1)) * (length - 0.14);
    parts.push(box([x, height / 2, 0.02], [0.14, height, 0.05], color));
  }
  for (let f = 0; f <= floors; f++) {
    const y = Math.min(0.1 + (f * height) / floors, height - 0.07);
    parts.push(box([0, y, 0.025], [length, 0.14, 0.05], color));
  }
  return merge(...parts);
}

// A gable roof over a span (across) and a length (along the ridge, local x), its eaves at y = 0.
// material: "thatch" (thick, rounded ridge), "tile" (thin, with courses), "snow" (thick, white).
// gableColor fills the triangular ends.
export function gableRoof({ length, span, pitch, material, color, gableColor }) {
  const thick = material === "thatch" ? 0.32 : material === "snow" ? 0.24 : 0.12;
  const eaves = material === "thatch" ? 0.45 : 0.3; // overhang at the eaves
  const verge = material === "thatch" ? 0.35 : 0.22; // ... and at the gables
  const half = span / 2;
  const rise = half * Math.tan(pitch);
  const slopeLength = (half + eaves) / Math.cos(pitch);
  const parts = [];
  for (const side of [1, -1]) {
    // From the ridge (z = 0, y = rise) down and out to the eave edge.
    const mid = (half + eaves) / 2;
    const normal = [0, Math.cos(pitch), side * Math.sin(pitch)];
    const centre = [0, rise - mid * Math.tan(pitch) + normal[1] * thick / 2, side * mid + normal[2] * thick / 2];
    const tilt = mat4.multiply(mat4.translation(...centre), mat4.rotationAxis(X_AXIS, side * pitch));
    parts.push(transform(box([0, 0, 0], [length + 2 * verge, thick, slopeLength], color), tilt));
    if (material === "tile") {
      // Courses of tiles: slightly darker ribs across the slope.
      const rib = color.map((c) => c * 0.82);
      for (let r = 1; r < slopeLength / 0.4; r++) {
        const along = -slopeLength / 2 + r * 0.4;
        parts.push(transform(box([0, thick / 2 + 0.01, along], [length + 2 * verge, 0.03, 0.06], rib), tilt));
      }
    }
  }
  // Ridge: a rounded roll of thatch or a row of ridge tiles.
  const ridgeColor = color.map((c) => c * (material === "snow" ? 0.97 : 0.8));
  const full = length + 2 * verge;
  const ridge = material === "thatch"
    // A roll along x: a cylinder centred on the origin, turned on its side, lifted onto the ridge.
    ? flatShade(transform(cylinder([0, full / 2, 0], 0.25, full, ridgeColor, 6), mat4.multiply(mat4.translation(0, rise + thick * 0.6, 0), mat4.rotationAxis(Z_AXIS, Math.PI / 2))))
    : box([0, rise + thick, 0], [full, 0.14, 0.24], ridgeColor);
  parts.push(ridge);
  for (const end of [-1, 1]) parts.push(gable(end * length / 2, half, rise, gableColor));
  return merge(...parts);
}

// The triangular end wall under a gable, in the plane x = x0 (both faces).
function gable(x0, half, rise, color) {
  const positions = [], normals = [], colors = [], indices = [];
  const corners = [[x0, 0, -half], [x0, 0, half], [x0, rise, 0]];
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (const p of corners) {
      positions.push(...p);
      normals.push(side, 0, 0);
      colors.push(...color);
    }
    // Facing +x: counter-clockwise seen from +x is (0, 2, 1) for these corners.
    indices.push(...(side > 0 ? [base, base + 2, base + 1] : [base, base + 1, base + 2]));
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}

// A flat roof slab with a low parapet round its edge, and wooden beam ends sticking out of the front.
export function flatRoof({ width, depth, color, beams }) {
  const parts = [box([0, 0.1, 0], [width + 0.1, 0.2, depth + 0.1], color)];
  const lip = color.map((c) => c * 0.94);
  parts.push(box([0, 0.35, depth / 2 - 0.1], [width + 0.1, 0.5, 0.2], lip), box([0, 0.35, -depth / 2 + 0.1], [width + 0.1, 0.5, 0.2], lip));
  parts.push(box([width / 2 - 0.1, 0.35, 0], [0.2, 0.5, depth - 0.2], lip), box([-width / 2 + 0.1, 0.35, 0], [0.2, 0.5, depth - 0.2], lip));
  if (beams) {
    for (let x = -width / 2 + 0.6; x < width / 2 - 0.3; x += 0.9) {
      parts.push(transform(cylinder([0, 0.4, 0], 0.07, 0.4, beams, 5), mat4.multiply(mat4.translation(x, -0.15, depth / 2), mat4.rotationAxis(X_AXIS, Math.PI / 2))));
    }
  }
  return merge(...parts);
}

// A conical roof (huts, towers), its eaves at y = 0.
export function coneRoof({ radius, height, color, sides = 10 }) {
  const up = mat4.rotationAxis(X_AXIS, -Math.PI / 2);
  return flatShade(transform(cone([0, 0, 0], radius, height, color, sides), up));
}

// A four-sided spire or a low pyramid roof on a square tower, its base at y = 0.
export function pyramid({ size, height, color }) {
  const up = mat4.multiply(mat4.rotationAxis(Y_AXIS, Math.PI / 4), mat4.rotationAxis(X_AXIS, -Math.PI / 2));
  return flatShade(transform(cone([0, 0, 0], (size / 2) * Math.SQRT2, height, color, 4), up));
}

export function chimney({ height, color }) {
  return merge(
    box([0, height / 2, 0], [0.55, height, 0.55], color),
    box([0, height + 0.05, 0], [0.7, 0.12, 0.7], color.map((c) => c * 0.85)),
  );
}

// A stone plinth under walls of `width` × `depth`, reaching down into the ground.
export function plinth(width, depth, color) {
  return box([0, -0.2, 0], [width + 0.12, 1, depth + 0.12], color);
}

// A tapering tower of `sides` faces, from radius r0 at y0 to r1 at y1 (flat shaded, capped).
export function frustum({ r0, r1, y0, y1, color, sides = 8 }) {
  const positions = [], normals = [], colors = [], indices = [];
  const quad = (a, b, c, d, n) => {
    const base = positions.length / 3;
    for (const p of [a, b, c, d]) {
      positions.push(...p);
      normals.push(...n);
      colors.push(...color);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
    const at = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const slope = (r0 - r1) / (y1 - y0);
    const len = Math.hypot(1, slope);
    // Counter-clockwise seen from outside.
    quad(at(a0, r0, y0), at(a0, r1, y1), at(a1, r1, y1), at(a1, r0, y0), [Math.cos(am) / len, slope / len, Math.sin(am) / len]);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}

// A cross for the top of a spire.
export function cross(color) {
  return merge(box([0, 0.6, 0], [0.12, 1.2, 0.12], color), box([0, 0.8, 0], [0.6, 0.12, 0.12], color));
}
