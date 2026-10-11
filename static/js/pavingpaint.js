// Paints the settlement's paving into two map-wide images that the terrain shader
// overlays on the ground (browser only: it draws with canvas 2D):
//   color  rgb = paving colour with its wear and patterns, alpha = how much paving covers the ground
//   kinds  r = dirt, g = gravel, b = stone: which close-up detail to blend in (half resolution)
// Both map world (x, z) to image (x, y), `ppm` pixels per metre.

import { resample } from "./world/settlement.js";
import { squareDistance } from "./world/siteplan.js";

// Pixels per metre for a map of `size` metres: sharp, but at most `budget` pixels across.
export function pavingResolution(size, budget = 3072) {
  return Math.max(4, Math.min(16, Math.floor(budget / size)));
}

export function paintPaving(settlement, climate, size, ppm, random) {
  const pixels = Math.ceil(size * ppm);
  const color = makeCanvas(pixels);
  const kinds = makeCanvas(Math.ceil(pixels / 2));
  const c = color.getContext("2d");
  const k = kinds.getContext("2d");
  c.scale(ppm, ppm);
  k.scale(ppm / 2, ppm / 2);
  for (const ctx of [c, k]) ctx.lineJoin = "round";

  const p = climate.paving;
  const grass = climate.ground.grass;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const shade = (color, f) => color.map((v) => Math.min(v * f, 1));

  // A stroke along a polyline. blur (metres) feathers its edges with two wider, fainter
  // strokes underneath (a canvas blur filter would be far too slow on images this big).
  // cap: "round" for organic ends, "square" for paved ones (a straight edge where paving starts).
  const stroke = (points, width, rgb, { alpha = 1, blur = 0, cap = "round" } = {}) => {
    c.strokeStyle = css(rgb);
    c.lineCap = cap;
    trace(c, points);
    const passes = blur > 0 ? [[width + blur * 2, alpha * 0.3], [width + blur, alpha * 0.5], [width, alpha]] : [[width, alpha]];
    for (const [w, a] of passes) {
      c.globalAlpha = a;
      c.lineWidth = w;
      c.stroke();
    }
    c.globalAlpha = 1;
  };
  const kind = (points, width, rgb, cap = "round") => {
    k.strokeStyle = css(rgb);
    k.lineCap = cap;
    k.lineWidth = width + 0.6; // a little wider than the colour, so every soft edge has a kind
    trace(k, points);
    k.stroke();
  };

  // Each kind of road is painted in passes over all roads of that kind (every verge, then
  // every surface, then the details), so where roads meet, their shapes merge instead of
  // one road's edge being painted across another's surface. Humbler kinds go first.
  const of = (type) => settlement.roads.filter((road) => road.type === type);

  // Fields first: everything else is painted over them.
  for (const f of settlement.fields ?? []) paintField(c, k, f, p, grass, random);

  // Footpaths, trodden earth: a soft verge, the path, a lighter worn middle, ragged edges.
  const paths = of("path");
  for (const { points, width } of paths) stroke(points, width + 0.8, mix(p.dirt, grass, 0.55), { alpha: 0.45, blur: 0.35 });
  for (const { points, width } of paths) stroke(points, width, p.dirt, { blur: 0.18 });
  for (const { points, width } of paths) stroke(points, width * 0.45, shade(p.dirt, 1.08), { alpha: 0.6, blur: 0.25 });
  for (const { points, width } of paths) {
    for (const [x, z, side] of edgeSpots(points, 0.35)) {
      const out = width / 2 + random.range(-0.25, 0.15); // edgeSpots gives both sides
      c.globalAlpha = random.range(0.5, 0.9);
      c.fillStyle = css(random() < 0.6 ? p.dirt : mix(p.dirt, grass, 0.7));
      dot(c, x + side[0] * out, z + side[1] * out, random.range(0.06, 0.2));
    }
    c.globalAlpha = 1;
    kind(points, width, [1, 0, 0]);
  }

  // Gravel tracks: a grassy verge, the gravel, two wheel ruts and a grassy strip between them.
  const tracks = of("road");
  for (const { points, width } of tracks) stroke(points, width + 1, mix(p.gravel, grass, 0.5), { alpha: 0.55, blur: 0.4 });
  for (const { points, width } of tracks) stroke(points, width, p.gravel, { blur: 0.15 });
  for (const { points, width } of tracks) {
    for (const side of [-1, 1]) stroke(offset(points, side * width * 0.24), 0.5, shade(p.gravel, 0.82), { alpha: 0.75, blur: 0.18 });
    stroke(points, 0.35, mix(p.gravel, grass, 0.6), { alpha: 0.5, blur: 0.15 });
    kind(points, width, [0, 1, 0]);
  }

  // Cobbled streets: dark curb stones, the paving, gutters, and a polished middle where feet go.
  // Gutters stop where another street or a square begins, rather than crossing its mouth.
  const streets = of("street");
  const elsewhere = pavedNear(streets, settlement.squares);
  for (const { points, width } of streets) stroke(points, width, shade(p.stones[1], 0.72), { cap: "square" });
  for (const { points, width } of streets) stroke(points, width - 0.5, p.stones[0], { cap: "square" });
  streets.forEach(({ points, width }, i) => {
    for (const side of [-1, 1]) {
      for (const piece of trim(offset(points, side * (width / 2 - 0.45)), (x, z) => elsewhere(x, z, i))) {
        stroke(piece, 0.22, p.mortar, { alpha: 0.45, cap: "butt" });
      }
    }
  });
  for (const { points, width } of streets) {
    stroke(points, width * 0.4, p.stones[2], { alpha: 0.3, blur: 0.4 });
    kind(points, width, [0, 0, 1], "square");
  }

  for (const square of settlement.squares) paintSquare(c, k, square, p, shade);

  // Harbour: breakwaters and quays, paved in big slabs with a dark edge course.
  for (const mole of settlement.harbour?.moles ?? []) {
    stroke(mole.points, mole.width, shade(p.stones[1], 0.75));
    stroke(mole.points, mole.width - 0.9, p.stones[0]);
    kind(mole.points, mole.width, [0, 0, 1]);
  }
  for (const q of settlement.harbour?.quays ?? []) paintQuay(c, k, q, p, shade);
  return { color, kinds, ppm };
}

