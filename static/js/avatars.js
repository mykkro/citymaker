// Playable avatars: a rolling ball and three animals (tabby cat, dog, hedgehog)
// with simple walk, idle and swim animations.
// Animal model space: origin on the ground under the body, +z forward, +y up.

import { createMesh } from "./gl.js";
import * as mat4 from "./mat4.js";
import { cone, ellipsoid, merge, transform } from "./shapes.js";
import { createSphereGeometry } from "./sphere.js";

export const AVATAR_IDS = ["ball", "cat", "dog", "hedgehog"];

const TURN_RATE = 10;           // radians per second toward the travel direction
const WALK_SPEED = 6;           // speed that counts as a full stride
const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0], Z_AXIS = [0, 0, 1];
const UP = mat4.rotationAxis(X_AXIS, -Math.PI / 2); // turns +z-pointing cones to +y

// Per-avatar physical settings. floatDepth: how far the model origin sits below
// the waves when swimming (the ball's origin is its bottom).
export const AVATAR_SPECS = {
  ball: { radius: 0.5, floatDepth: 0.38 },
  cat: { radius: 0.4, floatDepth: 0.5 },
  dog: { radius: 0.45, floatDepth: 0.55 },
  hedgehog: { radius: 0.42, floatDepth: 0.3 },
};

export function createAvatarState(id) {
  return { id, heading: 0, speed: 0, phase: 0, time: 0 };
}

// Turns animals toward where they actually moved and advances the gait.
export function updateAvatar(player, dt) {
  const a = player.avatar;
  if (!a || dt <= 0) return;
  a.time += dt;
  const dx = player.x - player.prevX, dz = player.z - player.prevZ;
  const moved = Math.hypot(dx, dz);
  a.speed += (moved / dt - a.speed) * Math.min(dt * 10, 1);
  if (moved > 0.002) {
    const target = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(target - a.heading), Math.cos(target - a.heading));
    a.heading += Math.sign(turn) * Math.min(Math.abs(turn), TURN_RATE * dt);
  }
  const rig = RIGS[a.id];
  if (rig) a.phase += (moved * rig.stepsPerUnit) + (player.floating ? dt * 5 : 0); // paddle while afloat
}

// ---------- Models ----------

const ORANGE = [0.92, 0.56, 0.22], STRIPE = [0.62, 0.33, 0.12], CREAM = [0.98, 0.9, 0.78];
const PINK = [0.95, 0.6, 0.62], GREEN_EYE = [0.45, 0.78, 0.25], BLACK = [0.04, 0.04, 0.05];
const TAN = [0.84, 0.62, 0.36], DARK_TAN = [0.5, 0.32, 0.18];
const SPINE = [0.33, 0.26, 0.2], SPINE_LIGHT = [0.62, 0.55, 0.45], FACE = [0.88, 0.78, 0.62];

const tabby = (u) => (u[1] < -0.55 ? CREAM : Math.sin(u[2] * 13 + u[1] * 3) > 0.35 ? STRIPE : ORANGE);
const tabbyHead = (u) => (u[1] > 0.45 && Math.sin(u[0] * 22) > 0.2 ? STRIPE : ORANGE);
const upCone = (base, radius, length, color, sides = 6) =>
  transform(cone([0, 0, 0], radius, length, color, sides), mat4.multiply(mat4.translation(...base), UP));

function catParts() {
  return {
    body: ellipsoid([0, 0.42, 0], [0.2, 0.2, 0.42], tabby, 8, 14),
    head: merge( // relative to neck
      ellipsoid([0, 0.08, 0.12], [0.19, 0.17, 0.17], tabbyHead),
      ellipsoid([0, 0.02, 0.26], [0.09, 0.06, 0.06], CREAM),              // muzzle
      ellipsoid([0, 0.05, 0.31], [0.025, 0.018, 0.012], PINK),           // nose
      ellipsoid([0.075, 0.11, 0.26], [0.035, 0.04, 0.02], GREEN_EYE),
      ellipsoid([-0.075, 0.11, 0.26], [0.035, 0.04, 0.02], GREEN_EYE),
      ellipsoid([0.075, 0.11, 0.277], [0.01, 0.03, 0.008], BLACK),        // slit pupils
      ellipsoid([-0.075, 0.11, 0.277], [0.01, 0.03, 0.008], BLACK),
      upCone([0.1, 0.19, 0.1], 0.065, 0.14, ORANGE, 5),                   // ears
      upCone([-0.1, 0.19, 0.1], 0.065, 0.14, ORANGE, 5),
    ),
    leg: merge(
      ellipsoid([0, -0.14, 0], [0.055, 0.16, 0.06], ORANGE),
      ellipsoid([0, -0.28, 0.02], [0.06, 0.035, 0.075], CREAM),           // paw
    ),
    tail: merge( // curls up behind
      ellipsoid([0, 0.04, -0.1], [0.05, 0.05, 0.13], ORANGE),
      ellipsoid([0, 0.17, -0.2], [0.045, 0.12, 0.045], STRIPE),
      ellipsoid([0, 0.32, -0.18], [0.04, 0.07, 0.04], ORANGE),
    ),
  };
}

