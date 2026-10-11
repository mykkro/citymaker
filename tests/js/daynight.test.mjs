import assert from "node:assert/strict";
import { test } from "node:test";

import { environmentAt, formatClock, sunDirection } from "../../static/js/daynight.js";
import * as mat4 from "../../static/js/mat4.js";

const brightness = (c) => c[0] + c[1] + c[2];

test("sun rises east, peaks at noon, sets west, is down at midnight", () => {
  assert.ok(Math.abs(sunDirection(6)[1]) < 1e-9 && sunDirection(6)[0] > 0.99);
  assert.ok(sunDirection(12)[1] > 0.8);
  assert.ok(Math.abs(sunDirection(18)[1]) < 1e-9 && sunDirection(18)[0] < -0.99);
  assert.ok(sunDirection(0)[1] < -0.8);
});

test("noon is lit by the sun, midnight by the dimmer moon", () => {
  const noon = environmentAt(12), midnight = environmentAt(0);
  assert.deepEqual(noon.lightDir, noon.sunDir);
  assert.deepEqual(midnight.lightDir, midnight.moonDir);
  assert.ok(brightness(noon.lightColor) > 2.5);
  assert.ok(brightness(midnight.lightColor) > 0.3, "moonlight is enough to play by");
  assert.ok(brightness(midnight.lightColor) < 0.5 * brightness(noon.lightColor), "moon is clearly dimmer");
  assert.ok(brightness(noon.ambientSky) > 3 * brightness(midnight.ambientSky));
  assert.ok(noon.day > 0.99 && midnight.day < 0.01);
});

test("lighting changes smoothly through the whole day (no pops at dawn or dusk)", () => {
  let prev = environmentAt(0);
  for (let h = 0.01; h <= 24; h += 0.01) {
    const env = environmentAt(h);
    for (const key of ["lightColor", "ambientSky", "ambientGround"]) {
      const jump = Math.max(...env[key].map((v, i) => Math.abs(v - prev[key][i])));
      assert.ok(jump < 0.03, `${key} jumped by ${jump.toFixed(3)} at ${h.toFixed(2)}h`);
    }
    assert.ok(Math.abs(env.shadowStrength - prev.shadowStrength) < 0.03, `shadow jump at ${h.toFixed(2)}h`);
    prev = env;
  }
});

test("no shadows when the light sits on the horizon", () => {
  assert.equal(environmentAt(6).shadowStrength, 0);
  assert.equal(environmentAt(18).shadowStrength, 0);
});

test("formatClock wraps and pads", () => {
  assert.equal(formatClock(8.5), "08:30");
  assert.equal(formatClock(24.25), "00:15");
  assert.equal(formatClock(23.999), "23:59");
});

test("mat4.invert undoes a transform", () => {
  const m = mat4.multiply(mat4.perspective(1, 1.5, 0.1, 100), mat4.lookAt([3, 4, 5], [0, 1, 0], [0, 1, 0]));
  const id = mat4.multiply(m, mat4.invert(m));
  id.forEach((v, i) => assert.ok(Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-4, `element ${i} = ${v}`));
});

test("mat4.ortho maps its box to clip space", () => {
  const m = mat4.ortho(-2, 2, -1, 1, 1, 11);
  const p = mat4.transformPoint(m, [2, 1, -11]);
  p.forEach((v) => assert.ok(Math.abs(v - 1) < 1e-6));
});