// Crops: the ground of the field, and rows across it.
const CROP_LOOKS = {
  wheat: { ground: [0.82, 0.68, 0.36], rows: [0.9, 0.78, 0.42], spacing: 0.5, width: 0.3 },
  millet: { ground: [0.75, 0.6, 0.35], rows: [0.86, 0.7, 0.4], spacing: 0.6, width: 0.32 },
  furrows: { ground: [0.48, 0.36, 0.25], rows: [0.36, 0.26, 0.18], spacing: 0.7, width: 0.28 },
  greens: { ground: [0.45, 0.35, 0.24], rows: [0.3, 0.55, 0.22], spacing: 0.75, width: 0.38 },
  lavender: { ground: [0.6, 0.55, 0.38], rows: [0.55, 0.45, 0.78], spacing: 1.1, width: 0.6 },
  vines: { ground: [0.62, 0.5, 0.36], rows: [0.32, 0.5, 0.22], spacing: 1.4, width: 0.45 },
};

function paintField(c, k, { centre: [cx, cz], size: [w, d], angle, crop }, p, grass, random) {
  const look = CROP_LOOKS[crop] ?? CROP_LOOKS.furrows;
  const frame = (ctx) => {
    ctx.save();
    ctx.translate(cx, cz);
    // The field's width runs along [cos(angle), -sin(angle)], i.e. a canvas turned by -angle.
    ctx.rotate(-angle);
  };
  frame(c);
  c.fillStyle = css(look.ground.map((v, i) => (v + grass[i]) / 2));
  c.globalAlpha = 0.85;
  c.fillRect(-w / 2 - 0.4, -d / 2 - 0.4, w + 0.8, d + 0.8); // a soft, grassy margin
  c.globalAlpha = 1;
  c.fillStyle = css(look.ground);
  c.fillRect(-w / 2, -d / 2, w, d);
  c.fillStyle = css(look.rows);
  for (let x = -w / 2 + look.spacing / 2; x < w / 2; x += look.spacing) {
    c.globalAlpha = 0.75 + random() * 0.25;
    c.fillRect(x - look.width / 2, -d / 2 + 0.3, look.width, d - 0.6);
  }
  c.globalAlpha = 1;
  c.restore();
  frame(k);
  k.fillStyle = css([1, 0, 0]); // dirt detail up close
  k.fillRect(-w / 2 - 0.4, -d / 2 - 0.4, w + 0.8, d + 0.8);
  k.restore();
}

// A quay: big slabs in rows along the water, a dark edge course at the water's edge.
function paintQuay(c, k, { centre: [cx, cz], size: [length, depth], angle }, p, shade) {
  const frame = (ctx) => {
    ctx.save();
    ctx.translate(cx, cz);
    ctx.rotate(-angle); // canvas x along the quay, canvas y out to sea
  };
  frame(k);
  k.fillStyle = css([0, 0, 1]);
  k.fillRect(-length / 2, -depth / 2 - 5, length, depth + 5);
  k.restore();
  frame(c);
  c.fillStyle = css(p.stones[0]);
  c.fillRect(-length / 2, -depth / 2 - 2, length, depth + 2);
  c.strokeStyle = css(p.mortar);
  c.lineWidth = 0.08;
  for (let y = -depth / 2 - 2 + 1.2; y < depth / 2; y += 1.2) {
    c.beginPath();
    c.moveTo(-length / 2, y);
    c.lineTo(length / 2, y);
    c.stroke();
    for (let x = -length / 2 + ((Math.round(y / 1.2) % 2) ? 0.9 : 0); x < length / 2; x += 1.8) {
      c.beginPath();
      c.moveTo(x, y - 1.2);
      c.lineTo(x, y);
      c.stroke();
    }
  }
  c.fillStyle = css(shade(p.stones[1], 0.7));
  c.fillRect(-length / 2, depth / 2 - 0.7, length, 0.7);
  c.restore();
}

