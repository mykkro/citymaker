// Stylized chicken: model, wandering/fleeing behaviour and walk animation.
// Model space: origin on the ground between the feet, +z forward, +y up.

import { createMesh } from "./gl.js";
import * as mat4 from "./mat4.js";
import { box, cone, cylinder, ellipsoid, merge } from "./shapes.js";

const WHITE = [0.96, 0.95, 0.9];
const SHADE = [0.86, 0.85, 0.8];
const RED = [0.85, 0.12, 0.1];
const ORANGE = [0.98, 0.66, 0.15];
const BLACK = [0.05, 0.05, 0.05];

// The unscaled model is ~0.94 tall; this makes a default chicken ~1.2, a bit taller than the ball.
const BASE_SCALE = 1.3;
const SIZE_VARIATION = 0.15;      // +/- fraction of BASE_SCALE
const FEATHER_TINTS = [
  [1, 1, 1],          // white
  [1, 0.95, 0.82],    // cream
  [0.86, 0.72, 0.5],  // tan
  [0.84, 0.84, 0.86], // grey
];
const HIP = [0.09, 0.28, 0];      // x is mirrored for the other leg
const SHOULDER = [0.19, 0.52, 0]; // x is mirrored for the other wing
const NECK = [0, 0.58, 0.16];

const WALK_SPEED = 1.2;
const FLEE_SPEED = 3.2;
const FLEE_RADIUS = 3;
const TURN_RATE = 4;       // radians per second
const ACCELERATION = 6;
const EDGE_MARGIN = 2;
const STEPS_PER_UNIT = 11; // leg cycle speed per unit walked, at scale 1
const PECK_DURATION = 0.4;

const SHORE = 0.35; // chickens keep to ground at least this far above the sea
const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0], Z_AXIS = [0, 0, 1];

export function createChickenMeshes(gl) {
  return {
    body: createMesh(gl, merge(
      ellipsoid([0, 0.45, -0.02], [0.2, 0.19, 0.28], WHITE),
      ellipsoid([0, 0.58, -0.27], [0.13, 0.13, 0.07], SHADE), // tail
    )),
    head: createMesh(gl, merge( // relative to NECK
      ellipsoid([0, 0.17, 0.07], [0.13, 0.13, 0.13], WHITE),
      cone([0, 0.16, 0.18], 0.045, 0.11, ORANGE),                // beak
      ellipsoid([0, 0.07, 0.17], [0.03, 0.055, 0.03], RED),      // wattle
      ellipsoid([0, 0.3, 0.07], [0.025, 0.06, 0.09], RED),       // comb
      ellipsoid([0.11, 0.2, 0.13], [0.022, 0.022, 0.022], BLACK),
      ellipsoid([-0.11, 0.2, 0.13], [0.022, 0.022, 0.022], BLACK),
    )),
    wing: createMesh(gl, ellipsoid([0, -0.1, -0.04], [0.04, 0.13, 0.2], SHADE)), // relative to SHOULDER
    leg: createMesh(gl, merge( // relative to HIP
      cylinder([0, 0, 0], 0.025, 0.27, ORANGE),
      box([0, -0.27, 0.03], [0.1, 0.025, 0.15], ORANGE),        // foot
    )),
  };
}

// Scatters chickens at random spots at least `clearance` away from `avoid`
// and clear of the solid `obstacles`.
export function spawnChickens(count, random, terrain, avoid, obstacles, clearance = 3) {
  const chickens = [];
  const margin = EDGE_MARGIN;
  for (let tries = 0; chickens.length < count && tries < 5000; tries++) {
    const x = random.range(margin, terrain.size - margin);
    const z = random.range(margin, terrain.size - margin);
    if (Math.hypot(x - avoid.x, z - avoid.z) < clearance) continue;
    if (chickens.some((c) => Math.hypot(x - c.x, z - c.z) < 1.5)) continue;
    if (obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + 0.6)) continue;
    if (terrain.heightAt(x, z) < SHORE + 0.5) continue; // on land, not the beach edge
    const heading = random.range(0, Math.PI * 2);
    const scale = BASE_SCALE * random.range(1 - SIZE_VARIATION, 1 + SIZE_VARIATION);
    const tint = FEATHER_TINTS[Math.floor(random() * FEATHER_TINTS.length)]
      .map((c) => Math.min(c + random.range(-0.04, 0.04), 1));
    chickens.push({
      x, z, scale, tint,
      radius: 0.26 * scale,
      mass: scale ** 3,
      heading, targetHeading: heading, speed: 0,
      mode: "idle", timer: random.range(0, 2),
      phase: 0, peck: 0, time: random.range(0, 10),
    });
  }
  return chickens;
}

