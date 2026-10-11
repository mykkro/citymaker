import assert from "node:assert/strict";
import { test } from "node:test";

import { isDeep, spawnDolphins, updateDolphin } from "../../static/js/dolphins.js";
import { createRandom } from "../../static/js/random.js";

// A round island of radius 25 in the middle of a 96-unit sea.
const terrain = {
  size: 96,
  heightAt: (x, z) => (Math.hypot(x - 48, z - 48) < 25 ? 2 : Math.hypot(x - 48, z - 48) < 28 ? -0.5 : -3),
};
const onLand = { x: 48, z: 48, radius: 0.5, floating: false };

function simulate(dolphins, player, seconds, random, onStep = () => {}) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    for (const d of dolphins) updateDolphin(d, 1 / 30, typeof player === "function" ? player(t) : player, terrain, random);
    onStep(t);
  }
}

test("dolphins spawn in deep water", () => {
  const dolphins = spawnDolphins(createRandom(1), terrain);
  assert.equal(dolphins.length, 5);
  for (const d of dolphins) assert.ok(isDeep(terrain, d.x, d.z));
});

test("they never swim into the shallows over a long roam", () => {
  const random = createRandom(2);
  const dolphins = spawnDolphins(random, terrain);
  simulate(dolphins, onLand, 180, random, () => {
    for (const d of dolphins) assert.ok(isDeep(terrain, d.x, d.z), `dolphin at ${d.x.toFixed(1)},${d.z.toFixed(1)}`);
  });
});

test("a floating player nearby gets followed, and followers stay close", () => {
  const random = createRandom(3);
  const [d] = spawnDolphins(random, terrain, 1);
  const player = { x: d.x + 6, z: d.z, radius: 0.5, floating: true };
  // Keep the player in deep water right next to the dolphin.
  if (!isDeep(terrain, player.x, player.z)) player.x = d.x - 6;
  simulate([d], player, 10, random);
  assert.equal(d.mode, "follow");
  simulate([d], player, 4, random);
  assert.ok(Math.hypot(d.x - player.x, d.z - player.z) < 6, "stays near the player");
});

test("followers lose interest once the player is back on land", () => {
  const random = createRandom(4);
  const [d] = spawnDolphins(random, terrain, 1);
  d.mode = "follow";
  d.timer = 30;
  simulate([d], onLand, 0.1, random);
  assert.equal(d.mode, "roam");
  assert.ok(d.cooldown > 0);
});

test("nobody follows a player who stays on land", () => {
  const random = createRandom(5);
  const dolphins = spawnDolphins(random, terrain);
  simulate(dolphins, onLand, 60, random, () => {
    for (const d of dolphins) assert.equal(d.mode, "roam");
  });
});

test("jumps leave the water and come back down", () => {
  const random = createRandom(6);
  const [d] = spawnDolphins(random, terrain, 1);
  d.jumping = true;
  d.vy = 6.5;
  let peak = d.y;
  simulate([d], onLand, 3, random, () => { peak = Math.max(peak, d.y); if (!d.jumping) d.vy = 0; });
  assert.ok(peak > 1, `peak ${peak.toFixed(2)} clears the surface`);
  assert.ok(d.y < 0, "back under the surface");
});

test("dolphins do jump on their own now and then", () => {
  const random = createRandom(7);
  const dolphins = spawnDolphins(random, terrain);
  let jumps = 0;
  const was = new Map();
  simulate(dolphins, onLand, 120, random, () => {
    for (const d of dolphins) {
      if (d.jumping && !was.get(d)) jumps++;
      was.set(d, d.jumping);
    }
  });
  assert.ok(jumps >= 2 && jumps < 60, `${jumps} jumps in 2 minutes`);
});
