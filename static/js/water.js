// The sea: a wavy, partly transparent surface over the map plus a flat skirt
// reaching to the horizon. Clearer in the shallows, darker in deep water.

import { createProgram } from "./gl.js";
import { SKY_GLSL, SKY_UNIFORMS, setSkyUniforms } from "./skycolor.js";
import { SEA_LEVEL, WAVES_GLSL } from "./waves.js";
import { smoothstep01 } from "./world/noise.js";

const HORIZON = 20000; // how far the skirt reaches past the map: far enough to meet the horizon, even from above
const DEEP = 10;     // "depth" given to the skirt, beyond the modelled seabed

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aWater; // x: depth to the seabed, y: how much the vertex follows the waves
uniform mat4 uViewProj;
uniform float uTime;
${WAVES_GLSL}
out vec3 vWorld;
out float vDepth;
void main() {
  vec3 p = aPosition;
  p.y = mix(SEA_LEVEL, waveHeight(p.xz, uTime), aWater.y);
  vWorld = p;
  vDepth = aWater.x;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vWorld;
in float vDepth;
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbientSky;
uniform vec2 uFogRange;
${SKY_GLSL}
${WAVES_GLSL}
out vec4 outColor;
void main() {
  // Wave normal plus a finer ripple so the surface sparkles.
  vec3 n = waveNormal(vWorld.xz, uTime);
  vec2 q = vWorld.xz * 3.1;
  n = normalize(n + 0.06 * vec3(sin(q.x + uTime * 2.1) * cos(q.y * 0.7 - uTime * 1.7), 0.0,
                                cos(q.y + uTime * 1.9) * sin(q.x * 0.8 + uTime * 1.3)));

  vec3 toEye = normalize(uCameraPos - vWorld);
  float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(n, toEye), 0.0), 5.0);
  vec3 reflection = skyColor(reflect(-toEye, n));

  float deep = smoothstep(0.3, 4.0, vDepth);
  vec3 body = mix(vec3(0.1, 0.52, 0.55), vec3(0.03, 0.2, 0.33), deep);
  body *= uAmbientSky * 1.3 + uLightColor * max(uLightDir.y, 0.0) * 0.7;
  vec3 color = mix(body, reflection, fresnel);

  // Sun or moon glint.
  float glint = pow(max(dot(reflect(-uLightDir, n), toEye), 0.0), 180.0);
  color += uLightColor * glint * 1.6;

  // Foam where the water meets the beach.
  float foam = (1.0 - smoothstep(0.02, 0.35, vDepth)) * (0.65 + 0.35 * sin(uTime * 1.8 + vWorld.x * 0.7 + vWorld.z * 0.5));
  color = mix(color, vec3(0.93, 0.96, 0.97) * (uAmbientSky + uLightColor * 0.6), clamp(foam, 0.0, 1.0) * 0.7);

  float alpha = mix(0.4, 0.88, deep) + fresnel * 0.4 + glint;
  alpha = mix(alpha, 1.0, smoothstep(4.0, 9.0, vDepth)); // open sea: nothing shows through
  vec3 view = vWorld - uCameraPos;
  vec3 fogColor = skyColor(normalize(vec3(view.x, 0.03 * length(view.xz), view.z)));
  float fog = smoothstep(uFogRange.x, uFogRange.y, length(view));
  outColor = vec4(mix(color, fogColor, fog), mix(clamp(alpha, 0.0, 1.0), 1.0, fog));
}`;

export function createWater(gl, terrain) {
  const { program, uniforms } = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, [
    "uViewProj", "uTime", "uCameraPos", "uLightDir", "uLightColor", "uAmbientSky", "uFogRange", ...SKY_UNIFORMS,
  ]);

  // Wavy grid over the map, 1 unit per cell; skip cells well inside the island.
  const size = terrain.size;
  const n = Math.round(size) + 1;
  const step = size / (n - 1);
  const positions = [], water = [], indices = [];
  const index = new Int32Array(n * n).fill(-1);
  const vertex = (col, row) => {
    const k = row * n + col;
    if (index[k] < 0) {
      const x = col * step, z = row * step;
      const edge = Math.min(col, row, n - 1 - col, n - 1 - row);
      index[k] = positions.length / 3;
      positions.push(x, SEA_LEVEL, z);
      // Waves fade out at the map edge so the grid meets the flat skirt without a gap. The open
      // sea darkens to the skirt's depth in a ring toward the edge, so the map's square never shows.
      const depth = Math.max(SEA_LEVEL - terrain.heightAt(x, z), 0);
      const offshore = smoothstep01((Math.hypot(x - size / 2, z - size / 2) / size - 0.38) / 0.12);
      const open = smoothstep01((depth - 1.5) / 1.3);
      water.push(depth + (DEEP - depth) * offshore * open, Math.min(edge / 4, 1));
    }
    return index[k];
  };
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const corners = [[col, row], [col + 1, row], [col, row + 1], [col + 1, row + 1]];
      if (corners.every(([c, r]) => terrain.heightAt(c * step, r * step) > SEA_LEVEL + 0.8)) continue;
      const [a, b, c, d] = corners.map(([cc, rr]) => vertex(cc, rr));
      indices.push(a, c, b, b, c, d);
    }
  }
  // Flat skirt: four quads around the map out to the horizon.
  const ring = [[0, 0], [size, 0], [size, size], [0, size]];
  const far = [[-HORIZON, -HORIZON], [size + HORIZON, -HORIZON], [size + HORIZON, size + HORIZON], [-HORIZON, size + HORIZON]];
  const base = positions.length / 3;
  for (const [x, z] of [...ring, ...far]) {
    positions.push(x, SEA_LEVEL, z);
    water.push(DEEP, 0);
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    indices.push(base + i, base + j, base + 4 + j, base + i, base + 4 + j, base + 4 + i); // counter-clockwise from above
  }

  const vao = gl.createVertexArray();
  const buffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers[0]);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers[1]);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(water), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers[2]);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const count = indices.length;

  return {
    // Draw after all opaque geometry: it blends over what is below the surface.
    draw(viewProj, env, eye, time, fogRange) {
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uViewProj, false, viewProj);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform3fv(uniforms.uCameraPos, eye);
      gl.uniform3fv(uniforms.uLightDir, env.lightDir);
      gl.uniform3fv(uniforms.uLightColor, env.lightColor);
      gl.uniform3fv(uniforms.uAmbientSky, env.ambientSky);
      gl.uniform2fv(uniforms.uFogRange, fogRange);
      setSkyUniforms(gl, uniforms, env);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    },

    dispose() {
      gl.deleteVertexArray(vao);
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
