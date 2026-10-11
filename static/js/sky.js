// Full-screen sky: gradient, sun, moon and stars.

import { skyRotation } from "./daynight.js";
import { createProgram } from "./gl.js";
import * as mat4 from "./mat4.js";
import { SKY_GLSL, SKY_UNIFORMS, setSkyUniforms } from "./skycolor.js";

// One oversized triangle covering the screen, generated from gl_VertexID.
const VERTEX_SHADER = `#version 300 es
out vec2 vNdc;
void main() {
  vNdc = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform mat4 uInvViewProj;
uniform mat4 uStarRotation;  // turns the star field with the time of day
uniform vec3 uMoonDir;
uniform float uTime;
${SKY_GLSL}
out vec4 outColor;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 stars(vec3 dir) {
  vec3 p = mat3(uStarRotation) * dir * 160.0;
  vec3 cell = floor(p);
  float h = hash(cell);
  if (h < 0.955) return vec3(0.0);
  vec3 offset = vec3(hash(cell + 1.7), hash(cell + 3.1), hash(cell + 5.3)) - 0.5;
  float d = length(fract(p) - 0.5 - offset * 0.5);
  float size = 0.12 + 0.14 * hash(cell + 9.1);
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + 4.0 * h) + h * 300.0);
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash(cell + 4.4));
  return tint * smoothstep(size, size * 0.3, d) * twinkle * (0.6 + 0.8 * hash(cell + 7.7));
}

vec3 moonSurface(vec2 uv) {
  float shade = 0.95;
  shade -= 0.14 * smoothstep(0.34, 0.28, length(uv - vec2(-0.28, 0.22)));
  shade -= 0.1 * smoothstep(0.24, 0.19, length(uv - vec2(0.33, -0.08)));
  shade -= 0.09 * smoothstep(0.17, 0.13, length(uv - vec2(0.02, -0.45)));
  shade -= 0.06 * smoothstep(0.12, 0.09, length(uv - vec2(0.2, 0.45)));
  return vec3(0.96, 0.95, 0.88) * shade;
}

void main() {
  vec4 nearPoint = uInvViewProj * vec4(vNdc, -1.0, 1.0);
  vec4 farPoint = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize(farPoint.xyz / farPoint.w - nearPoint.xyz / nearPoint.w);

  vec3 color = skyColor(dir);
  float night = 1.0 - uDay;
  float aboveHorizon = smoothstep(-0.02, 0.08, dir.y);
  color += stars(dir) * night * night * aboveHorizon;

  // Moon: a cratered disk with a soft halo, faint by day.
  const float MOON_RADIUS = 0.035;
  vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + 1e-5);
  vec3 up = cross(right, uMoonDir);
  vec2 uv = vec2(dot(dir, right), dot(dir, up)) / MOON_RADIUS;
  float facing = step(0.0, dot(dir, uMoonDir));
  float disk = smoothstep(1.0, 0.93, length(uv)) * facing * aboveHorizon;
  color = mix(color, moonSurface(uv), disk * mix(0.35, 1.0, night));
  float moonGlow = pow(max(dot(dir, uMoonDir), 0.0), 300.0);
  color += vec3(0.55, 0.65, 0.9) * moonGlow * 0.3 * night * aboveHorizon;

  // Sun: bright disk plus a wide warm glow.
  float sunAlign = max(dot(dir, uSunDir), 0.0);
  float sunDisk = smoothstep(0.99955, 0.99975, sunAlign) * aboveHorizon;
  color += vec3(1.0, 0.8, 0.55) * (pow(sunAlign, 250.0) * 0.6 + pow(sunAlign, 10.0) * 0.12) * aboveHorizon;
  color = mix(color, vec3(1.0, 0.97, 0.88), sunDisk);

  outColor = vec4(color, 1.0);
}`;

export function createSky(gl) {
  const { program, uniforms } = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, [
    "uInvViewProj", "uStarRotation", "uMoonDir", "uTime", ...SKY_UNIFORMS,
  ]);
  const vao = gl.createVertexArray(); // no attributes: positions come from gl_VertexID

  return {
    draw(viewProj, env, time) {
      const { axis, angle } = skyRotation(env.hour);
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uInvViewProj, false, mat4.invert(viewProj));
      gl.uniformMatrix4fv(uniforms.uStarRotation, false, mat4.rotationAxis(axis, -angle));
      gl.uniform3fv(uniforms.uMoonDir, env.moonDir);
      gl.uniform1f(uniforms.uTime, time);
      setSkyUniforms(gl, uniforms, env);

      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
    },
  };
}