export function updateChicken(chicken, dt, player, terrain, random) {
  chicken.prevX = chicken.x;
  chicken.prevZ = chicken.z;
  chicken.time += dt;
  chicken.timer -= dt;

  const awayX = chicken.x - player.x, awayZ = chicken.z - player.z;
  if (Math.hypot(awayX, awayZ) < FLEE_RADIUS) {
    chicken.mode = "flee";
    chicken.targetHeading = Math.atan2(awayX, awayZ);
    chicken.timer = 0.8;
  } else if (chicken.timer <= 0) {
    if (random() < 0.55) {
      chicken.mode = "walk";
      chicken.targetHeading = chicken.heading + random.range(-1.5, 1.5);
    } else {
      chicken.mode = "idle";
    }
    chicken.timer = random.range(1, 3);
  }

  // Head back toward the middle when close to the edge of the map.
  const size = terrain.size;
  if (chicken.mode !== "idle" && (chicken.x < EDGE_MARGIN || chicken.z < EDGE_MARGIN ||
      chicken.x > size - EDGE_MARGIN || chicken.z > size - EDGE_MARGIN)) {
    chicken.targetHeading = Math.atan2(size / 2 - chicken.x, size / 2 - chicken.z);
  }

  const turn = wrapAngle(chicken.targetHeading - chicken.heading);
  chicken.heading += Math.sign(turn) * Math.min(Math.abs(turn), TURN_RATE * dt);

  const targetSpeed = { idle: 0, walk: WALK_SPEED, flee: FLEE_SPEED }[chicken.mode];
  const dv = targetSpeed - chicken.speed;
  chicken.speed += Math.sign(dv) * Math.min(Math.abs(dv), ACCELERATION * dt);

  chicken.x += Math.sin(chicken.heading) * chicken.speed * dt;
  chicken.z += Math.cos(chicken.heading) * chicken.speed * dt;
  if (keepOnLand(chicken, terrain)) {
    // Reached the water's edge: head back inland.
    chicken.targetHeading = Math.atan2(size / 2 - chicken.x, size / 2 - chicken.z);
    if (chicken.mode === "idle") chicken.mode = "walk";
  }
  chicken.phase += chicken.speed * dt * STEPS_PER_UNIT / chicken.scale;

  if (chicken.peck > 0) {
    chicken.peck = Math.max(chicken.peck - dt / PECK_DURATION, 0);
  } else if (chicken.mode === "idle" && random() < dt * 0.6) {
    chicken.peck = 1;
  }
}

// Undoes this frame's move if it took the chicken into the water. Returns true if it did.
export function keepOnLand(chicken, terrain) {
  if (terrain.heightAt(chicken.x, chicken.z) >= SHORE) return false;
  chicken.x = chicken.prevX;
  chicken.z = chicken.prevZ;
  return true;
}

export function drawChicken(gl, uniforms, meshes, chicken, terrain) {
  const stride = Math.min(chicken.speed / WALK_SPEED, 1);
  const bob = Math.abs(Math.sin(chicken.phase)) * 0.03 * stride * chicken.scale;
  const base = chain(
    mat4.translation(chicken.x, terrain.heightAt(chicken.x, chicken.z) + bob, chicken.z),
    mat4.rotationAxis(Y_AXIS, chicken.heading),
    mat4.scaling(chicken.scale),
  );
  gl.uniform3fv(uniforms.uTint, chicken.tint);
  const draw = (mesh, model) => {
    gl.uniformMatrix4fv(uniforms.uModel, false, model);
    mesh.draw();
  };

  draw(meshes.body, base);

  const headPitch = Math.sin(chicken.phase * 2) * 0.15 * stride + Math.sin(chicken.peck * Math.PI) * 1.1;
  draw(meshes.head, chain(base, mat4.translation(...NECK), mat4.rotationAxis(X_AXIS, headPitch)));

  const flap = chicken.mode === "flee" ? 0.35 + Math.sin(chicken.time * 28) * 0.35 : 0.06;
  for (const side of [1, -1]) {
    const shoulder = mat4.translation(SHOULDER[0] * side, SHOULDER[1], SHOULDER[2]);
    draw(meshes.wing, chain(base, shoulder, mat4.rotationAxis(Z_AXIS, flap * side)));

    const swing = Math.sin(chicken.phase) * 0.7 * stride * side;
    const hip = mat4.translation(HIP[0] * side, HIP[1], HIP[2]);
    draw(meshes.leg, chain(base, hip, mat4.rotationAxis(X_AXIS, swing)));
  }
}

function chain(...matrices) {
  return matrices.reduce((acc, m) => mat4.multiply(acc, m));
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
