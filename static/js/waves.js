// Gentle sea waves: the same sum of sines in JavaScript (for floating objects)
// and GLSL (for the water surface), so what floats matches what you see.

export const SEA_LEVEL = 0; // mirrors SEA_LEVEL in world/heightmap.js

// [direction x, direction z, spatial frequency, speed, amplitude]
const WAVES = [
  [0.8, 0.6, 0.55, 1.1, 0.07],
  [-0.4, 0.92, 0.9, 1.5, 0.045],
  [0.97, -0.24, 1.7, 2.3, 0.025],
];

export function waveHeight(x, z, time) {
  let h = SEA_LEVEL;
  for (const [dx, dz, freq, speed, amp] of WAVES) h += amp * Math.sin((dx * x + dz * z) * freq + time * speed);
  return h;
}

const glslWaves = WAVES.map(([dx, dz, f, s, a]) => `  w(vec2(${dx}, ${dz}), ${f}, ${s}, ${a});`).join("\n");

// Defines waveHeight(p, t) and waveNormal(p, t) for p = world xz.
export const WAVES_GLSL = `
const float SEA_LEVEL = ${SEA_LEVEL.toFixed(1)};
float waveHeight(vec2 p, float t) {
  float h = SEA_LEVEL;
  #define w(d, f, s, a) h += a * sin(dot(d, p) * f + t * s)
${glslWaves}
  #undef w
  return h;
}
vec3 waveNormal(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  #define w(d, f, s, a) slope += a * f * cos(dot(d, p) * f + t * s) * d
${glslWaves}
  #undef w
  return normalize(vec3(-slope.x, 1.0, -slope.y));
}
`;
