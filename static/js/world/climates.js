// Climates: ground colours, what grows where, how much of it, and what roads are paved with.
// Generators read the numbers; the renderer reads the colours.
//
// forest:      forest-mask threshold (0..1); lower means more of the island is forest, 1 means none
// scattered:   chance of a lone tree outside forests, per placement attempt
// density:     multipliers on how many of each prop are tried
// snowLine:    height above the sea where snow starts (and trees stop), or null
// grassHeight: how tall grass grows (1 = ankle high)
// paving:      dirt (paths), gravel (tracks), stones (streets and squares; a few shades),
//              mortar (between the stones) and accent (the pattern in the middle of a square)
// treeKind(random, spot) and bushKind(random, spot) choose what grows; spot is
//   { height, altitude (0 in the lowlands, 1 about 10 units above them), slope }

export const TREE_KINDS = [
  "oak", "pine", "birch", "palm", "cactus", "snowPine", "deadTree", "jungle",
  "olive", "cypress", "umbrellaPine", "acacia", "baobab",
];
export const BUSH_KINDS = ["bush", "shrub"];

const SAND = [0.87, 0.8, 0.6], WET_SAND = [0.66, 0.6, 0.45], SEABED = [0.42, 0.45, 0.38];
const GREY_STONES = [[0.58, 0.57, 0.55], [0.5, 0.49, 0.47], [0.65, 0.63, 0.59]];

