// Flag buttons for switching the UI language.

import { getLanguage, LANGUAGES, onLanguageChange, setLanguage, t } from "./i18n.js";

export function createLanguageSwitcher(container) {
  const buttons = LANGUAGES.map(({ code, name, flag }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.lang = code;
    button.title = name;
    button.setAttribute("aria-label", name);
    button.innerHTML = flag;
    button.addEventListener("click", () => {
      setLanguage(code);
      button.blur(); // keep game keys (Space, E...) from re-triggering the button
    });
    container.append(button);
    return { code, button };
  });

  const refresh = () => {
    container.setAttribute("aria-label", t("languageLabel"));
    for (const { code, button } of buttons) button.setAttribute("aria-pressed", String(code === getLanguage()));
  };
  refresh();
  onLanguageChange(refresh);
}
