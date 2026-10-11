// Day/night cycle: sun and moon positions and the lighting they produce.
// Pure math, no WebGL, so it can be unit tested.

export const DAY_SECONDS = 300;   // real seconds per in-game day
const ORBIT_TILT = 0.5;           // tilts the sun's path toward +z (south) instead of straight overhead

// Sun direction for an hour of the day: rises at +x (06:00), highest at noon, sets at -x (18:00).
export function sunDirection(hour) {
  const a = ((hour - 6) / 24) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a) * Math.cos(ORBIT_TILT), Math.sin(a) * Math.sin(ORBIT_TILT)];
}

// Axis the sky (sun, moon, stars) turns around, and the current turn angle.
export function skyRotation(hour) {
  return { axis: [0, -Math.sin(ORBIT_TILT), Math.cos(ORBIT_TILT)], angle: ((hour - 6) / 24) * Math.PI * 2 };
}

export function environmentAt(hour) {
  const sunDir = sunDirection(hour);
  const moonDir = sunDir.map((v) => -v);
  const sunHeight = sunDir[1];

  // Both lights fade to zero at the horizon, so switching between them never pops.
  const sunUp = smoothstep(0, 0.12, sunHeight);
  const moonUp = smoothstep(0, 0.12, -sunHeight);
  const day = smoothstep(-0.18, 0.2, sunHeight);
  const twilight = 1 - smoothstep(0, 0.3, Math.abs(sunHeight + 0.03));

  const sunColor = scale(mix([1.0, 0.55, 0.3], [1.0, 0.95, 0.86], smoothstep(0, 0.35, sunHeight)), sunUp);
  const moonColor = scale([0.55, 0.65, 0.95], 0.55 * moonUp);
  const bySun = sunHeight >= 0;
  const lightDir = bySun ? sunDir : moonDir;

  return {
    hour,
    sunDir,
    moonDir,
    lightDir,
    lightColor: bySun ? sunColor : moonColor,
    // Ambient light from the sky above and bounced off the ground below.
    ambientSky: mix([0.09, 0.11, 0.2], [0.4, 0.46, 0.56], day),
    ambientGround: mix([0.04, 0.045, 0.07], [0.26, 0.25, 0.2], day),
    day,
    twilight,
    // Low lights make long, glitchy shadows, so fade them out near the horizon.
    shadowStrength: smoothstep(0.03, 0.2, lightDir[1]) * (bySun ? 1 : 0.75),
  };
}

export function formatClock(hour) {
  const minutes = Math.floor((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function smoothstep(lo, hi, v) {
  const t = Math.min(Math.max((v - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function scale(v, s) {
  return v.map((c) => c * s);
}
