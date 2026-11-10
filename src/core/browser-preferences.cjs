"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { normalizeBrowserSettings } = require("./model.cjs");
// Chromium 151 sources: extensions/browser/pref_names.h;
// chrome/browser/themes/theme_service.h; components/bookmarks/browser/bookmark_codec.cc.
const CHROMIUM_LOCALES = new Set(
  "af am ar bg bn ca cs da de el en-GB en-US es-419 es et fa fi fil fr gu he hi hr hu id it ja kn ko lt lv ml mr ms nb nl pl pt-BR pt-PT ro ru sk sl sr sv sw ta te th tr uk ur vi zh-CN zh-TW".split(
    " ",
  ),
);
function resolveBrowserLocale(locale) {
  try {
    const language = new Intl.Locale(locale);
    const exact = language.baseName;
    if (CHROMIUM_LOCALES.has(exact)) return exact;
    if (language.language === "zh")
      return language.script === "Hant" ||
        ["TW", "HK", "MO"].includes(language.region)
        ? "zh-TW"
        : "zh-CN";
    if (language.language === "pt")
      return language.region === "PT" ? "pt-PT" : "pt-BR";
    if (language.language === "en")
      return language.region === "GB" ? "en-GB" : "en-US";
    if (language.language === "no") return "nb";
    if (CHROMIUM_LOCALES.has(language.language)) return language.language;
  } catch {}
  return "en-US";
}
function bookmarkDocument(bookmarks) {
  const now = ((BigInt(Date.now()) + 11644473600000n) * 1000n).toString();
  const folder = (id, name, guid, children = []) => ({
    id,
    name,
    guid,
    type: "folder",
    date_added: now,
    date_modified: now,
    date_last_used: "0",
    children,
  });
  const roots = {
    bookmark_bar: folder(
      "1",
      "Bookmarks bar",
      "0bc5d13f-2cba-5d74-951f-3f233fe6c908",
      bookmarks.map((bookmark, i) => ({
        id: String(i + 4),
        name: bookmark.title,
        url: bookmark.url,
        type: "url",
        guid: crypto.randomUUID(),
        date_added: now,
        date_last_used: "0",
      })),
    ),
    other: folder(
      "2",
      "Other bookmarks",
      "82b081ec-3dd3-529c-8475-ab6c344590dd",
    ),
    synced: folder(
      "3",
      "Mobile bookmarks",
      "4cf2e351-0e85-532b-bb37-df045d8f8d0f",
    ),
  };
  const md5 = crypto.createHash("md5"),
    sha256 = crypto.createHash("sha256");
  const add = (data) => {
    md5.update(data);
    sha256.update(data);
  };
  const visit = (node) => {
    add(Buffer.from(node.id, "utf8"));
    add(Buffer.from(node.name, "utf16le"));
    add(Buffer.from(node.type, "utf8"));
    if (node.type === "url") add(Buffer.from(node.url, "utf8"));
    else node.children.forEach(visit);
  };
  Object.values(roots).forEach(visit);
  return {
    version: 1,
    checksum: md5.digest("hex"),
    checksum_sha256: sha256.digest("hex"),
    roots,
  };
}
function prepareBrowserPreferences(
  profile,
  settings = {},
  extensions = [],
  {
    systemLocale = Intl.DateTimeFormat().resolvedOptions().locale,
    browserProfile,
  } = {},
) {
  const selected = normalizeBrowserSettings(settings);
  const locale = resolveBrowserLocale(
    selected.browserLanguage === "system"
      ? systemLocale
      : selected.browserLanguage,
  );
  if (typeof profile !== "string" || !profile)
    throw Error("A fresh browser profile is required.");
  const root = path.resolve(profile);
  for (const [target, directory] of [
    [root, true],
    [path.join(root, "Default"), true],
    ...["Local State", "Default/Preferences", "Default/Bookmarks"].map(
      (file) => [path.join(root, file), false],
    ),
  ]) {
    if (fs.existsSync(target)) {
      const stat = fs.lstatSync(target);
      if (
        stat.isSymbolicLink() ||
        (directory ? !stat.isDirectory() : !stat.isFile())
      )
        throw Error("Unsafe browser profile path.");
    }
  }
  if (
    !Array.isArray(extensions) ||
    extensions.some(
      (e) =>
        !e ||
        !/^[a-p]{32}$/.test(e.id) ||
        typeof e.path !== "string" ||
        !e.path,
    )
  )
    throw Error("Verified extension descriptors are required.");
  const pinned = [...new Set(extensions.map((e) => e.id))];
  const owned = {
    extensions: { pinned_extensions: pinned },
    browser: {
      theme: {
        color_scheme2: { system: 0, light: 1, dark: 2 }[selected.browserTheme],
      },
    },
    intl: {
      accept_languages: [locale, locale.split("-")[0]]
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(","),
      selected_languages: locale,
    },
    bookmark_bar: { show_on_all_tabs: selected.browserShowBookmarksBar },
  };
  fs.mkdirSync(path.join(root, "Default"), { recursive: true });
  const read = (file) => {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) return {};
    const value = JSON.parse(fs.readFileSync(target, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Invalid Chromium preferences.");
    return value;
  };
  const merge = (base, patch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (
          !base[key] ||
          typeof base[key] !== "object" ||
          Array.isArray(base[key])
        )
          base[key] = {};
        merge(base[key], value);
      } else base[key] = value;
    }
    return base;
  };
  const preferences = read("Default/Preferences");
  owned.extensions.pinned_extensions = [
    ...new Set([
      ...(preferences.extensions?.pinned_extensions || []),
      ...pinned,
    ]),
  ];
  merge(preferences, owned);
  merge(preferences, {
    enable_do_not_track: browserProfile?.doNotTrack || false,
    session: { restore_on_startup: 5, startup_urls: [] },
    profile: {
      exit_type: "Normal",
      exited_cleanly: true,
      default_content_setting_values: {
        geolocation: browserProfile?.geolocationMode === "ask" ? 3 : 2,
        media_stream_camera: 2,
        media_stream_mic: 2,
      },
      ...(browserProfile
        ? {
            block_third_party_cookies: browserProfile.blockThirdPartyCookies,
            cookie_controls_mode: browserProfile.blockThirdPartyCookies ? 1 : 0,
          }
        : {}),
    },
  });
  if (browserProfile) {
    // Existing per-site grants must not bypass the selected global policy.
    const exceptions = preferences.profile?.content_settings?.exceptions;
    if (exceptions) {
      for (const key of [
        "media_stream_camera",
        "media_stream_mic",
        ...(browserProfile.geolocationMode === "block" ? ["geolocation"] : []),
      ]) {
        if (exceptions[key]) exceptions[key] = {};
      }
    }
  }
  const localState = merge(read("Local State"), {
    intl: { app_locale: locale },
  });
  const bookmarkPath = "Default/Bookmarks";
  const fresh = !fs.existsSync(path.join(root, bookmarkPath));
  const bookmarks = fresh ? bookmarkDocument([]) : read(bookmarkPath);
  const bar = bookmarks.roots?.bookmark_bar;
  if (!bar || !Array.isArray(bar.children))
    throw Error("Invalid Chromium bookmarks.");
  const previous = new Set(preferences.smart_sda?.bookmark_guids || []);
  let maxId = 3;
  const visit = (node) => {
    maxId = Math.max(maxId, Number(node.id) || 0);
    if (Array.isArray(node.children)) {
      node.children = node.children.filter(
        (child) => !previous.has(child.guid),
      );
      node.children.forEach(visit);
    }
  };
  Object.values(bookmarks.roots).forEach(visit);
  const seededDocument = bookmarkDocument(selected.browserBookmarks);
  const seeded = seededDocument.roots.bookmark_bar.children;
  for (const node of seeded) node.id = String(++maxId);
  bar.children.push(...seeded);
  preferences.smart_sda = {
    ...preferences.smart_sda,
    bookmark_guids: seeded.map((node) => node.guid),
  };
  delete bookmarks.checksum;
  delete bookmarks.checksum_sha256;
  if (fresh) {
    bookmarks.checksum = seededDocument.checksum;
    bookmarks.checksum_sha256 = seededDocument.checksum_sha256;
  }
  const write = (file, value) => {
    const target = path.join(root, file),
      temp = target + ".smart-sda-" + crypto.randomUUID();
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    try {
      fs.renameSync(temp, target);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  };
  write("Local State", localState);
  write("Default/Preferences", preferences);
  write(bookmarkPath, bookmarks);
  return {
    args: [`--lang=${locale}`],
    locale,
    colorScheme:
      selected.browserTheme === "system" ? null : selected.browserTheme,
  };
}
module.exports = { prepareBrowserPreferences, resolveBrowserLocale };