// A square: paving with a dark border, a fine inner band, diagonal tiles and a compass rose.
function paintSquare(c, k, { centre: [cx, cz], size: [w, d], angle }, p, shade) {
  const frame = (ctx) => {
    ctx.save();
    ctx.translate(cx, cz);
    ctx.rotate(angle);
  };
  frame(k);
  k.fillStyle = css([0, 0, 1]);
  k.fillRect(-w / 2 - 0.3, -d / 2 - 0.3, w + 0.6, d + 0.6);
  k.restore();

  frame(c);
  c.fillStyle = css(p.stones[0]);
  c.fillRect(-w / 2, -d / 2, w, d);
  c.beginPath();
  c.rect(-w / 2, -d / 2, w, d);
  c.clip();
  // Diagonal tiles in two shades.
  const tile = 1.5;
  c.save();
  c.rotate(Math.PI / 4);
  c.fillStyle = css(p.stones[2]);
  c.globalAlpha = 0.35;
  const reach = Math.hypot(w, d) / 2 + tile;
  for (let i = -Math.ceil(reach / tile); i <= reach / tile; i++) {
    for (let j = -Math.ceil(reach / tile); j <= reach / tile; j++) {
      if ((i + j) % 2 === 0) c.fillRect(i * tile, j * tile, tile, tile);
    }
  }
  c.restore();
  c.globalAlpha = 1;
  // Border, and a thin band just inside it.
  c.strokeStyle = css(shade(p.stones[1], 0.72));
  c.lineWidth = 1;
  c.strokeRect(-w / 2, -d / 2, w, d);
  c.strokeStyle = css(p.accent);
  c.lineWidth = 0.2;
  c.strokeRect(-w / 2 + 1.1, -d / 2 + 1.1, w - 2.2, d - 2.2);
  // Compass rose: a ring, rays, and a disc in the middle.
  const ring = Math.min(w, d) * 0.3;
  c.fillStyle = css(p.stones[0]);
  c.beginPath();
  c.arc(0, 0, ring + 0.3, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = css(p.accent);
  c.lineWidth = 0.45;
  c.beginPath();
  c.arc(0, 0, ring, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = css(shade(p.stones[1], 0.9));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, long = i % 2 ? ring * 0.6 : ring * 0.95;
    c.beginPath();
    c.moveTo(Math.cos(a) * long, Math.sin(a) * long);
    c.lineTo(Math.cos(a + 0.5) * 0.6, Math.sin(a + 0.5) * 0.6);
    c.lineTo(Math.cos(a - 0.5) * 0.6, Math.sin(a - 0.5) * 0.6);
    c.fill();
  }
  c.fillStyle = css(p.accent);
  c.beginPath();
  c.arc(0, 0, 0.7, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// A test for whether (x, z) lies on a square or on any street other than streets[skip].
function pavedNear(streets, squares) {
  const squareTests = squares.map(squareDistance);
  return (x, z, skip) => {
    if (squareTests.some((outside) => outside(x, z) < 0.3)) return true;
    return streets.some((street, i) => i !== skip && distanceToLine(x, z, street.points) < street.width / 2 + 0.2);
  };
}

// The parts of a polyline whose points do not pass `excluded(x, z)`.
function trim(points, excluded) {
  const pieces = [];
  let piece = [];
  for (const point of points) {
    if (excluded(point[0], point[1])) {
      if (piece.length > 1) pieces.push(piece);
      piece = [];
    } else {
      piece.push(point);
    }
  }
  if (piece.length > 1) pieces.push(piece);
  return pieces;
}

function distanceToLine(x, z, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    // Cheap reject: the segment's box, grown by the best distance so far.
    if (Math.min(ax, bx) - best > x || Math.max(ax, bx) + best < x || Math.min(az, bz) - best > z || Math.max(az, bz) + best < z) continue;
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0), 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// Points along both edges of a polyline every `step` metres: [x, z, sideways unit vector].
function edgeSpots(points, step) {
  const samples = resample(points, step);
  const spots = [];
  samples.forEach(([x, z], i) => {
    const a = samples[Math.max(i - 1, 0)], b = samples[Math.min(i + 1, samples.length - 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const side = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    spots.push([x, z, side], [x, z, [-side[0], -side[1]]]);
  });
  return spots;
}

// The polyline shifted sideways by `distance` metres (positive to its left).
function offset(points, distance) {
  const samples = resample(points, 1);
  return samples.map(([x, z], i) => {
    const a = samples[Math.max(i - 1, 0)], b = samples[Math.min(i + 1, samples.length - 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [x - ((b[1] - a[1]) / len) * distance, z + ((b[0] - a[0]) / len) * distance];
  });
}

function trace(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
}

function dot(ctx, x, z, r) {
  ctx.beginPath();
  ctx.arc(x, z, r, 0, Math.PI * 2);
  ctx.fill();
}

function css([r, g, b]) {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

function makeCanvas(size) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
  return Object.assign(document.createElement("canvas"), { width: size, height: size });
}
