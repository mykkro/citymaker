// Height queries over a terrain grid: { tiles, tileSize, segments, heights }, where
// heights is row-major along z with (tiles * segments + 1) ** 2 values.

export function createHeightField(terrain) {
  const { tiles, tileSize, segments, heights } = terrain;
  const n = tiles * segments + 1;
  if (heights.length !== n * n) throw new Error(`expected ${n * n} heights, got ${heights.length}`);
  const cells = n - 1;
  const cell = tileSize / segments;
  let maxHeight = -Infinity;
  for (const h of heights) maxHeight = Math.max(maxHeight, h);

  const grid = (col, row) => {
    col = Math.min(Math.max(col, 0), cells);
    row = Math.min(Math.max(row, 0), cells);
    return heights[row * n + col];
  };

  // Bilinear interpolation of the heightmap at world position (x, z).
  function heightAt(x, z) {
    const gx = Math.min(Math.max(x / cell, 0), cells);
    const gz = Math.min(Math.max(z / cell, 0), cells);
    const col = Math.min(Math.floor(gx), cells - 1);
    const row = Math.min(Math.floor(gz), cells - 1);
    const fx = gx - col, fz = gz - row;
    const near = grid(col, row) + (grid(col + 1, row) - grid(col, row)) * fx;
    const far = grid(col, row + 1) + (grid(col + 1, row + 1) - grid(col, row + 1)) * fx;
    return near + (far - near) * fz;
  }

  // Steepness as rise over run (0 is flat, 1 is 45 degrees).
  function slopeAt(x, z) {
    const gx = (heightAt(x + cell, z) - heightAt(x - cell, z)) / (2 * cell);
    const gz = (heightAt(x, z + cell) - heightAt(x, z - cell)) / (2 * cell);
    return Math.hypot(gx, gz);
  }

  return {
    tiles, tileSize, segments, heights,
    verticesPerSide: n,
    cell,
    size: tiles * tileSize,
    maxHeight: Math.max(maxHeight, 1e-6),
    grid,
    heightAt,
    slopeAt,
  };
}