export const CLIMATES = {
  mild: {
    ground: { grass: [0.36, 0.62, 0.27], meadow: [0.55, 0.62, 0.3], rock: [0.52, 0.47, 0.42], sand: SAND, wetSand: WET_SAND, seabed: SEABED },
    snow: [0.93, 0.95, 0.97],
    snowLine: 11,
    grassTuft: { base: [0.26, 0.48, 0.18], tip: [0.52, 0.72, 0.3] },
    grassHeight: 1,
    flowerColors: [[0.95, 0.95, 0.9], [0.98, 0.85, 0.2], [0.85, 0.3, 0.55], [0.55, 0.45, 0.9]],
    paving: { dirt: [0.55, 0.45, 0.32], gravel: [0.64, 0.61, 0.55], stones: GREY_STONES, mortar: [0.36, 0.35, 0.33], accent: [0.62, 0.36, 0.26] },
    forest: 0.45,
    scattered: 0.015,
    density: { trees: 1, rocks: 1, bushes: 1, grass: 1, flowers: 0.5 },
    treeKind: (r, { altitude }) => (r() < 0.12 + altitude * 0.9 ? "pine" : r() < 0.2 ? "birch" : "oak"),
    bushKind: () => "bush",
  },

  forest: {
    ground: { grass: [0.27, 0.52, 0.22], meadow: [0.4, 0.52, 0.26], rock: [0.48, 0.45, 0.42], sand: [0.8, 0.75, 0.58], wetSand: WET_SAND, seabed: SEABED },
    snow: [0.93, 0.95, 0.97],
    snowLine: 12,
    grassTuft: { base: [0.2, 0.42, 0.16], tip: [0.42, 0.62, 0.26] },
    grassHeight: 1,
    flowerColors: [[0.95, 0.95, 0.9], [0.6, 0.5, 0.95], [0.95, 0.75, 0.3]],
    paving: { dirt: [0.45, 0.36, 0.26], gravel: [0.58, 0.56, 0.5], stones: GREY_STONES, mortar: [0.32, 0.31, 0.29], accent: [0.5, 0.4, 0.3] },
    forest: 0.33,
    scattered: 0.04,
    density: { trees: 1.7, rocks: 0.9, bushes: 1.4, grass: 0.8, flowers: 0.25 },
    treeKind: (r, { altitude }) => (r() < 0.35 + altitude * 0.55 ? "pine" : r() < 0.25 ? "birch" : "oak"),
    bushKind: () => "bush",
  },

  // Dry summers: olive groves, dark cypresses, umbrella pines by the sea, limestone and terracotta.
  mediterranean: {
    ground: { grass: [0.6, 0.6, 0.34], meadow: [0.7, 0.63, 0.4], rock: [0.8, 0.76, 0.68], sand: [0.93, 0.88, 0.72], wetSand: [0.74, 0.68, 0.54], seabed: [0.55, 0.58, 0.5] },
    snow: [0.93, 0.95, 0.97],
    snowLine: 13,
    grassTuft: { base: [0.45, 0.48, 0.25], tip: [0.78, 0.74, 0.45] },
    grassHeight: 1.1,
    flowerColors: [[0.62, 0.48, 0.85], [0.9, 0.2, 0.18], [0.98, 0.85, 0.3], [0.95, 0.95, 0.9]],
    paving: {
      dirt: [0.76, 0.66, 0.5], gravel: [0.84, 0.8, 0.7],
      stones: [[0.88, 0.84, 0.75], [0.8, 0.75, 0.65], [0.92, 0.89, 0.82]],
      mortar: [0.62, 0.57, 0.49], accent: [0.78, 0.45, 0.3],
    },
    forest: 0.5,
    scattered: 0.05,
    density: { trees: 1.1, rocks: 1.3, bushes: 1.4, grass: 0.7, flowers: 0.9 },
    treeKind: (r, { height, altitude }) => {
      if (height < 2.2 && r() < 0.5) return "umbrellaPine";
      if (altitude > 0.5 && r() < 0.6) return r() < 0.5 ? "pine" : "umbrellaPine";
      return r() < 0.3 ? "cypress" : "olive";
    },
    bushKind: (r) => (r() < 0.8 ? "bush" : "shrub"),
  },

  tropical: {
    ground: { grass: [0.3, 0.6, 0.22], meadow: [0.42, 0.62, 0.24], rock: [0.45, 0.42, 0.38], sand: [0.95, 0.89, 0.7], wetSand: [0.75, 0.68, 0.5], seabed: [0.5, 0.55, 0.45] },
    snow: [0.93, 0.95, 0.97],
    snowLine: 14,
    grassTuft: { base: [0.18, 0.46, 0.14], tip: [0.45, 0.75, 0.25] },
    grassHeight: 1.2,
    flowerColors: [[0.95, 0.25, 0.3], [0.98, 0.6, 0.15], [0.95, 0.4, 0.75], [0.98, 0.9, 0.3]],
    paving: {
      dirt: [0.62, 0.42, 0.3], gravel: [0.72, 0.64, 0.52],
      stones: [[0.8, 0.76, 0.68], [0.72, 0.68, 0.6], [0.86, 0.83, 0.76]],
      mortar: [0.5, 0.46, 0.4], accent: [0.3, 0.55, 0.6],
    },
    forest: 0.38,
    scattered: 0.03,
    density: { trees: 1.4, rocks: 0.7, bushes: 1.5, grass: 1.1, flowers: 1.2 },
    // Palms line the beaches; inland the jungle takes over.
    treeKind: (r, { height }) => (r() < (height < 2 ? 0.85 : 0.2) ? "palm" : "jungle"),
    bushKind: () => "bush",
  },

  // Tall golden grass, flat-topped acacias in loose groves, the odd baobab, red earth.
  savanna: {
    ground: { grass: [0.76, 0.66, 0.36], meadow: [0.7, 0.57, 0.33], rock: [0.62, 0.42, 0.3], sand: [0.9, 0.8, 0.6], wetSand: [0.7, 0.6, 0.44], seabed: [0.5, 0.48, 0.4] },
    snow: [0.93, 0.95, 0.97],
    snowLine: 15,
    grassTuft: { base: [0.58, 0.48, 0.24], tip: [0.92, 0.82, 0.48] },
    grassHeight: 2,
    flowerColors: [[0.95, 0.6, 0.2], [0.95, 0.9, 0.85]],
    paving: {
      dirt: [0.68, 0.4, 0.26], gravel: [0.72, 0.56, 0.4],
      stones: [[0.74, 0.6, 0.46], [0.66, 0.52, 0.4], [0.8, 0.68, 0.54]],
      mortar: [0.45, 0.33, 0.24], accent: [0.6, 0.3, 0.2],
    },
    forest: 0.6,
    scattered: 0.035,
    density: { trees: 0.8, rocks: 0.9, bushes: 0.8, grass: 1.5, flowers: 0.15 },
    treeKind: (r) => (r() < 0.88 ? "acacia" : "baobab"),
    bushKind: (r) => (r() < 0.6 ? "shrub" : "bush"),
  },

  desert: {
    ground: { grass: [0.88, 0.75, 0.52], meadow: [0.84, 0.62, 0.42], rock: [0.7, 0.46, 0.33], sand: [0.92, 0.84, 0.62], wetSand: [0.72, 0.62, 0.45], seabed: [0.55, 0.52, 0.42] },
    snow: null,
    snowLine: null,
    grassTuft: { base: [0.6, 0.55, 0.3], tip: [0.85, 0.78, 0.48] },
    grassHeight: 1,
    flowerColors: [[0.95, 0.45, 0.6], [0.98, 0.85, 0.3]],
    paving: {
      dirt: [0.78, 0.64, 0.45], gravel: [0.8, 0.71, 0.56],
      stones: [[0.86, 0.73, 0.56], [0.78, 0.64, 0.48], [0.9, 0.8, 0.64]],
      mortar: [0.6, 0.5, 0.38], accent: [0.25, 0.5, 0.6],
    },
    forest: 1, // no forests: just lone cacti and palms near the water
    scattered: 0.05,
    density: { trees: 1, rocks: 1.4, bushes: 0.8, grass: 0.12, flowers: 0.05 },
    treeKind: (r, { height }) => (height < 1.6 && r() < 0.7 ? "palm" : "cactus"),
    bushKind: () => "shrub",
  },

  tundra: {
    ground: { grass: [0.55, 0.58, 0.42], meadow: [0.62, 0.6, 0.5], rock: [0.5, 0.5, 0.5], sand: [0.68, 0.66, 0.6], wetSand: [0.5, 0.5, 0.46], seabed: [0.4, 0.42, 0.4] },
    snow: [0.93, 0.95, 0.98],
    snowLine: 4.2,
    grassTuft: { base: [0.45, 0.45, 0.3], tip: [0.72, 0.7, 0.52] },
    grassHeight: 0.8,
    flowerColors: [[0.95, 0.95, 0.95], [0.8, 0.6, 0.9]],
    paving: {
      dirt: [0.42, 0.38, 0.33], gravel: [0.56, 0.56, 0.54],
      stones: [[0.53, 0.53, 0.55], [0.45, 0.45, 0.47], [0.61, 0.61, 0.62]],
      mortar: [0.3, 0.3, 0.31], accent: [0.35, 0.4, 0.5],
    },
    forest: 0.5,
    scattered: 0.01,
    density: { trees: 0.6, rocks: 1.8, bushes: 0.7, grass: 0.6, flowers: 0.08 },
    treeKind: (r) => (r() < 0.75 ? "snowPine" : r() < 0.6 ? "deadTree" : "birch"),
    bushKind: (r) => (r() < 0.5 ? "shrub" : "bush"),
  },
};
