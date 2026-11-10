"use strict";
const MAX_AVATAR_BYTES = 256 * 1024;
const MAX_XML_BYTES = 256 * 1024;
const AVATAR_HOSTS = new Set([
  "avatars.steamstatic.com",
  "avatars.fastly.steamstatic.com",
  "avatars.cloudflare.steamstatic.com",
  "steamcdn-a.akamaihd.net",
]);
function avatarUrl(value) {
  if (typeof value !== "string" || value.length > 512) return null;
  let u;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.search ||
    u.hash ||
    !AVATAR_HOSTS.has(u.hostname)
  )
    return null;
  const modern = /^\/([a-f0-9]{40})(?:_full)?\.(jpg|png|gif|webp)$/.test(
    u.pathname,
  );
  const legacy =
    /^\/steamcommunity\/public\/images\/avatars\/([a-f0-9]{2})\/([a-f0-9]{40})(?:_full)?\.(jpg|png|gif|webp)$/.exec(
      u.pathname,
    );
  if (
    u.hostname === "steamcdn-a.akamaihd.net"
      ? !legacy || legacy[1] !== legacy[2].slice(0, 2)
      : !modern
  )
    return null;
  return u.href;
}
function avatarFromXml(body, steamId) {
  if (
    !Buffer.isBuffer(body) ||
    body.length > MAX_XML_BYTES ||
    !/^765\d{14}$/.test(steamId)
  )
    return null;
  const xml = body.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const values = (tag) =>
    [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g"))].map(
      (m) =>
        m[1]
          .trim()
          .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
          .trim(),
    );
  const ids = values("steamID64"),
    avatars = values("avatarFull");
  if (ids.length !== 1 || ids[0] !== steamId || avatars.length !== 1)
    return null;
  return avatarUrl(avatars[0]);
}
function imageMime(body) {
  if (
    !Buffer.isBuffer(body) ||
    body.length < 12 ||
    body.length > MAX_AVATAR_BYTES
  )
    return null;
  if (
    body
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    body.length >= 33 &&
    body.toString("ascii", 12, 16) === "IHDR"
  ) {
    const w = body.readUInt32BE(16),
      h = body.readUInt32BE(20);
    return w > 0 && h > 0 && w <= 4096 && h <= 4096 ? "image/png" : null;
  }
  if (
    body[0] === 255 &&
    body[1] === 216 &&
    body[2] === 255 &&
    body[body.length - 2] === 255 &&
    body[body.length - 1] === 217
  )
    return "image/jpeg";
  if (/^GIF8[79]a$/.test(body.toString("ascii", 0, 6))) {
    const w = body.readUInt16LE(6),
      h = body.readUInt16LE(8);
    return w > 0 && h > 0 && w <= 4096 && h <= 4096 ? "image/gif" : null;
  }
  if (
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP" &&
    body.length >= 20 &&
    body.readUInt32LE(4) + 8 === body.length &&
    /^(VP8 |VP8L|VP8X)$/.test(body.toString("ascii", 12, 16))
  )
    return "image/webp";
  return null;
}
function imageDataUrl(body, contentType) {
  const mime = imageMime(body);
  if (
    !mime ||
    (contentType &&
      String(contentType).split(";")[0].trim().toLowerCase() !== mime)
  )
    return null;
  return `data:${mime};base64,${body.toString("base64")}`;
}
function safeAvatarDataUrl(value) {
  if (
    typeof value !== "string" ||
    value.length > (MAX_AVATAR_BYTES * 4) / 3 + 64
  )
    return null;
  const m =
    /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    );
  if (!m) return null;
  const body = Buffer.from(m[2], "base64");
  return body.toString("base64") === m[2] && imageDataUrl(body, m[1]) === value
    ? value
    : null;
}
function updateAvatarCache(account, dataUrl, updatedAt = Date.now()) {
  const safe = safeAvatarDataUrl(dataUrl);
  if (!safe || !Number.isSafeInteger(updatedAt) || updatedAt < 0) return false;
  account.avatar = { dataUrl: safe, updatedAt };
  return true;
}
const cachedChecks = new WeakMap();
function safeCachedAvatar(cache) {
  if (!cache || typeof cache !== "object") return null;
  const prior = cachedChecks.get(cache);
  if (prior && prior.input === cache.dataUrl) return prior.value;
  const value = safeAvatarDataUrl(cache.dataUrl);
  cachedChecks.set(cache, { input: cache.dataUrl, value });
  return value;
}
module.exports = {
  validatedAvatarUrl: avatarUrl,
  safeCachedAvatar,
  MAX_AVATAR_BYTES,
  MAX_XML_BYTES,
  AVATAR_HOSTS,
  avatarUrl,
  avatarFromXml,
  imageDataUrl,
  safeAvatarDataUrl,
  updateAvatarCache,
};