function dogParts() {
  const tail = transform(
    merge(ellipsoid([0, 0, -0.14], [0.045, 0.045, 0.18], TAN), ellipsoid([0, 0, -0.3], [0.04, 0.04, 0.06], CREAM)),
    mat4.rotationAxis(X_AXIS, -0.8), // points up and back
  );
  return {
    body: merge(
      ellipsoid([0, 0.5, 0], [0.22, 0.22, 0.45], TAN),
      ellipsoid([0, 0.45, 0.28], [0.17, 0.18, 0.14], CREAM),              // chest
    ),
    head: merge(
      ellipsoid([0, 0.1, 0.08], [0.18, 0.17, 0.19], TAN),
      ellipsoid([0, 0.03, 0.27], [0.1, 0.085, 0.14], CREAM),              // snout
      ellipsoid([0, 0.07, 0.4], [0.042, 0.032, 0.026], BLACK),            // nose
      ellipsoid([0.08, 0.15, 0.21], [0.03, 0.03, 0.02], BLACK),
      ellipsoid([-0.08, 0.15, 0.21], [0.03, 0.03, 0.02], BLACK),
      ellipsoid([0.17, 0.04, 0.05], [0.05, 0.15, 0.09], DARK_TAN),        // floppy ears
      ellipsoid([-0.17, 0.04, 0.05], [0.05, 0.15, 0.09], DARK_TAN),
      ellipsoid([0, -0.04, 0.32], [0.035, 0.012, 0.05], PINK),            // tongue
    ),
    leg: merge(
      ellipsoid([0, -0.18, 0], [0.06, 0.2, 0.065], TAN),
      ellipsoid([0, -0.36, 0.03], [0.065, 0.035, 0.08], CREAM),
    ),
    tail,
  };
}

function hedgehogParts() {
  // Spines: small cones over the back, pointing outward and swept backward.
  const spines = [];
  const radii = [0.32, 0.26, 0.4], center = [0, 0.28, -0.02];
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 16; j++) {
      const theta = 0.12 + (i / 8) * 1.45;                 // from the top down toward the flanks
      const phi = (j / 16) * Math.PI * 2 + (i % 2) * 0.2;
      const u = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      if (u[2] > 0.55 || u[1] < -0.05) continue;           // keep the face and belly clear
      const pos = u.map((c, k) => center[k] + c * radii[k] * 0.92);
      const dir = normalize([u[0], u[1] + 0.1, u[2] - 0.9]); // swept back
      const yaw = Math.atan2(dir[0], dir[2]);
      const pitch = -Math.asin(dir[1]);
      const model = [mat4.translation(...pos), mat4.rotationAxis(Y_AXIS, yaw), mat4.rotationAxis(X_AXIS, pitch)]
        .reduce((a, m) => mat4.multiply(a, m));
      spines.push(transform(cone([0, 0, 0], 0.032, 0.17, (i + j) % 3 ? SPINE : SPINE_LIGHT, 4), model));
    }
  }
  return {
    body: merge(
      ellipsoid(center, radii, SPINE),
      ellipsoid([0, 0.2, 0.1], [0.25, 0.18, 0.3], FACE),                  // face and belly fur
      ...spines,
    ),
    head: merge(
      ellipsoid([0, 0, 0.06], [0.14, 0.12, 0.14], FACE),
      cone([0, -0.01, 0.14], 0.06, 0.14, FACE, 8),                        // pointy snout
      ellipsoid([0, -0.01, 0.29], [0.03, 0.026, 0.024], BLACK),           // nose
      ellipsoid([0.07, 0.06, 0.14], [0.024, 0.024, 0.018], BLACK),
      ellipsoid([-0.07, 0.06, 0.14], [0.024, 0.024, 0.018], BLACK),
      ellipsoid([0.1, 0.1, 0.02], [0.035, 0.035, 0.02], FACE),            // ears
      ellipsoid([-0.1, 0.1, 0.02], [0.035, 0.035, 0.02], FACE),
    ),
    leg: ellipsoid([0, -0.05, 0.01], [0.05, 0.08, 0.055], FACE),
    tail: null,
  };
}

