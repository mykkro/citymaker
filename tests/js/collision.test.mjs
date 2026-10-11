import assert from "node:assert/strict";
import { test } from "node:test";

import { clampToBounds, resolveCollisions } from "../../static/js/collision.js";

const body = (x, z, radius = 0.5, mass = 1) => ({ x, z, radius, mass });
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;

test("separated bodies are left alone", () => {
  const a = body(0, 0), b = body(2, 0);
  resolveCollisions([a, b]);
  assert.deepEqual([a.x, b.x], [0, 2]);
});

test("overlapping equal bodies are pushed apart symmetrically", () => {
  const a = body(0, 0), b = body(0.6, 0);
  resolveCollisions([a, b]);
  assert.ok(Math.abs(gap(a, b)) < 1e-9);
  assert.ok(Math.abs(a.x + b.x - 0.6) < 1e-9, "midpoint is preserved");
});

test("heavier body moves less", () => {
  const heavy = body(0, 0, 0.5, 4), light = body(0.5, 0, 0.3, 1);
  resolveCollisions([heavy, light]);
  assert.ok(Math.abs(gap(heavy, light)) < 1e-9);
  assert.ok(Math.abs(heavy.x) < Math.abs(light.x - 0.5));
});

test("coincident bodies still separate", () => {
  const a = body(1, 1), b = body(1, 1);
  resolveCollisions([a, b]);
  assert.ok(gap(a, b) > -1e-9);
});

test("a pile-up spreads out within a fraction of a second of frames", () => {
  const crowd = Array.from({ length: 8 }, (_, i) => body(5 + i * 0.05, 5, 0.3));
  for (let frame = 0; frame < 20; frame++) resolveCollisions(crowd);
  for (let i = 0; i < crowd.length; i++) {
    for (let j = i + 1; j < crowd.length; j++) assert.ok(gap(crowd[i], crowd[j]) > -0.01);
  }
});

test("obstacles push bodies out and never move", () => {
  const b = body(1.2, 0, 0.5), rock = { x: 0, z: 0, radius: 1 };
  resolveCollisions([b], [rock]);
  assert.deepEqual([rock.x, rock.z], [0, 0]);
  assert.ok(Math.abs(gap(b, rock)) < 1e-9);
});

test("clampToBounds keeps the whole circle inside the map", () => {
  const b = body(-3, 99, 0.5);
  clampToBounds(b, 64);
  assert.deepEqual([b.x, b.z], [0.5, 63.5]);
});
