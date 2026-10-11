import assert from "node:assert/strict";
import { test } from "node:test";

import { getLanguage, setLanguage, STRINGS, t } from "../../static/js/i18n.js";

test("every language has exactly the same keys", () => {
  const english = Object.keys(STRINGS.en).sort();
  for (const [code, strings] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(strings).sort(), english, code);
  }
});

test("placeholders survive translation", () => {
  for (const [key, value] of Object.entries(STRINGS.en)) {
    if (typeof value !== "string") continue;
    const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [code, strings] of Object.entries(STRINGS)) {
      assert.deepEqual(names(strings[key]), names(value), `${code}.${key}`);
    }
  }
});

test("switching language changes t()", () => {
  setLanguage("en");
  assert.equal(t("importFailed", { file: "a.json", message: "oops" }), "Could not load a.json: oops");
  setLanguage("cs");
  assert.equal(getLanguage(), "cs");
  assert.equal(t("importFailed", { file: "a.json", message: "oops" }), "Soubor a.json nelze načíst: oops");
  setLanguage("xx");
  assert.equal(getLanguage(), "cs", "unknown codes are ignored");
  setLanguage("en");
});
