import assert from "node:assert/strict";
import { test } from "node:test";

import { AVATAR_IDS, AVATAR_SPECS, updateAvatar } from "../../static/js/avatars.js";
import { chooseAvatar, createPlayer, movePlayer, settlePlayer } from "../../static/js/player.js";
import { waveHeight } from "../../static/js/waves.js";

const land = { size: 96, heightAt: () => 2 };
const sea = { size: 96, heightAt: () => -3 };

function walk(player, move, seconds, yaw = 0) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    movePlayer(player, move, yaw, 1 / 60);
    settlePlayer(player, land, t);
    updateAvatar(player, 1 / 60);
  }
}

test("there are four avatars, each with its own footprint", () => {
  assert.deepEqual(AVATAR_IDS, ["ball", "cat", "dog", "hedgehog"]);
  for (const id of AVATAR_IDS) {
    const player = createPlayer(10, 10);
    chooseAvatar(player, id);
    assert.equal(player.avatar.id, id);
    assert.equal(player.radius, AVATAR_SPECS[id].radius);
  }
});

test("animals turn to face the way they walk", () => {
  const player = createPlayer(10, 10);
  chooseAvatar(player, "cat");
  walk(player, { ahead: 0, strafe: 1 }, 1); // camera yaw 0: strafing right heads toward -x
  const facing = [Math.sin(player.avatar.heading), Math.cos(player.avatar.heading)];
  assert.ok(facing[0] < -0.99, `facing ${facing.map((v) => v.toFixed(2))}`);
});

test("the gait advances with distance walked and stops when standing", () => {
  const player = createPlayer(10, 10);
  chooseAvatar(player, "dog");
  walk(player, { ahead: 1, strafe: 0 }, 1);
  const phase = player.avatar.phase;
  assert.ok(phase > 20, `phase ${phase.toFixed(1)} after a second of running`);
  assert.ok(player.avatar.speed > 5);
  walk(player, { ahead: 0, strafe: 0 }, 1);
  assert.equal(player.avatar.phase, phase, "legs rest when idle");
  assert.ok(player.avatar.speed < 0.1);
});

test("everyone stands on land and floats at sea", () => {
  for (const id of AVATAR_IDS) {
    const player = createPlayer(10, 10);
    chooseAvatar(player, id);
    settlePlayer(player, land, 0);
    assert.equal(player.floating, false, id);
    assert.equal(player.y, 2, id);
    settlePlayer(player, sea, 3);
    assert.equal(player.floating, true, id);
    assert.ok(Math.abs(player.y - (waveHeight(10, 10, 3) - AVATAR_SPECS[id].floatDepth)) < 1e-9, id);
  }
});

test("floating animals keep paddling even while holding still", () => {
  const player = createPlayer(10, 10);
  chooseAvatar(player, "hedgehog");
  settlePlayer(player, sea, 0);
  const before = player.avatar.phase;
  player.prevX = player.x;
  player.prevZ = player.z;
  updateAvatar(player, 0.5);
  assert.ok(player.avatar.phase > before);
});
