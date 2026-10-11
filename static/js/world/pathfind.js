// Least-cost routes over the terrain (A* on a coarse grid), for roads and paths.

import { SEA_LEVEL } from "./heightmap.js";

// A routing grid over the height field with `step` metres between nodes.
// Routes may not enter water and prefer gentle slopes and cells already used by roads.
export function createRouter(field, step = 2) {
  const n = Math.floor(field.size / step) + 1;
  const heights = new Float32Array(n * n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) heights[row * n + col] = field.heightAt(col * step, row * step);
  }
  const used = new Uint8Array(n * n); // 1 where a route already runs
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  const nodeAt = (x, z) => {
    const col = Math.min(Math.max(Math.round(x / step), 0), n - 1);
    const row = Math.min(Math.max(Math.round(z / step), 0), n - 1);
    return row * n + col;
  };

  // Route from (x0, z0) to (x1, z1) as a list of [x, z] points, or null if there is none.
  // slopeCost: how strongly gradients are avoided; maxSlope: steeper edges cost extra.
  // reuse: cost factor (< 1) on cells already used by routes.
  function route(x0, z0, x1, z1, { slopeCost = 40, maxSlope = 0.3, reuse = 0.4, minHeight = SEA_LEVEL + 0.7 } = {}) {
    const start = nodeAt(x0, z0), goal = nodeAt(x1, z1);
    if (heights[start] < minHeight || heights[goal] < minHeight) return null;
    const gx = goal % n, gz = Math.floor(goal / n);
    const cheapest = Math.min(reuse, 1);
    const cost = new Float32Array(n * n).fill(Infinity);
    const from = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    cost[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const node = heap.pop();
      if (node === goal) break;
      if (closed[node]) continue;
      closed[node] = 1;
      const col = node % n, row = Math.floor(node / n);
      for (const [dc, dr] of NEIGHBOURS) {
        const c = col + dc, r = row + dr;
        if (c < 0 || r < 0 || c >= n || r >= n) continue;
        const next = r * n + c;
        if (closed[next] || heights[next] < minHeight) continue;
        const length = Math.hypot(dc, dr) * step;
        const slope = Math.abs(heights[next] - heights[node]) / length;
        let edge = length * (1 + slopeCost * slope * slope) + (slope > maxSlope ? length * 30 : 0);
        if (used[next]) edge *= reuse;
        const total = cost[node] + edge;
        if (total < cost[next]) {
          cost[next] = total;
          from[next] = node;
          heap.push(next, total + Math.hypot(c - gx, r - gz) * step * cheapest);
        }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const nodes = [];
    for (let node = goal; node >= 0; node = from[node]) nodes.push(node);
    nodes.reverse();
    return nodes.map((node) => [(node % n) * step, Math.floor(node / n) * step]);
  }

  // Marks the cells along a polyline as used, so later routes join it.
  function markUsed(points) {
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (step / 2)) || 1;
      for (let k = 0; k <= steps; k++) used[nodeAt(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps)] = 1;
    }
  }

  return { route, markUsed };
}

// Binary heap of (item, priority) pairs, lowest priority first.
class MinHeap {
  constructor() {
    this.items = [];
    this.priorities = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, priority) {
    const { items, priorities } = this;
    let i = items.length;
    items.push(item);
    priorities.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (priorities[parent] <= priority) break;
      items[i] = items[parent];
      priorities[i] = priorities[parent];
      i = parent;
    }
    items[i] = item;
    priorities[i] = priority;
  }

  pop() {
    const { items, priorities } = this;
    const top = items[0];
    const lastItem = items.pop(), lastPriority = priorities.pop();
    if (items.length) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= items.length) break;
        if (child + 1 < items.length && priorities[child + 1] < priorities[child]) child++;
        if (priorities[child] >= lastPriority) break;
        items[i] = items[child];
        priorities[i] = priorities[child];
        i = child;
      }
      items[i] = lastItem;
      priorities[i] = lastPriority;
    }
    return top;
  }
}
