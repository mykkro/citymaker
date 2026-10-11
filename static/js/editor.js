// The editor panel: generation options, Generate, Explore, export/import and view settings.
// It only reads and fills the form; main.js does the work through `handlers`.

import { ARCHITECTURE_CHOICES, CLIMATE_IDS, FEATURE_IDS, MAX_SEED, normalizeOptions, SETTLEMENT_IDS, SIZES } from "./world/options.js";

const CLIMATE_ICONS = { mild: "🌳", forest: "🌲", mediterranean: "🫒", tropical: "🌴", savanna: "🦒", desert: "🌵", tundra: "❄️" };

// handlers: { generate(options), explore(), exportWorld(), exportGlb(), importWorld(file), showGrid(on) }
export function createEditor(panel, handlers) {
  const $ = (selector) => panel.querySelector(selector);
  const form = $("#options");
  const seed = $("#opt-seed");
  const sliders = ["hilliness", "vegetation", "peaks", "bays", "cliffs", "islets", "density", "height", "variety"]; // 0..100 in the form, 0..1 as options
  const message = $("#message");

  // Radio buttons for sizes and climates; their labels are translated through data-t.
  const radio = (name, value, label, icon) => {
    const option = document.createElement("label");
    option.innerHTML = `<input type="radio" name="${name}" value="${value}"><span>${icon ? `<span class="icon" aria-hidden="true">${icon}</span>` : ""}<span data-t="${label}"></span></span>`;
    return option;
  };
  $("#opt-size").append(...Object.keys(SIZES).map((id) => radio("size", id, `size_${id}`)));
  $("#opt-climate").append(...CLIMATE_IDS.map((id) => radio("climate", id, `climate_${id}`, CLIMATE_ICONS[id])));
  $("#opt-settlement").append(...SETTLEMENT_IDS.map((id) => radio("settlement", id, `settlement_${id}`)));
  $("#opt-architecture").append(...ARCHITECTURE_CHOICES.map((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.dataset.t = `architecture_${id}`;
    return option;
  }));
  $("#opt-features").append(...FEATURE_IDS.map((id) => {
    const option = document.createElement("label");
    option.className = "check";
    option.innerHTML = `<input type="checkbox" name="features" value="${id}"> <span data-t="feature_${id}"></span>`;
    return option;
  }));

  function read() {
    const data = new FormData(form);
    return normalizeOptions({
      seed: data.get("seed"),
      size: data.get("size"),
      climate: data.get("climate"),
      settlement: data.get("settlement"),
      architecture: data.get("architecture"),
      features: data.getAll("features"),
      ...Object.fromEntries(sliders.map((key) => [key, Number(data.get(key)) / 100])),
    });
  }

  function write(options) {
    seed.value = options.seed;
    for (const key of sliders) form.elements[key].value = Math.round(options[key] * 100);
    form.elements.size.value = options.size;
    form.elements.climate.value = options.climate;
    form.elements.settlement.value = options.settlement;
    form.elements.architecture.value = options.architecture;
    for (const box of form.querySelectorAll("[name=features]")) box.checked = options.features.includes(box.value);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handlers.generate(read());
  });
  $("#random-seed").addEventListener("click", () => {
    seed.value = Math.floor(Math.random() * MAX_SEED);
    handlers.generate(read());
  });
  $("#explore").addEventListener("click", () => handlers.explore());
  $("#export").addEventListener("click", () => handlers.exportWorld());
  $("#export-glb").addEventListener("click", () => handlers.exportGlb());
  const file = $("#import-file");
  $("#import").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    if (file.files[0]) handlers.importWorld(file.files[0]);
    file.value = ""; // so picking the same file again still fires
  });
  $("#show-grid").addEventListener("change", (e) => handlers.showGrid(e.target.checked));

  return {
    read,
    write,
    setBusy(busy) {
      for (const button of panel.querySelectorAll("button")) button.disabled = busy;
    },
    setStats(text) {
      $("#stats").textContent = text;
    },
    showMessage(text) {
      message.textContent = text ?? "";
      message.hidden = !text;
    },
  };
}
