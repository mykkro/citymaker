// Deterministic value noise and fractal sums of it. Pure math, shared by the generators.

// Pseudo-random value in [0, 1] for a lattice point.
export function hash(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

export function smoothstep01(t) {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smoothstep01(x - ix), fz = smoothstep01(z - iz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  const near = a + (b - a) * fx;
  const far = c + (d - c) * fx;
  return near + (far - near) * fz;
}

// Fractal sum of value noise octaves, normalized to [0, 1].
export function fbm(x, z, seed, octaves = 4) {
  let total = 0, amplitude = 1, frequency = 1, norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 1013) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / norm;
}

// Like fbm, but with sharp crests where the noise crosses its midpoint: mountain ridges. In [0, 1].
export function ridged(x, z, seed, octaves = 4) {
  let total = 0, amplitude = 1, frequency = 1, norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const v = 1 - Math.abs(valueNoise(x * frequency, z * frequency, seed + octave * 7919) * 2 - 1);
    total += v * v * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / norm;
}
