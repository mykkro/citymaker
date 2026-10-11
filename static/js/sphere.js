// UV sphere with beach-ball colored segments, so rolling is visible.

export function createSphereGeometry(radius, colorA, colorB, rings = 16, slices = 24, stripes = 6) {
  const count = (rings + 1) * (slices + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i <= rings; i++) {
    const theta = (i / rings) * Math.PI;
    for (let j = 0; j <= slices; j++) {
      const phi = (j / slices) * Math.PI * 2;
      const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      const v = (i * (slices + 1) + j) * 3;
      normals.set(n, v);
      positions.set([n[0] * radius, n[1] * radius, n[2] * radius], v);
      const stripe = Math.floor(((j % slices) / slices) * stripes);
      colors.set(stripe % 2 === 0 ? colorA : colorB, v);
    }
  }

  const indices = new Uint32Array(rings * slices * 6);
  let k = 0;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j, b = a + 1, c = a + slices + 1, d = c + 1;
      indices.set([a, b, c, b, d, c], k);
      k += 6;
    }
  }

  return { positions, normals, colors, indices };
}
