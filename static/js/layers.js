// The world as separate geometry layers, for exporting (GLB). Each layer is built with
// the renderer's own functions; no WebGL needed.

import { buildBuildings } from "./buildings/models.js";
import * as mat4 from "./mat4.js";
import { createRandom } from "./random.js";
import { merge, transform } from "./shapes.js";
import { buildScenery } from "./scenery.js";
import { buildTerrainGeometry } from "./terrain.js";
import { CLIMATES } from "./world/climates.js";
import { SEA_LEVEL } from "./world/heightmap.js";

const WATER = [0.12, 0.45, 0.55];
const ROAD_LIFT = 0.03; // the roads layer floats this far above the island

// [{ name, geometry, material? }] in the order: island, water, roads, buildings, boats, plants.
// pavingImage: the painted paving as PNG bytes (see pavingpaint.js); without it there is no roads layer.
export function worldLayers(world, { pavingImage = null } = {}) {
  const { field, props } = world;
  const climate = CLIMATES[world.options.climate];
  const random = createRandom(world.options.seed);
  const layers = [
    { name: "island", geometry: buildTerrainGeometry(field, climate) },
    { name: "water", geometry: waterPlane(field.size), material: { color: [1, 1, 1, 0.75], doubleSided: true } },
  ];
  if (pavingImage) {
    const geometry = pavedGround(world);
    if (geometry.indices.length) layers.push({ name: "roads", geometry, material: { image: pavingImage, blend: true } });
  }
  // Buildings, fences and walls, with each windmill's sails at rest.
  const buildings = buildBuildings(world.settlement, field, world.options.climate, createRandom(world.options.seed));
  if (buildings.geometry.indices.length) {
    const sails = buildings.mills.map(({ x, y, z, yaw }) =>
      transform(buildings.sails, mat4.multiply(mat4.translation(x, y, z), mat4.rotationAxis([0, 1, 0], yaw))));
    layers.push({ name: "buildings", geometry: merge(buildings.geometry, ...sails) });
  }
  // Boats, at rest on a calm sea (or on the beach).
  if (buildings.boats.length) {
    const boats = buildings.boats.map((b) => transform(buildings.boatGeometries[b.kind], mat4.multiply(
      mat4.translation(b.x, b.beached ? field.heightAt(b.x, b.z) + 0.25 : -0.05, b.z), mat4.rotationAxis([0, 1, 0], b.angle))));
    layers.push({ name: "boats", geometry: merge(...boats) });
  }
  layers.push({ name: "plants", geometry: buildScenery(props, field, climate, random).geometry });
  return layers;
}

// The terrain cells that paving touches (from the site plan), lifted a little, with
// texture coordinates spanning the whole map so the painted paving image fits.
export function pavedGround({ field, sitePlan }) {
  const n = field.verticesPerSide, cell = field.cell;
  const covered = (col, row) => sitePlan.distance[row * n + col] <= cell * 1.5;
  const index = new Int32Array(n * n).fill(-1);
  const positions = [], normals = [], colors = [], uvs = [], indices = [];
  const vertex = (col, row) => {
    const k = row * n + col;
    if (index[k] < 0) {
      index[k] = positions.length / 3;
      const nx = field.grid(col - 1, row) - field.grid(col + 1, row);
      const nz = field.grid(col, row - 1) - field.grid(col, row + 1);
      const len = Math.hypot(nx, 2 * cell, nz);
      positions.push(col * cell, field.grid(col, row) + ROAD_LIFT, row * cell);
      normals.push(nx / len, (2 * cell) / len, nz / len);
      colors.push(1, 1, 1);
      uvs.push(col / (n - 1), row / (n - 1));
    }
    return index[k];
  };
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      if (!(covered(col, row) || covered(col + 1, row) || covered(col, row + 1) || covered(col + 1, row + 1))) continue;
      const a = vertex(col, row), b = vertex(col + 1, row), d = vertex(col, row + 1), e = vertex(col + 1, row + 1);
      indices.push(a, d, b, b, d, e); // same winding as the terrain: facing up
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

// A flat sea over the whole map.
function waterPlane(size) {
  const corners = [[0, 0], [size, 0], [size, size], [0, size]];
  return {
    positions: Float32Array.from(corners.flatMap(([x, z]) => [x, SEA_LEVEL, z])),
    normals: Float32Array.from(corners.flatMap(() => [0, 1, 0])),
    colors: Float32Array.from(corners.flatMap(() => WATER)),
    indices: Uint32Array.from([0, 3, 1, 1, 3, 2]), // counter-clockwise seen from above
  };
}
