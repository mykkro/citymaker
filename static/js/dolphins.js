// Dolphins: roam the deep water around the island, porpoise along the surface,
// sometimes get curious and swim alongside a floating player, and now and then jump.
// Model space: +z forward (snout), +y up; origin at the middle of the body.

import { createMesh } from "./gl.js";
import * as mat4 from "./mat4.js";
import { cone, ellipsoid, flatShade, merge, transform } from "./shapes.js";
import { SEA_LEVEL, waveHeight } from "./waves.js";

export const MIN_DEPTH = 1.4;         // they keep to water at least this deep
export const FOLLOW_RANGE = 14;       // how close a floating player must be to catch their interest
const COUNT = 5;
const CRUISE_SPEED = 3.2;
const MAX_SPEED = 7;
const TURN_RATE = 1.4;                // radians per second
const FOLLOW_TIME = [12, 20];         // seconds of curiosity
const FOLLOW_COOLDOWN = 25;
const FOLLOW_SIDE = 2.6;              // how far to the side of the player they swim
const EDGE_MARGIN = 4;
const SWIM_DEPTH = -0.38;             // body centre below the surface while cruising
const JUMP_SPEED = 6.5;
const GRAVITY = 12;
const JUMP_CHANCE = { roam: 0.025, follow: 0.12 }; // per second

const BACK = [0.4, 0.48, 0.58];
const BELLY = [0.84, 0.86, 0.88];
const FIN = [0.33, 0.4, 0.5];
const EYE = [0.05, 0.05, 0.06];
const TAIL_PIVOT = [0, 0, -0.85];
const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0];

export function spawnDolphins(random, terrain, count = COUNT) {
  const dolphins = [];
  for (let tries = 0; dolphins.length < count && tries < 5000; tries++) {
    const x = random.range(EDGE_MARGIN, terrain.size - EDGE_MARGIN);
    const z = random.range(EDGE_MARGIN, terrain.size - EDGE_MARGIN);
    if (!isDeep(terrain, x, z)) continue;
    const heading = random.range(0, Math.PI * 2);
    dolphins.push({
      x, z, heading, targetHeading: heading,
      speed: CRUISE_SPEED,
      radius: 0.6, mass: 5,
      mode: "roam", timer: random.range(2, 5), cooldown: 0,
      side: random() < 0.5 ? -1 : 1,
      y: SWIM_DEPTH, vy: 0, jumping: false,
      phase: random.range(0, 10), pitch: 0,
    });
  }
  return dolphins;
}

export function isDeep(terrain, x, z) {
  return x > EDGE_MARGIN && z > EDGE_MARGIN && x < terrain.size - EDGE_MARGIN && z < terrain.size - EDGE_MARGIN &&
    terrain.heightAt(x, z) < SEA_LEVEL - MIN_DEPTH;
}

