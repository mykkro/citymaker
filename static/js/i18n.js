// UI text in English and Czech, plus the current-language state.

const FLAG_CS = `<svg viewBox="0 0 6 4" aria-hidden="true"><rect width="6" height="4" fill="#d7141a"/><rect width="6" height="2" fill="#fff"/><path d="M0 0L3 2L0 4Z" fill="#11457e"/></svg>`;

const FLAG_EN = `<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="uk-s"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="uk-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#uk-s)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#uk-t)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg>`;

export const LANGUAGES = [
  { code: "cs", name: "Čeština", flag: FLAG_CS },
  { code: "en", name: "English", flag: FLAG_EN },
];

export const STRINGS = {
  en: {
    loading: "loading…",
    generating: "generating the island…",
    error: "error: {message}",
    helpOverview: "seed {seed} · drag to turn · wheel zoom · WASD move around · hold T fast-forward time",
    helpExplore: "click to capture mouse · WASD move · arrows/mouse look · wheel zoom · hold T fast-forward time · M back to the editor · Esc release",
    helpTouchOverview: "drag: turn · pinch: zoom · hold ⏩: fast-forward time",
    helpTouch: "left thumb: move · right thumb: look · pinch: zoom · hold ⏩: fast-forward time",
    clockTitle: "Time of day",
    languageLabel: "Language",
    timeButton: "Hold to fast-forward time",

    editorTitle: "Island",
    seed: "Seed",
    randomSeed: "Random seed",
    size: "Size",
    size_small: "Small",
    size_medium: "Medium",
    size_large: "Large",
    size_huge: "Huge",
    size_vast: "Vast",
    size_giant: "Giant",
    hilliness: "Terrain",
    hillinessLow: "flat",
    hillinessHigh: "mountains",
    peaks: "Mountains",
    peaksLow: "none",
    peaksHigh: "high peaks",
    coast: "Coast",
    bays: "Bays",
    baysLow: "round",
    baysHigh: "deep bays",
    cliffs: "Cliffs",
    cliffsLow: "beaches",
    cliffsHigh: "cliffs",
    islets: "Islets",
    isletsLow: "none",
    isletsHigh: "many",
    vegetation: "Vegetation",
    vegetationLow: "bare",
    vegetationHigh: "lush",
    climate: "Climate",
    climate_mild: "Mild",
    climate_forest: "Forest",
    climate_mediterranean: "Mediterranean",
    climate_tropical: "Tropical",
    climate_savanna: "Savanna",
    climate_desert: "Desert",
    climate_tundra: "Tundra",
    settlement: "Settlement",
    settlement_none: "None",
    settlement_hamlet: "Hamlet",
    settlement_village: "Village",
    settlement_town: "Town",
    settlement_city: "City",
    settlement_metropolis: "Metropolis",
    buildingsTitle: "Buildings",
    architecture: "Architecture",
    architecture_auto: "By climate",
    architecture_cottage: "Timber & thatch cottages",
    architecture_log: "Log houses",
    architecture_nordic: "Nordic",
    architecture_mediterranean: "Mediterranean (flat roofs)",
    architecture_arabic: "Arabic (flat roofs, mosque)",
    architecture_adobe: "Adobe",
    temple: "Temple",
    temple_auto: "By architecture",
    temple_spire: "Church with a spire",
    temple_bell: "Church with a bell tower",
    temple_dome: "Domed church",
    temple_mosque: "Mosque",
    architecture_tropical: "Tropical",
    architecture_huts: "Round huts",
    density: "Density",
    densityLow: "scattered",
    densityHigh: "packed",
    height: "Height",
    heightLow: "low",
    heightHigh: "tall",
    variety: "Shapes",
    varietyLow: "plain",
    varietyHigh: "varied",
    feature_church: "Church & shrines",
    feature_mill: "Windmills",
    feature_wells: "Wells & fountain",
    feature_market: "Market & town hall",
    feature_farms: "Farms & fields",
    feature_walls: "Town walls",
    feature_harbour: "Harbour & boats",
    feature_signs: "Signposts & notice boards",
    showGrid: "Show tile grid",
    generate: "Generate",
    explore: "Explore on foot",
    exportJson: "Export JSON",
    importJson: "Import JSON",
    exportGlb: "Export GLB",
    exportGlbTitle: "3D model for Blender and other tools: island, water, roads and plants as separate layers",
    importFailed: "Could not load {file}: {message}",
    stats: "{buildings} buildings · {roads} m of roads · {trees} trees · {rocks} rocks · land {land} % · {width} × {width} m",
    hidePanel: "Hide panel",
    showPanel: "Show the island settings",
    backToEditor: "Editor",
    backToEditorTitle: "Back to the editor (M)",

    chooseTitle: "Choose your avatar",
    chooseNote: "Walk, roll or swim around the island. Press M to return to the editor.",
    cancel: "Cancel",
    avatar_ball: "Ball",
    avatar_cat: "Tabby cat",
    avatar_dog: "Dog",
    avatar_hedgehog: "Hedgehog",
  },

  cs: {
    loading: "načítám…",
    generating: "generuji ostrov…",
    error: "chyba: {message}",
    helpOverview: "seed {seed} · tažením otáčení · kolečko přiblížení · WASD posun · podržte T pro zrychlení času",
    helpExplore: "kliknutím zachytíte myš · WASD pohyb · šipky/myš rozhlížení · kolečko přiblížení · podržte T pro zrychlení času · M zpět do editoru · Esc uvolnit myš",
    helpTouchOverview: "tažení: otáčení · dva prsty: přiblížení · podržte ⏩: zrychlení času",
    helpTouch: "levý palec: pohyb · pravý palec: rozhlížení · dva prsty: přiblížení · podržte ⏩: zrychlení času",
    clockTitle: "Denní doba",
    languageLabel: "Jazyk",
    timeButton: "Podržením zrychlíte čas",

    editorTitle: "Ostrov",
    seed: "Seed",
    randomSeed: "Náhodný seed",
    size: "Velikost",
    size_small: "Malý",
    size_medium: "Střední",
    size_large: "Velký",
    size_huge: "Obří",
    size_vast: "Rozlehlý",
    size_giant: "Gigantický",
    hilliness: "Terén",
    hillinessLow: "rovina",
    hillinessHigh: "hory",
    peaks: "Hory",
    peaksLow: "žádné",
    peaksHigh: "vysoké štíty",
    coast: "Pobřeží",
    bays: "Zátoky",
    baysLow: "oblé",
    baysHigh: "hluboké zátoky",
    cliffs: "Útesy",
    cliffsLow: "pláže",
    cliffsHigh: "útesy",
    islets: "Ostrůvky",
    isletsLow: "žádné",
    isletsHigh: "mnoho",
    vegetation: "Vegetace",
    vegetationLow: "holá",
    vegetationHigh: "bujná",
    climate: "Podnebí",
    climate_mild: "Mírné",
    climate_forest: "Lesy",
    climate_mediterranean: "Středomoří",
    climate_tropical: "Tropy",
    climate_savanna: "Savana",
    climate_desert: "Poušť",
    climate_tundra: "Tundra",
    settlement: "Osídlení",
    settlement_none: "Žádné",
    settlement_hamlet: "Osada",
    settlement_village: "Vesnice",
    settlement_town: "Městečko",
    settlement_city: "Město",
    settlement_metropolis: "Velkoměsto",
    buildingsTitle: "Stavby",
    architecture: "Architektura",
    architecture_auto: "Podle podnebí",
    architecture_cottage: "Hrázděné chalupy s doškem",
    architecture_log: "Roubenky",
    architecture_nordic: "Severská",
    architecture_mediterranean: "Středomořská (ploché střechy)",
    architecture_arabic: "Arabská (ploché střechy, mešita)",
    architecture_adobe: "Nepálené cihly",
    temple: "Svatostánek",
    temple_auto: "Podle architektury",
    temple_spire: "Kostel s věží a špicí",
    temple_bell: "Kostel se zvonicí",
    temple_dome: "Kostel s kupolí",
    temple_mosque: "Mešita",
    architecture_tropical: "Tropická",
    architecture_huts: "Kruhové chýše",
    density: "Hustota",
    densityLow: "řídká",
    densityHigh: "hustá",
    height: "Výška",
    heightLow: "nízké",
    heightHigh: "vysoké",
    variety: "Tvary",
    varietyLow: "jednoduché",
    varietyHigh: "rozmanité",
    feature_church: "Kostel a boží muka",
    feature_mill: "Větrné mlýny",
    feature_wells: "Studny a kašna",
    feature_market: "Trh a radnice",
    feature_farms: "Statky a pole",
    feature_walls: "Hradby",
    feature_harbour: "Přístav a lodě",
    feature_signs: "Rozcestníky a vývěsky",
    showGrid: "Zobrazit mřížku dlaždic",
    generate: "Generovat",
    explore: "Prozkoumat pěšky",
    exportJson: "Export JSON",
    importJson: "Import JSON",
    exportGlb: "Export GLB",
    exportGlbTitle: "3D model pro Blender a další nástroje: ostrov, voda, cesty a rostliny jako samostatné vrstvy",
    importFailed: "Soubor {file} nelze načíst: {message}",
    stats: "budovy: {buildings} · cesty: {roads} m · stromy: {trees} · kameny: {rocks} · souš {land} % · {width} × {width} m",
    hidePanel: "Skrýt panel",
    showPanel: "Zobrazit nastavení ostrova",
    backToEditor: "Editor",
    backToEditorTitle: "Zpět do editoru (M)",

    chooseTitle: "Vyberte si postavu",
    chooseNote: "Projděte, prokutálejte nebo proplavte ostrov. Klávesou M se vrátíte do editoru.",
    cancel: "Zrušit",
    avatar_ball: "Míč",
    avatar_cat: "Mourovatá kočka",
    avatar_dog: "Pes",
    avatar_hedgehog: "Ježek",
  },
};

const STORAGE_KEY = "citymaker.language";
const listeners = new Set();
let current = detectLanguage();

function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && STRINGS[saved]) return saved;
  } catch {
    // Storage can be unavailable (private mode, tests); fall through.
  }
  const preferred = typeof navigator !== "undefined" ? navigator.language ?? "" : "";
  return preferred.toLowerCase().startsWith("cs") ? "cs" : "en";
}

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  if (!STRINGS[code] || code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Not remembered, but the switch still works for this session.
  }
  for (const listener of listeners) listener(code);
}

export function onLanguageChange(listener) {
  listeners.add(listener);
}

// Translated string with {placeholders} filled in.
export function t(key, params = {}) {
  const text = STRINGS[current][key] ?? STRINGS.en[key];
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}
