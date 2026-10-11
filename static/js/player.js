import { AVATAR_SPECS, createAvatarState } from "./avatars.js";
import * as mat4 from "./mat4.js";
import { waveHeight } from "./waves.js";

const MOVE_SPEED = 6;          // world units per second on land
const SWIM_SPEED = 4.2;        // when floating

// player.y is the base of the avatar (the ground it stands on, or where it sits in the water).
export function createPlayer(x, z) {
  return {
    x, z, y: 0,
    radius: AVATAR_SPECS.ball.radius, mass: 4,
    orientation: mat4.identity(), // the ball's roll
    prevX: x, prevZ: z,
    floating: false,
    avatar: null,                 // chosen on the start screen
  };
}

export function chooseAvatar(player, id) {
  player.avatar = createAvatarState(id);
  player.radius = AVATAR_SPECS[id].radius;
}

// Moves along the camera-relative direction { ahead, strafe } (length <= 1;
// a half-pushed touch stick moves at half speed).
export function movePlayer(player, move, yaw, dt) {
  player.prevX = player.x;
  player.prevZ = player.z;

  const forward = [Math.sin(yaw), Math.cos(yaw)];
  const right = [-forward[1], forward[0]];
  const dx = forward[0] * move.ahead + right[0] * move.strafe;
  const dz = forward[1] * move.ahead + right[1] * move.strafe;
  const speed = player.floating ? SWIM_SPEED : MOVE_SPEED;
  player.x += dx * speed * dt;
  player.z += dz * speed * dt;
}

// Stands on the ground, or floats on the waves where the water is deep enough.
export function settlePlayer(player, terrain, time) {
  const floatDepth = AVATAR_SPECS[player.avatar?.id ?? "ball"].floatDepth;
  const ground = terrain.heightAt(player.x, player.z);
  const afloat = waveHeight(player.x, player.z, time) - floatDepth;
  player.floating = afloat > ground;
  player.y = Math.max(ground, afloat);
}

// Rolls the ball by however far it actually travelled this frame,
// including pushes from collisions.
export function rollPlayer(player) {
  const mx = player.x - player.prevX, mz = player.z - player.prevZ;
  const moved = Math.hypot(mx, mz);
  if (moved === 0) return;
  const axis = [mz / moved, 0, -mx / moved];
  player.orientation = mat4.multiply(mat4.rotationAxis(axis, moved / player.radius), player.orientation);
}