// `player.floating` tells whether the player is out on the water.
export function updateDolphin(d, dt, player, terrain, random) {
  d.timer -= dt;
  d.cooldown = Math.max(d.cooldown - dt, 0);
  const toPlayer = Math.hypot(player.x - d.x, player.z - d.z);

  if (d.mode === "follow" && (!player.floating || toPlayer > FOLLOW_RANGE * 2 || d.timer <= 0)) {
    d.mode = "roam";
    d.cooldown = FOLLOW_COOLDOWN;
    d.timer = random.range(2, 5);
  } else if (d.mode === "roam" && player.floating && toPlayer < FOLLOW_RANGE && d.cooldown === 0 && random() < dt * 0.6) {
    d.mode = "follow";
    d.timer = random.range(...FOLLOW_TIME);
  }

  let wantedSpeed = CRUISE_SPEED;
  if (d.mode === "follow") {
    // Swim beside the player, a little behind, matching pace.
    const away = Math.atan2(d.x - player.x, d.z - player.z);
    const spot = [player.x + Math.sin(away) * FOLLOW_SIDE, player.z + Math.cos(away) * FOLLOW_SIDE];
    const gap = Math.hypot(spot[0] - d.x, spot[1] - d.z);
    if (gap > 0.8) d.targetHeading = Math.atan2(spot[0] - d.x, spot[1] - d.z);
    wantedSpeed = Math.min(Math.max(gap * 1.2, 1.2), MAX_SPEED);
  } else if (d.timer <= 0) {
    d.targetHeading = d.heading + random.range(-1.2, 1.2);
    d.timer = random.range(3, 7);
  }

  // Stay in deep water: look ahead and swing away from shallows or the map edge.
  const ahead = 3 + d.speed;
  if (!isDeep(terrain, d.x + Math.sin(d.heading) * ahead, d.z + Math.cos(d.heading) * ahead)) {
    const left = d.heading + 1.2, right = d.heading - 1.2;
    const leftOk = isDeep(terrain, d.x + Math.sin(left) * ahead, d.z + Math.cos(left) * ahead);
    d.targetHeading = leftOk ? left : right;
    wantedSpeed = Math.min(wantedSpeed, CRUISE_SPEED);
  }

  const turn = Math.atan2(Math.sin(d.targetHeading - d.heading), Math.cos(d.targetHeading - d.heading));
  d.heading += Math.sign(turn) * Math.min(Math.abs(turn), TURN_RATE * dt * (d.jumping ? 0.2 : 1));
  d.speed += (wantedSpeed - d.speed) * Math.min(dt * 1.5, 1);

  const nx = d.x + Math.sin(d.heading) * d.speed * dt;
  const nz = d.z + Math.cos(d.heading) * d.speed * dt;
  if (isDeep(terrain, nx, nz)) {
    d.x = nx;
    d.z = nz;
  } else {
    d.targetHeading = d.heading + Math.PI; // boxed in: turn around
  }
  d.phase += dt * (2 + d.speed * 0.9);

  // Vertical motion: porpoise near the surface, or fly through a jump.
  if (d.jumping) {
    d.vy -= GRAVITY * dt;
    d.y += d.vy * dt;
    if (d.vy < 0 && d.y <= SWIM_DEPTH) {
      d.jumping = false;
      d.y = SWIM_DEPTH;
      d.vy = 0;
    }
    d.pitch = Math.atan2(d.vy, Math.max(d.speed, 2));
  } else {
    d.y = SWIM_DEPTH + Math.sin(d.phase * 0.45) * 0.28;
    d.pitch = Math.cos(d.phase * 0.45) * 0.18;
    if (random() < dt * JUMP_CHANCE[d.mode]) {
      d.jumping = true;
      d.vy = JUMP_SPEED;
    }
  }
}

export function createDolphinMeshes(gl) {
  const dorsal = flatShade(transform(
    cone([0, 0, 0], 0.2, 0.42, FIN, 6),
    [mat4.translation(0, 0.22, -0.15), mat4.rotationAxis(X_AXIS, -2.1), mat4.scale3(0.3, 1, 1)]
      .reduce((a, m) => mat4.multiply(a, m)),
  ));
  return {
    body: createMesh(gl, merge(
      ellipsoid([0, 0, 0], [0.32, 0.3, 1.0], BACK),
      ellipsoid([0, -0.08, 0.05], [0.27, 0.22, 0.86], BELLY),
      ellipsoid([0, 0.03, 0.82], [0.25, 0.23, 0.36], BACK),                // head
      cone([0, -0.05, 1.08], 0.09, 0.3, BELLY, 8),                          // snout
      ellipsoid([0.2, 0.06, 0.95], [0.03, 0.03, 0.03], EYE),
      ellipsoid([-0.2, 0.06, 0.95], [0.03, 0.03, 0.03], EYE),
      ellipsoid([0.3, -0.16, 0.42], [0.28, 0.03, 0.12], FIN),               // flippers
      ellipsoid([-0.3, -0.16, 0.42], [0.28, 0.03, 0.12], FIN),
      dorsal,
    )),
    tail: createMesh(gl, merge( // relative to TAIL_PIVOT
      ellipsoid([0, 0, -0.3], [0.15, 0.17, 0.45], BACK),
      ellipsoid([0, 0, -0.74], [0.5, 0.04, 0.15], FIN),                     // flukes
    )),
  };
}

export function drawDolphin(gl, uniforms, meshes, d, time) {
  const surface = waveHeight(d.x, d.z, time);
  const base = [
    mat4.translation(d.x, surface + d.y, d.z),
    mat4.rotationAxis(Y_AXIS, d.heading),
    mat4.rotationAxis(X_AXIS, -d.pitch),
  ].reduce((a, m) => mat4.multiply(a, m));
  gl.uniform3f(uniforms.uTint, 1, 1, 1);
  gl.uniformMatrix4fv(uniforms.uModel, false, base);
  meshes.body.draw();
  const beat = Math.sin(d.phase * 2.2) * (d.jumping ? 0.15 : 0.35);
  gl.uniformMatrix4fv(uniforms.uModel, false,
    mat4.multiply(mat4.multiply(base, mat4.translation(...TAIL_PIVOT)), mat4.rotationAxis(X_AXIS, beat)));
  meshes.tail.draw();
}
