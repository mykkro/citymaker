// Binary glTF (.glb) export: one node per layer (island, water, roads, plants, ...),
// each a mesh with positions, normals and vertex colours.

// layers: [{ name, geometry: { positions, normals, colors, indices, uvs? }, material? }]
// material: { color: [r, g, b, a], doubleSided, image (PNG bytes, needs uvs), blend }
// (vertex colours, and the image if any, are multiplied by color).
// Returns an ArrayBuffer.
export function buildGlb(layers) {
  const chunks = [];   // binary pieces, each starting 4-byte aligned
  let byteLength = 0;
  const bufferViews = [], accessors = [], meshes = [], nodes = [], materials = [];
  const images = [], textures = [];

  const addView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLength += bytes.byteLength;
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    return bufferViews.length - 1;
  };
  const addAccessor = (typed, type, componentType, target, extra = {}) => {
    const count = typed.length / ({ VEC3: 3, VEC2: 2 }[type] ?? 1);
    accessors.push({ bufferView: addView(typed, target), componentType, count, type, ...extra });
    return accessors.length - 1;
  };

  for (const { name, geometry, material = {} } of layers) {
    if (!geometry.indices.length) continue;
    const { positions, normals, colors, indices } = geometry;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], positions[i + k]);
        max[k] = Math.max(max[k], positions[i + k]);
      }
    }
    // glTF vertex colours are linear; ours are display (sRGB) values.
    const linear = Float32Array.from(colors, (c) => Math.min(Math.max(c, 0), 1) ** 2.2);
    const color = material.color ?? [1, 1, 1, 1];
    const pbr = { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 1 };
    if (material.image) {
      images.push({ bufferView: addView(material.image), mimeType: "image/png" });
      textures.push({ source: images.length - 1, sampler: 0 });
      pbr.baseColorTexture = { index: textures.length - 1 };
    }
    materials.push({
      name,
      pbrMetallicRoughness: pbr,
      doubleSided: material.doubleSided ?? false,
      ...(color[3] < 1 || material.blend ? { alphaMode: "BLEND" } : {}),
    });
    const attributes = {
      POSITION: addAccessor(Float32Array.from(positions), "VEC3", 5126, 34962, { min, max }),
      NORMAL: addAccessor(unitNormals(normals), "VEC3", 5126, 34962),
      COLOR_0: addAccessor(linear, "VEC3", 5126, 34962),
    };
    if (geometry.uvs) attributes.TEXCOORD_0 = addAccessor(Float32Array.from(geometry.uvs), "VEC2", 5126, 34962);
    meshes.push({
      name,
      primitives: [{
        attributes,
        indices: addAccessor(Uint32Array.from(indices), "SCALAR", 5125, 34963),
        material: materials.length - 1,
      }],
    });
    nodes.push({ name, mesh: meshes.length - 1 });
  }

  const json = {
    asset: { version: "2.0", generator: "CityMaker" },
    scene: 0,
    scenes: [{ name: "Island", nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength }],
  };
  if (textures.length) {
    // Smooth, mipmapped, clamped at the map's edge.
    Object.assign(json, { images, textures, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }] });
  }
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) jsonBytes = concat([jsonBytes, new Uint8Array(jsonPad).fill(0x20)]); // pad JSON with spaces

  const total = 12 + 8 + jsonBytes.length + 8 + byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  let offset = 20 + jsonBytes.length;
  view.setUint32(offset, byteLength, true);
  view.setUint32(offset + 4, 0x004e4942, true); // "BIN\0"
  offset += 8;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

// glTF requires unit normals; degenerate triangles (e.g. at the poles of flat-shaded
// ellipsoids) have none, so they get "up".
function unitNormals(normals) {
  const out = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > 1e-6) for (let k = 0; k < 3; k++) out[i + k] = normals[i + k] / len;
    else out[i + 1] = 1;
  }
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
