// Turns a height field into a mesh, coloured by the world's climate.

import { SEA_LEVEL } from "./world/heightmap.js";
import { valueNoise } from "./world/noise.js";

// field: from createHeightField(); climate: an entry of CLIMATES.
export function buildTerrainGeometry(field, climate) {
  const n = field.verticesPerSide;
  const { cell, maxHeight, grid: h } = field;
  const c = climate.ground;

  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = (row * n + col) * 3;
      const y = h(col, row);
      positions.set([col * cell, y, row * cell], i);

      const nx = h(col - 1, row) - h(col + 1, row);
      const nz = h(col, row - 1) - h(col, row + 1);
      const ny = 2 * cell;
      const len = Math.hypot(nx, ny, nz);
      normals.set([nx / len, ny / len, nz / len], i);

      const steepness = 1 - ny / len;
      let color = mix(c.grass, c.meadow, smoothstep(0.35, 0.8, y / maxHeight));
      color = mix(color, c.rock, smoothstep(0.25, 0.45, steepness));
      if (climate.snowLine !== null) {
        // A ragged snow line that does not stick to steep rock.
        const line = climate.snowLine + (valueNoise(col * 0.15, row * 0.15, 77) - 0.5) * 1.2;
        const snow = smoothstep(line - 0.3, line + 0.3, y) * (1 - smoothstep(0.4, 0.6, steepness));
        color = mix(color, climate.snow, snow);
      }
      // Beach sand near the waterline, darker and wet below it, then seabed.
      color = mix(c.sand, color, smoothstep(SEA_LEVEL + 0.55, SEA_LEVEL + 0.9, y));
      color = mix(c.wetSand, color, smoothstep(SEA_LEVEL - 0.15, SEA_LEVEL + 0.1, y));
      color = mix(c.seabed, color, smoothstep(SEA_LEVEL - 2.2, SEA_LEVEL - 0.8, y));
      colors.set(color, i);
    }
  }

  const cells = n - 1;
  const indices = new Uint32Array(cells * cells * 6);
  let k = 0;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const a = row * n + col, b = a + 1, d = a + n, e = d + 1;
      indices.set([a, d, b, b, d, e], k);
      k += 6;
    }
  }
  return { positions, normals, colors, indices };
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(lo, hi, v) {
  const t = Math.min(Math.max((v - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
}
