"use strict";
function detectSystemLanguage(app = {}) {
  let tag;
  try {
    tag = app.getPreferredSystemLanguages?.()?.[0];
  } catch {}
  if (typeof tag !== "string" || !tag.trim()) {
    try {
      tag = app.getLocale?.();
    } catch {}
  }
  const primary =
    typeof tag === "string" ? tag.trim().toLowerCase().split(/[-_]/)[0] : "";
  return primary === "uk" ? "ua" : primary === "ru" ? "ru" : "en";
}
// The marker distinguishes original defaults from newly selected manual values.
function migrateAppearanceSettings(settings) {
  if (typeof settings.followSystemLanguage === "boolean") return false;
  settings.followSystemLanguage = !["en", "ru"].includes(settings.language);
  if (settings.theme === undefined || settings.theme === "dark")
    settings.theme = "system";
  return true;
}
function resolveAppearanceLanguage(settings, systemLanguage = "en") {
  if (settings.followSystemLanguage === true)
    settings.language = ["ua", "ru", "en"].includes(systemLanguage)
      ? systemLanguage
      : "en";
  return settings;
}
module.exports = {
  detectSystemLanguage,
  migrateAppearanceSettings,
  resolveAppearanceLanguage,
};
