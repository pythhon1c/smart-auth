"use strict";
const localeText = require("../locales/application.json");
const {
  createBrowserProfile,
  normalizeBrowserProfile,
} = require("./browser-profile.cjs");

const EDITABLE = new Set([
  "locale",
  "timezoneId",
  "screen",
  "hardwareConcurrency",
  "deviceMemory",
  "canvasMode",
  "audioMode",
  "webglMode",
  "webgpuMode",
  "geolocationMode",
  "webrtcMode",
  "doNotTrack",
  "blockThirdPartyCookies",
]);

// Stage every item before modifying the vault, including lazy profile creation.
function planBrowserProfiles(
  accounts,
  { patch, randomize = false, runningIds = [] } = {},
) {
  if (!Array.isArray(accounts) || !accounts.length || accounts.length > 5000)
    throw Error(localeText.invalidAccountList);
  const active = new Set(runningIds);
  const editing = randomize || patch !== undefined;
  if (editing && accounts.some((account) => active.has(account.id)))
    throw Error(localeText.closeTheSelectedAccountsBrowsersFirst);
  if (
    patch !== undefined &&
    (!patch ||
      typeof patch !== "object" ||
      Array.isArray(patch) ||
      Object.getPrototypeOf(patch) !== Object.prototype ||
      !Object.keys(patch).length ||
      Object.keys(patch).some((key) => !EDITABLE.has(key)))
  )
    throw Error(localeText.invalidBrowserProfileSettings);
  if (randomize && patch !== undefined) throw Error(localeText.message_f4fa415);

  return accounts.map((account) => {
    const previous =
      account.browserProfile === undefined
        ? undefined
        : normalizeBrowserProfile(account.browserProfile);
    let profile = previous || createBrowserProfile();
    if (randomize && previous) profile = createBrowserProfile(previous);
    if (patch !== undefined) {
      const candidate = normalizeBrowserProfile({ ...profile, ...patch });
      if (JSON.stringify(candidate) !== JSON.stringify(profile)) {
        candidate.generation = profile.generation + 1;
        candidate.updatedAt = new Date(
          Math.max(Date.now(), Date.parse(profile.updatedAt)),
        ).toISOString();
        profile = normalizeBrowserProfile(candidate);
      }
    }
    return {
      account,
      profile,
      changed:
        !previous || JSON.stringify(previous) !== JSON.stringify(profile),
      running: active.has(account.id),
    };
  });
}
module.exports = { planBrowserProfiles };
