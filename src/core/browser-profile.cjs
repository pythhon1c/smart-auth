"use strict";
const crypto = require("node:crypto");
const SCREENS = [
  [1366, 768],
  [1536, 864],
  [1600, 900],
  [1920, 1080],
  [1920, 1200],
  [2560, 1440],
];
const CPUS = [2, 4, 8, 12, 16],
  MEMORY = [2, 4, 8];
const FIELDS =
  "version id seed generation createdAt updatedAt locale timezoneId screen hardwareConcurrency deviceMemory canvasMode audioMode webglMode webgpuMode geolocationMode webrtcMode doNotTrack blockThirdPartyCookies".split(
    " ",
  );
function object(value, fields) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== fields.length ||
    Object.keys(value).some((k) => !fields.includes(k))
  )
    throw Error("Invalid browser profile fields.");
}
function normalizeBrowserProfile(value) {
  object(value, FIELDS);
  const fail = () => {
    throw Error("Invalid browser profile.");
  };
  if (
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value.id,
    ) ||
    typeof value.seed !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.seed) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1
  )
    fail();
  for (const k of ["createdAt", "updatedAt"])
    if (
      typeof value[k] !== "string" ||
      !Number.isFinite(Date.parse(value[k])) ||
      new Date(value[k]).toISOString() !== value[k]
    )
      fail();
  if (value.updatedAt < value.createdAt) fail();
  if (typeof value.locale !== "string" || typeof value.timezoneId !== "string")
    fail();
  if (value.locale !== "system") {
    try {
      if (Intl.DateTimeFormat.supportedLocalesOf([value.locale]).length !== 1)
        fail();
    } catch {
      fail();
    }
  }
  if (value.timezoneId !== "system") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.timezoneId });
    } catch {
      fail();
    }
  }
  object(value.screen, ["width", "height"]);
  if (
    !Number.isInteger(value.screen.width) ||
    !Number.isInteger(value.screen.height) ||
    value.screen.width < 800 ||
    value.screen.width > 7680 ||
    value.screen.height < 600 ||
    value.screen.height > 4320 ||
    !CPUS.includes(value.hardwareConcurrency) ||
    !MEMORY.includes(value.deviceMemory)
  )
    fail();
  for (const [key, allowed] of Object.entries({
    canvasMode: ["native", "noise"],
    audioMode: ["native", "noise"],
    webglMode: ["native", "disabled"],
    webgpuMode: ["native", "disabled"],
    geolocationMode: ["block", "ask"],
    webrtcMode: ["protected", "disabled"],
  }))
    if (!allowed.includes(value[key])) fail();
  for (const k of ["doNotTrack", "blockThirdPartyCookies"])
    if (typeof value[k] !== "boolean") fail();
  return { ...value, screen: { ...value.screen } };
}
const choose = (values) => values[crypto.randomInt(values.length)];
function createBrowserProfile(previous) {
  const old = previous === undefined ? null : normalizeBrowserProfile(previous);
  if (old?.generation === Number.MAX_SAFE_INTEGER)
    throw Error("Browser profile generation exhausted.");
  const now = new Date(
    Math.max(Date.now(), old ? Date.parse(old.updatedAt) : 0),
  ).toISOString();
  let screen, cpu, memory;
  do {
    screen = choose(SCREENS);
  } while (
    old &&
    screen[0] === old.screen.width &&
    screen[1] === old.screen.height
  );
  do {
    cpu = choose(CPUS);
  } while (old && cpu === old.hardwareConcurrency);
  do {
    memory = choose(MEMORY);
  } while (old && memory === old.deviceMemory);
  return normalizeBrowserProfile({
    version: 1,
    id: old?.id || crypto.randomUUID(),
    createdAt: old?.createdAt || now,
    locale: "system",
    timezoneId: "system",
    canvasMode: "noise",
    audioMode: "noise",
    webglMode: "native",
    webgpuMode: "native",
    geolocationMode: "block",
    webrtcMode: "protected",
    doNotTrack: false,
    blockThirdPartyCookies: true,
    ...(old || {}),
    generation: (old?.generation || 0) + 1,
    updatedAt: now,
    seed: crypto.randomBytes(32).toString("hex"),
    screen: { width: screen[0], height: screen[1] },
    hardwareConcurrency: cpu,
    deviceMemory: memory,
  });
}
function browserProfileLaunchOptions(value, { locale, colorScheme } = {}) {
  const p = normalizeBrowserProfile(value);
  const result = { viewport: null };
  if (p.locale !== "system") result.locale = p.locale;
  else if (locale) result.locale = locale;
  if (p.timezoneId !== "system") result.timezoneId = p.timezoneId;
  if (colorScheme !== undefined) result.colorScheme = colorScheme;
  return result;
}
// Document-level protections only. Native UA, OS, graphics identity and automation
// signals stay intact. Network WebRTC routing is enforced by the runtime policy.
function installProfile(p) {
  // Keep browser UI and extension documents native. Inherited web documents
  // (blank/srcdoc frames and blob URLs) use their effective security origin.
  const protocol = globalThis.location?.protocol;
  const inheritedWebDocument =
    ((protocol === "about:" &&
      /^about:(blank|srcdoc)(?:[?#]|$)/.test(globalThis.location.href)) ||
      protocol === "blob:") &&
    /^https?:\/\//.test(globalThis.origin || "");
  if (protocol !== "http:" && protocol !== "https:" && !inheritedWebDocument)
    return;
  const define = (target, key, value) => {
    if (target)
      Object.defineProperty(target, key, {
        configurable: true,
        get: () => value,
      });
  };
  // Screen fingerprint values never control the native window or layout.
  for (const [key, value] of Object.entries({
    width: p.screen.width,
    height: p.screen.height,
    availWidth: p.screen.width,
    availHeight: p.screen.height,
  }))
    define(globalThis.Screen?.prototype, key, value);
  define(
    globalThis.Navigator?.prototype,
    "hardwareConcurrency",
    p.hardwareConcurrency,
  );
  define(globalThis.Navigator?.prototype, "deviceMemory", p.deviceMemory);
  define(
    globalThis.Navigator?.prototype,
    "doNotTrack",
    p.doNotTrack ? "1" : null,
  );
  let seed = 2166136261;
  for (const char of p.seed)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const noise = (i) => {
    let n = (i ^ seed) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 2246822507);
    n = Math.imul(n ^ (n >>> 13), 3266489909);
    return (n ^ (n >>> 16)) & 1 ? 1 : -1;
  };
  const pixels = (data) => {
    for (let i = 0; i < data.length; i += 4)
      data[i] = Math.max(0, Math.min(255, data[i] + noise(i)));
    return data;
  };
  if (p.canvasMode === "noise" && globalThis.CanvasRenderingContext2D) {
    const proto = CanvasRenderingContext2D.prototype,
      read = proto.getImageData;
    proto.getImageData = function (...args) {
      const image = Reflect.apply(read, this, args);
      pixels(image.data);
      return image;
    };
    if (globalThis.HTMLCanvasElement) {
      const canvasProto = HTMLCanvasElement.prototype;
      for (const key of ["toDataURL", "toBlob"]) {
        const original = canvasProto[key];
        canvasProto[key] = function (...args) {
          if (!this.width || !this.height)
            return Reflect.apply(original, this, args);
          const copy = document.createElement("canvas");
          copy.width = this.width;
          copy.height = this.height;
          const ctx = copy.getContext("2d");
          ctx.drawImage(this, 0, 0);
          const image = Reflect.apply(read, ctx, [
            0,
            0,
            copy.width,
            copy.height,
          ]);
          pixels(image.data);
          ctx.putImageData(image, 0, 0);
          return Reflect.apply(original, copy, args);
        };
      }
    }
  }
  if (p.audioMode === "noise" && globalThis.AudioBuffer) {
    const touched = new WeakSet(),
      proto = AudioBuffer.prototype,
      original = proto.getChannelData;
    proto.getChannelData = function (...args) {
      const data = Reflect.apply(original, this, args);
      if (!touched.has(data)) {
        for (let i = 0; i < data.length; i += 100) data[i] += noise(i) * 1e-7;
        touched.add(data);
      }
      return data;
    };
  }
  if (p.webglMode === "disabled")
    for (const type of [
      globalThis.HTMLCanvasElement,
      globalThis.OffscreenCanvas,
    ]) {
      if (!type) continue;
      const original = type.prototype.getContext;
      type.prototype.getContext = function (type, ...args) {
        return /^(webgl2?|experimental-webgl)$/i.test(String(type))
          ? null
          : Reflect.apply(original, this, [type, ...args]);
      };
    }
  if (p.webgpuMode === "disabled")
    define(globalThis.Navigator?.prototype, "gpu", undefined);
  if (p.webrtcMode === "disabled")
    for (const key of ["RTCPeerConnection", "webkitRTCPeerConnection"])
      if (key in globalThis) define(globalThis, key, undefined);
  if (p.geolocationMode === "block") {
    const denied = (_success, error) => {
      if (typeof error === "function")
        queueMicrotask(() =>
          error({
            code: 1,
            PERMISSION_DENIED: 1,
            message: "Geolocation blocked by browser profile.",
          }),
        );
    };
    define(globalThis.Navigator?.prototype, "geolocation", {
      getCurrentPosition: denied,
      watchPosition(...args) {
        denied(...args);
        return 0;
      },
      clearWatch() {},
    });
  }
}
async function applyBrowserProfile(context, value) {
  const profile = normalizeBrowserProfile(value);
  if (!context || typeof context.addInitScript !== "function")
    throw Error("A browser context is required.");
  await context.addInitScript(installProfile, profile);
}
module.exports = {
  createBrowserProfile,
  normalizeBrowserProfile,
  browserProfileLaunchOptions,
  applyBrowserProfile,
};
