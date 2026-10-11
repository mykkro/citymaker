// Sky gradient shared by the sky dome and the fog of lit objects, so distant
// terrain always fades into the sky color behind it.

export const SKY_UNIFORMS = ["uSunDir", "uDay", "uTwilight"];

export const SKY_GLSL = `
uniform vec3 uSunDir;
uniform float uDay;       // 0 = night, 1 = day
uniform float uTwilight;  // strength of the sunrise/sunset glow

vec3 skyColor(vec3 dir) {
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 zenith = mix(vec3(0.01, 0.015, 0.05), vec3(0.24, 0.48, 0.86), uDay);
  vec3 horizon = mix(vec3(0.045, 0.06, 0.12), vec3(0.7, 0.81, 0.94), uDay);
  vec3 color = mix(horizon, zenith, sqrt(up));
  // Below the horizon (seen past the map edge) darkens a little.
  color *= mix(1.0, 0.7, clamp(-dir.y * 4.0, 0.0, 1.0));
  // Warm glow around the sun while it is low.
  vec3 across = normalize(vec3(dir.x, 0.0, dir.z) + 1e-5);
  vec3 sunAcross = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5);
  float toward = pow(max(dot(across, sunAcross), 0.0), 4.0);
  float nearHorizon = 1.0 - smoothstep(0.0, 0.5, up);
  color = mix(color, vec3(1.0, 0.48, 0.22), uTwilight * toward * nearHorizon * 0.75);
  return color;
}
`;

export function setSkyUniforms(gl, uniforms, env) {
  gl.uniform3fv(uniforms.uSunDir, env.sunDir);
  gl.uniform1f(uniforms.uDay, env.day);
  gl.uniform1f(uniforms.uTwilight, env.twilight);
}
