"use strict";
const localeText = require("../locales/application.json");
const SOURCES = new Set([
  "unknown",
  "steam-profile-xml",
  "steam-web-api",
  "steam-client",
  "mixed",
]);
function normalizeAccountBans(value) {
  if (value === undefined)
    return {
      vac: null,
      community: null,
      game: null,
      checkedAt: null,
      source: "unknown",
    };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![true, false, null].includes(value.vac) ||
    ![true, false, null].includes(value.community) ||
    (value.game !== undefined && ![true, false, null].includes(value.game)) ||
    !SOURCES.has(value.source) ||
    !(
      value.checkedAt === null ||
      (typeof value.checkedAt === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(value.checkedAt) &&
        Number.isFinite(Date.parse(value.checkedAt)))
    )
  )
    throw Error(localeText.message);
  return {
    vac: value.vac,
    community: value.community,
    game: value.game ?? null,
    checkedAt: value.checkedAt,
    source: value.source,
  };
}
// Only direct XML profile fields are evidence. CDATA summaries, comments and
// nested user content cannot provide a VAC flag or impersonate the profile ID.
function profileBansFromXml(body, steamId) {
  if (
    !Buffer.isBuffer(body) ||
    body.length > 256 * 1024 ||
    !/^765\d{14}$/.test(steamId)
  )
    return null;
  const xml = body.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const stack = [],
    fields = new Map();
  let cursor = 0,
    root = 0;
  const tokens =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z][^>]*>/g;
  for (const match of xml.matchAll(tokens)) {
    const text = xml.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    if (stack.length === 2 && stack[0] === "profile") {
      const field = stack[1];
      fields.set(field, (fields.get(field) || "") + text);
    }
    const token = match[0];
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) {
      // No canonical status field uses CDATA. Ignore all user supplied CDATA.
      if (stack.length === 2 && ["steamID64", "vacBanned"].includes(stack[1]))
        return null;
      continue;
    }
    const closing = /^<\//.test(token),
      name = /^<\/?([A-Za-z][\w:-]*)/.exec(token)?.[1];
    if (closing) {
      if (stack.pop() !== name) return null;
    } else {
      if (!stack.length) {
        if (name !== "profile" || ++root !== 1) return null;
      }
      if (stack.length === 1 && fields.has(name)) return null;
      if (!token.endsWith("/>")) stack.push(name);
      if (stack.length > 20) return null;
    }
  }
  if (stack.length || root !== 1 || fields.get("steamID64")?.trim() !== steamId)
    return null;
  const raw = fields.get("vacBanned")?.trim();
  if (raw !== "0" && raw !== "1") return null;
  // tradeBanState is an economy/trade restriction, never CommunityBanned.
  return {
    vac: raw === "1",
    community: null,
    game: null,
    source: "steam-profile-xml",
  };
}
function playerBansFromApi(payload, steamId) {
  if (
    !payload ||
    !Array.isArray(payload.players) ||
    payload.players.length > 100
  )
    return null;
  const matches = payload.players.filter(
    (player) => player?.SteamId === steamId,
  );
  if (
    matches.length !== 1 ||
    typeof matches[0].VACBanned !== "boolean" ||
    typeof matches[0].CommunityBanned !== "boolean"
  )
    return null;
  return {
    vac: matches[0].VACBanned,
    community: matches[0].CommunityBanned,
    game:
      Number.isSafeInteger(matches[0].NumberOfGameBans) &&
      matches[0].NumberOfGameBans >= 0
        ? matches[0].NumberOfGameBans > 0
        : null,
    source: "steam-web-api",
  };
}
function mergeAccountBans(previous, observation, now = Date.now()) {
  const prior = normalizeAccountBans(previous);
  const flags = ["vac", "community", "game"];
  if (!observation || flags.every((flag) => observation[flag] == null))
    return prior;
  const partial = flags.some((flag) => observation[flag] == null);

  return normalizeAccountBans({
    vac: observation.vac ?? prior.vac,
    community: observation.community ?? prior.community,
    game: observation.game ?? prior.game,
    checkedAt:
      partial &&
      flags.some((flag) => observation[flag] == null && prior[flag] !== null)
        ? prior.checkedAt
        : new Date(now).toISOString(),
    source:
      partial &&
      prior.source !== "unknown" &&
      prior.source !== observation.source
        ? "mixed"
        : observation.source,
  });
}
module.exports = {
  normalizeAccountBans,
  profileBansFromXml,
  playerBansFromApi,
  mergeAccountBans,
};