// Where the parts attach, and how each animal moves.
const RIGS = {
  cat: {
    parts: catParts, scale: 1.15, neck: [0, 0.55, 0.35], tailPivot: [0, 0.5, -0.4],
    hips: [[0.11, 0.3, 0.26], [-0.11, 0.3, 0.26], [0.11, 0.3, -0.26], [-0.11, 0.3, -0.26]],
    stepsPerUnit: 7, swing: 0.6, tail: "sway",
  },
  dog: {
    parts: dogParts, scale: 1.1, neck: [0, 0.68, 0.4], tailPivot: [0, 0.6, -0.43],
    hips: [[0.12, 0.38, 0.3], [-0.12, 0.38, 0.3], [0.12, 0.38, -0.3], [-0.12, 0.38, -0.3]],
    stepsPerUnit: 6, swing: 0.55, tail: "wag",
  },
  hedgehog: {
    parts: hedgehogParts, scale: 1.3, neck: [0, 0.26, 0.32], tailPivot: null,
    hips: [[0.14, 0.12, 0.18], [-0.14, 0.12, 0.18], [0.14, 0.12, -0.18], [-0.14, 0.12, -0.18]],
    stepsPerUnit: 14, swing: 0.8, tail: null,
  },
};

export function createAvatarMeshes(gl) {
  const meshes = {
    ball: createMesh(gl, createSphereGeometry(AVATAR_SPECS.ball.radius, [0.95, 0.45, 0.2], [0.95, 0.92, 0.85])),
  };
  for (const [id, rig] of Object.entries(RIGS)) {
    const parts = rig.parts();
    meshes[id] = Object.fromEntries(Object.entries(parts).filter(([, g]) => g).map(([name, g]) => [name, createMesh(gl, g)]));
  }
  return meshes;
}

// Draws player.avatar at the player's position; player.y is the model's base.
export function drawAvatar(gl, uniforms, meshes, player) {
  const a = player.avatar;
  if (!a) return;
  gl.uniform3f(uniforms.uTint, 1, 1, 1);
  const draw = (mesh, model) => {
    gl.uniformMatrix4fv(uniforms.uModel, false, model);
    mesh.draw();
  };

  if (a.id === "ball") {
    const r = AVATAR_SPECS.ball.radius;
    draw(meshes.ball, mat4.multiply(mat4.translation(player.x, player.y + r, player.z), player.orientation));
    return;
  }

  const rig = RIGS[a.id], m = meshes[a.id], t = a.time;
  const stride = player.floating ? 1 : Math.min(a.speed / WALK_SPEED, 1);
  const idle = player.floating ? 0 : 1 - Math.min(a.speed / 1.5, 1);
  const bob = Math.abs(Math.sin(a.phase)) * 0.04 * stride + Math.sin(t * 2.2) * 0.008 * idle;
  const base = [
    mat4.translation(player.x, player.y + bob * rig.scale, player.z),
    mat4.rotationAxis(Y_AXIS, a.heading),
    mat4.scaling(rig.scale),
  ].reduce((acc, mm) => mat4.multiply(acc, mm));
  const at = (pivot, ...rest) => [base, mat4.translation(...pivot), ...rest].reduce((acc, mm) => mat4.multiply(acc, mm));

  draw(m.body, base);

  // Head: bobs with the stride; when idle it glances around (the hedgehog sniffs).
  const look = Math.sin(t * 0.7) * 0.45 * idle + Math.sin(t * 0.23) * 0.2 * idle;
  const sniff = a.id === "hedgehog" ? Math.max(Math.sin(t * 1.3), 0) * Math.sin(t * 22) * 0.06 * idle : 0;
  const nod = Math.sin(a.phase * 2) * 0.06 * stride + sniff - (player.floating ? 0.15 : 0);
  draw(m.head, at(rig.neck, mat4.rotationAxis(Y_AXIS, look), mat4.rotationAxis(X_AXIS, nod)));

  // Legs: diagonal pairs swing together (front-left with back-right).
  rig.hips.forEach((hip, i) => {
    const pair = i === 0 || i === 3 ? 0 : Math.PI;
    const swing = Math.sin(a.phase + pair) * rig.swing * stride;
    draw(m.leg, at(hip, mat4.rotationAxis(X_AXIS, swing)));
  });

  if (m.tail) {
    const moving = 1 - idle;
    const sway = rig.tail === "wag"
      ? Math.sin(t * (8 + 6 * moving)) * 0.55                             // dogs wag all the time
      : Math.sin(t * 1.3) * 0.45 * idle + Math.sin(a.phase) * 0.15;         // cats swish slowly
    const lift = rig.tail === "sway" ? -0.25 * moving : 0;                  // cat tail streams back when running
    draw(m.tail, at(rig.tailPivot, mat4.rotationAxis(Y_AXIS, sway), mat4.rotationAxis(X_AXIS, lift), mat4.rotationAxis(Z_AXIS, 0)));
  }
}

function normalize(v) {
  const len = Math.hypot(...v) || 1;
  return v.map((c) => c / len);
}
