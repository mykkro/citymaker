import assert from "node:assert/strict";
import { test } from "node:test";

import { combineMove, stickVector } from "../../static/js/input.js";

const close = (a, b) => Math.abs(a - b) < 1e-9;

test("stick: inside the dead zone reads zero", () => {
  assert.deepEqual(stickVector(5, -5, 56), { x: 0, y: 0 });
  assert.deepEqual(stickVector(0, 0, 56), { x: 0, y: 0 });
});

test("stick: pushing up means forward, full deflection is length 1", () => {
  const v = stickVector(0, -56, 56);
  assert.ok(close(v.x, 0) && close(v.y, 1));
  const beyond = stickVector(200, 0, 56);
  assert.ok(close(beyond.x, 1) && close(beyond.y, 0));
});

test("stick: response ramps smoothly from the dead zone edge", () => {
  const half = stickVector(28, 0, 56).x;
  assert.ok(half > 0.3 && half < 0.5, `half deflection gives ${half}`);
});

test("move: keyboard diagonals are normalised", () => {
  const m = combineMove({ strafe: 1, ahead: 1 }, { x: 0, y: 0 });
  assert.ok(close(Math.hypot(m.strafe, m.ahead), 1));
});

test("move: analog stick passes through, keyboard overrides it", () => {
  assert.deepEqual(combineMove({ strafe: 0, ahead: 0 }, { x: 0.2, y: 0.4 }), { strafe: 0.2, ahead: 0.4 });
  assert.deepEqual(combineMove({ strafe: 0, ahead: -1 }, { x: 0.2, y: 0.4 }), { strafe: 0, ahead: -1 });
});
