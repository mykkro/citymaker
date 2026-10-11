// Architecture styles: what the buildings look like. A world uses the style its climate
// suggests, or one chosen in the editor.
//
// walls       a few wall colours (one per house, by variant)
// trim        window frames, corner boards, doors' frames
// timber      exposed beams (timber framing, flat-roof beam ends) or null
// roof        "thatch" | "tile" (also shingles and slate) | "flat"; roofColor; pitch (radians)
// flatShare   share of houses with a flat roof instead (0..1)
// timbered    share of houses with timber framing
// logs        log walls (horizontal courses)
// cornerBoards  white boards on the corners (Nordic)
// hut         round huts with cone roofs instead of rectangular houses
// stone       plinths, chimneys, wells, town walls
// fence       "fence" or "wall" round the yards
// church      "spire" | "dome" | "bell" (a low pyramid on the tower)
// barn        barn wall colour
// shutters    shutter colours (null entries mean none)
// door        door colour, where it is not plain wood

export const ARCHITECTURE_IDS = ["cottage", "log", "nordic", "mediterranean", "adobe", "tropical", "huts"];

export const CLIMATE_ARCHITECTURE = {
  mild: "cottage", forest: "log", mediterranean: "mediterranean", tropical: "tropical",
  savanna: "huts", desert: "adobe", tundra: "nordic",
};

const GREEN = [0.25, 0.45, 0.3], BLUE = [0.25, 0.37, 0.56], RED = [0.58, 0.22, 0.18];

export const ARCHITECTURES = {
  // Central European village: whitewash, timber framing, thick thatch.
  cottage: {
    walls: [[0.94, 0.91, 0.84], [0.92, 0.88, 0.76], [0.9, 0.86, 0.8]], trim: [0.33, 0.23, 0.16], timber: [0.33, 0.23, 0.16],
    roof: "thatch", roofColor: [0.74, 0.62, 0.38], pitch: 0.85, flatShare: 0, timbered: 0.5, logs: false, cornerBoards: false,
    hut: false, stone: [0.72, 0.7, 0.66], fence: "fence", church: "spire", barn: [0.5, 0.36, 0.24], shutters: [GREEN, BLUE, RED, null],
  },
  // Log houses with shingle roofs.
  log: {
    walls: [[0.55, 0.4, 0.27], [0.5, 0.36, 0.24], [0.6, 0.45, 0.3]], trim: [0.85, 0.82, 0.74], timber: [0.3, 0.21, 0.14],
    roof: "tile", roofColor: [0.38, 0.3, 0.24], pitch: 0.8, flatShare: 0, timbered: 0, logs: true, cornerBoards: false,
    hut: false, stone: [0.62, 0.6, 0.57], fence: "fence", church: "spire", barn: [0.45, 0.32, 0.22], shutters: [GREEN, null, RED, null],
  },
  // Scandinavian: falu red, ochre and white boarded houses, white trim, dark steep roofs.
  nordic: {
    walls: [[0.56, 0.16, 0.12], [0.82, 0.62, 0.26], [0.9, 0.9, 0.86], [0.56, 0.16, 0.12]], trim: [0.95, 0.95, 0.92], timber: null,
    roof: "tile", roofColor: [0.24, 0.24, 0.26], pitch: 0.9, flatShare: 0, timbered: 0, logs: false, cornerBoards: true,
    hut: false, stone: [0.55, 0.55, 0.56], fence: "fence", church: "spire", barn: [0.56, 0.16, 0.12], shutters: [null, null, null, null],
  },
  // Aegean island: white cubes with flat roofs and blue trim, some tiled roofs, a blue-domed church.
  mediterranean: {
    walls: [[0.97, 0.96, 0.92], [0.96, 0.95, 0.9], [0.95, 0.88, 0.72]], trim: [0.15, 0.38, 0.68], timber: [0.35, 0.28, 0.2],
    roof: "tile", roofColor: [0.76, 0.39, 0.25], pitch: 0.4, flatShare: 0.7, timbered: 0, logs: false, cornerBoards: false,
    hut: false, stone: [0.88, 0.84, 0.75], fence: "wall", church: "dome", barn: [0.85, 0.8, 0.7], shutters: [BLUE, [0.15, 0.38, 0.68], GREEN, null],
    door: [0.15, 0.38, 0.68],
  },
  // Desert: flat-roofed adobe with protruding roof beams.
  adobe: {
    walls: [[0.86, 0.73, 0.55], [0.82, 0.68, 0.5], [0.9, 0.8, 0.64]], trim: [0.42, 0.3, 0.2], timber: [0.42, 0.3, 0.2],
    roof: "flat", roofColor: [0.8, 0.67, 0.5], pitch: 0, flatShare: 1, timbered: 0, logs: false, cornerBoards: false,
    hut: false, stone: [0.86, 0.73, 0.56], fence: "wall", church: "bell", barn: [0.8, 0.66, 0.48], shutters: [null, null, null, null],
  },
  // Tropical: timber houses under steep palm thatch.
  tropical: {
    walls: [[0.78, 0.64, 0.44], [0.72, 0.58, 0.4], [0.82, 0.7, 0.5]], trim: [0.45, 0.32, 0.2], timber: [0.45, 0.32, 0.2],
    roof: "thatch", roofColor: [0.62, 0.53, 0.32], pitch: 0.95, flatShare: 0, timbered: 0, logs: false, cornerBoards: false,
    hut: false, stone: [0.82, 0.78, 0.7], fence: "fence", church: "bell", barn: [0.6, 0.48, 0.32], shutters: [GREEN, BLUE, null, null],
  },
  // Round mud huts under cones of thatch.
  huts: {
    walls: [[0.68, 0.47, 0.32], [0.72, 0.52, 0.36], [0.64, 0.44, 0.3]], trim: [0.4, 0.28, 0.18], timber: [0.4, 0.28, 0.18],
    roof: "thatch", roofColor: [0.78, 0.66, 0.4], pitch: 0.75, flatShare: 0, timbered: 0, logs: false, cornerBoards: false,
    hut: true, stone: [0.74, 0.6, 0.46], fence: "fence", church: "bell", barn: [0.66, 0.46, 0.32], shutters: [null, null, null, null],
  },
};

// The style for a world: chosen, or the climate's own.
export function resolveArchitecture(choice, climate) {
  return ARCHITECTURE_IDS.includes(choice) ? choice : CLIMATE_ARCHITECTURE[climate] ?? "cottage";
}
