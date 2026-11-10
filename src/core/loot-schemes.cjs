"use strict";
const localeText = require("../locales/application.json");
const { randomUUID } = require("node:crypto");
const { normalizeLootSettings, validateLootJournal } = require("./loot.cjs");
const validId = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 200 &&
  !/[\x00-\x20\x7f]/.test(value);
function schemeName(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 100 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw Error(localeText.message_6287c45);
  return value.trim();
}
function ensureLootSchemes(data) {
  if (data.loot === undefined)
    return (data.loot = { version: 2, schemes: [], journal: [] });
  const loot = data.loot;
  if (!loot || typeof loot !== "object" || Array.isArray(loot))
    throw Error(localeText.message_344d3c0);
  const legacy = loot.version === undefined || loot.version === 1;
  if (!legacy && loot.version !== 2) throw Error(localeText.message_23cbdbe);
  if (
    legacy &&
    (loot.schemes !== undefined || !Object.hasOwn(loot, "settings"))
  )
    throw Error(localeText.message_344d3c0);
  const source = legacy
    ? [
        {
          id: "legacy",
          name: "Loot",
          settings: loot.settings,
          lastRunAt: loot.lastRunAt ?? null,
        },
      ]
    : loot.schemes;
  if (!Array.isArray(source) || source.length > 100)
    throw Error(localeText.message_344d3c0);
  const ids = new Set();
  const schemes = source.map((scheme) => {
    if (
      !scheme ||
      typeof scheme !== "object" ||
      Array.isArray(scheme) ||
      !validId(scheme.id) ||
      ids.has(scheme.id)
    )
      throw Error(localeText.message_8272ee1);
    ids.add(scheme.id);
    if (
      !scheme.settings ||
      typeof scheme.settings !== "object" ||
      Array.isArray(scheme.settings)
    )
      throw Error(localeText.message_c24ad1a);
    if (
      scheme.lastRunAt !== null &&
      (typeof scheme.lastRunAt !== "string" ||
        !Number.isFinite(Date.parse(scheme.lastRunAt)))
    )
      throw Error(localeText.message_9076f72);
    return {
      id: scheme.id,
      name: schemeName(scheme.name),
      settings: normalizeLootSettings(scheme.settings),
      lastRunAt: scheme.lastRunAt,
    };
  });
  validateLootJournal(loot.journal);
  for (const entry of loot.journal)
    if (entry.schemeId !== undefined && !validId(entry.schemeId))
      throw Error(localeText.message_447cd21);
  // Validate every field before committing migration. Journal object identity is
  // retained because active reconciliations may hold references to its entries.
  if (legacy)
    for (const entry of loot.journal)
      if (entry.schemeId === undefined) entry.schemeId = "legacy";
  loot.version = 2;
  loot.schemes = legacy ? schemes : source;
  if (!legacy)
    schemes.forEach((scheme, index) => Object.assign(source[index], scheme));
  delete loot.settings;
  delete loot.lastRunAt;
  return loot;
}
function findLootScheme(data, id) {
  const scheme = ensureLootSchemes(data).schemes.find(
    (entry) => entry.id === id,
  );
  if (!scheme) throw Error(localeText.message_21a7950);
  return scheme;
}
function lootWarehouseEntries(data) {
  return ensureLootSchemes(data).schemes.flatMap(
    (scheme) => scheme.settings.warehouses,
  );
}
function createLootScheme(data, { name, settings } = {}) {
  const loot = ensureLootSchemes(data);
  if (loot.schemes.length >= 100) throw Error(localeText.message_7877eac);
  const scheme = {
    id: randomUUID(),
    name: schemeName(name),
    settings: normalizeLootSettings(settings),
    lastRunAt: null,
  };
  loot.schemes.push(scheme);
  return scheme;
}
function updateLootScheme(data, id, input) {
  const scheme = findLootScheme(data, id);
  const name = input.name === undefined ? scheme.name : schemeName(input.name);
  const settings =
    input.settings === undefined
      ? scheme.settings
      : normalizeLootSettings(input.settings);
  Object.assign(scheme, { name, settings });
  return scheme;
}
function renameLootScheme(data, id, name) {
  return updateLootScheme(data, id, { name });
}
function removeLootScheme(data, id) {
  const scheme = findLootScheme(data, id);
  data.loot.schemes = data.loot.schemes.filter((entry) => entry.id !== id);
  return scheme;
}
module.exports = {
  ensureLootSchemes,
  findLootScheme,
  lootWarehouseEntries,
  createLootScheme,
  updateLootScheme,
  renameLootScheme,
  removeLootScheme,
};
