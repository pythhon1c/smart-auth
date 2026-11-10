"use strict";
const localeText = require("../locales/application.json");
// Independent implementation: all secrets live only inside the caller's encrypted
// payload. Renderer-facing metadata is built from an explicit whitelist.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const LIMITS = Object.freeze({
  entries: 2000,
  folders: 256,
  fields: 32,
  history: 20,
  currentBytes: 192 * 1024,
  entryBytes: 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
  nodes: 80000,
});
const FOLDER_KEYS = ["id", "name", "createdAt", "updatedAt"];
const RECORD_KEYS = [
  "id",
  "revision",
  "title",
  "username",
  "url",
  "folderId",
  "tags",
  "favorite",
  "password",
  "notes",
  "fields",
  "createdAt",
  "updatedAt",
  "deletedAt",
];
const ENTRY_INPUT = [
  "id",
  "revision",
  "title",
  "username",
  "url",
  "folderId",
  "tags",
  "favorite",
  "password",
  "notes",
  "fields",
];
const FIELD_KEYS = ["id", "label", "protected", "value"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function fail(message = localeText.message_abfcee9) {
  throw Error(message);
}
function object(value, keys, required = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail();
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  ))
    if (!keys.includes(key) || descriptor.get || descriptor.set) fail();
  if (required.some((key) => !Object.hasOwn(value, key))) fail();
  return value;
}
function inspect(
  value,
  { allowUndefined = false } = {},
  state = { nodes: 0 },
  depth = 0,
) {
  if (++state.nodes > LIMITS.nodes || depth > 16) fail();
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (allowUndefined && value === undefined)
  )
    return;
  if (typeof value === "string") {
    if (value.length > LIMITS.entryBytes) fail();
    return;
  }
  if (
    !value ||
    typeof value !== "object" ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  )
    fail();
  if (Array.isArray(value) && value.length > LIMITS.entries) fail();
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (Array.isArray(value) && key === "length") continue;
    if (
      ["__proto__", "prototype", "constructor"].includes(key) ||
      descriptor.get ||
      descriptor.set
    )
      fail();
    inspect(descriptor.value, { allowUndefined }, state, depth + 1);
  }
}
function request(value, keys) {
  inspect(value, { allowUndefined: true });
  return object(value, keys);
}
function text(
  value,
  max,
  { trim = false, empty = true, metadata = false } = {},
) {
  if (typeof value !== "string") fail();
  const result = trim ? value.trim() : value;
  if (
    result.length > max ||
    (!empty && !result) ||
    (metadata && /[\x00-\x1f\x7f]/.test(result))
  )
    fail();
  return result;
}
function id(value) {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}
function revision(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value >= Number.MAX_SAFE_INTEGER
  )
    fail();
  return value;
}
function timestamp(value) {
  if (
    typeof value !== "string" ||
    value.length !== 24 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail();
  return value;
}
function url(value) {
  const raw = text(value, 2048, { trim: true });
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(localeText.message_8e5d73a);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.href.length > 2048
  )
    fail(localeText.message_8e5d73a);
  return parsed.href;
}
function tags(value) {
  if (!Array.isArray(value) || value.length > 32) fail();
  const result = [];
  const seen = new Set();
  for (const tag of value) {
    const normalized = text(tag, 64, {
      trim: true,
      empty: false,
      metadata: true,
    });
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}
function field(value) {
  object(value, FIELD_KEYS, FIELD_KEYS);
  id(value.id);
  if (
    text(value.label, 120, { trim: true, empty: false, metadata: true }) !==
    value.label
  )
    fail();
  if (typeof value.protected !== "boolean") fail();
  text(value.value, 16384);
}
function validateRecord(value, folders, { historical = false } = {}) {
  object(value, RECORD_KEYS, RECORD_KEYS);
  id(value.id);
  revision(value.revision);
  if (
    text(value.title, 200, { trim: true, empty: false, metadata: true }) !==
    value.title
  )
    fail();
  text(value.username, 512, { metadata: true });
  if (url(value.url) !== value.url) fail();
  if (value.folderId !== null) {
    id(value.folderId);
    if (!historical && !folders.has(value.folderId)) fail();
  }
  if (
    JSON.stringify(tags(value.tags)) !== JSON.stringify(value.tags) ||
    typeof value.favorite !== "boolean"
  )
    fail();
  text(value.password, 16384);
  text(value.notes, 65536);
  timestamp(value.createdAt);
  timestamp(value.updatedAt);
  if (value.deletedAt !== null) timestamp(value.deletedAt);
  if (!Array.isArray(value.fields) || value.fields.length > LIMITS.fields)
    fail();
  const ids = new Set();
  for (const item of value.fields) {
    field(item);
    if (ids.has(item.id)) fail();
    ids.add(item.id);
  }
  if (Buffer.byteLength(JSON.stringify(value)) > LIMITS.currentBytes)
    fail(localeText.message_7e4cb60);
}
function validate(storage) {
  inspect(storage);
  object(
    storage,
    ["version", "folders", "entries"],
    ["version", "folders", "entries"],
  );
  if (
    storage.version !== 1 ||
    !Array.isArray(storage.folders) ||
    storage.folders.length > LIMITS.folders ||
    !Array.isArray(storage.entries) ||
    storage.entries.length > LIMITS.entries
  )
    fail();
  const folderIds = new Set(),
    names = new Set(),
    entryIds = new Set();
  for (const folder of storage.folders) {
    object(folder, FOLDER_KEYS, FOLDER_KEYS);
    id(folder.id);
    if (
      text(folder.name, 120, { trim: true, empty: false, metadata: true }) !==
      folder.name
    )
      fail();
    timestamp(folder.createdAt);
    timestamp(folder.updatedAt);
    const name = folder.name.toLowerCase();
    if (folderIds.has(folder.id) || names.has(name)) fail();
    folderIds.add(folder.id);
    names.add(name);
  }
  for (const entry of storage.entries) {
    object(entry, [...RECORD_KEYS, "history"], [...RECORD_KEYS, "history"]);
    const { history, ...record } = entry;
    validateRecord(record, folderIds);
    if (entryIds.has(entry.id)) fail();
    entryIds.add(entry.id);
    if (!Array.isArray(history) || history.length > LIMITS.history) fail();
    let previous = 0;
    for (const prior of history) {
      validateRecord(prior, folderIds, { historical: true });
      if (
        prior.id !== entry.id ||
        prior.createdAt !== entry.createdAt ||
        prior.revision <= previous ||
        prior.revision >= entry.revision
      )
        fail();
      previous = prior.revision;
    }
    if (Buffer.byteLength(JSON.stringify(entry)) > LIMITS.entryBytes)
      fail(localeText.message_7e4cb60);
  }
  if (Buffer.byteLength(JSON.stringify(storage)) > LIMITS.totalBytes)
    fail(localeText.message_f12eb74);
  return storage;
}
function record(entry) {
  const { history, ...value } = entry;
  return structuredClone(value);
}
function sameContent(left, right) {
  return [
    "title",
    "username",
    "url",
    "folderId",
    "tags",
    "favorite",
    "password",
    "notes",
    "fields",
    "deletedAt",
  ].every((key) => isDeepStrictEqual(left[key], right[key]));
}
function metadata(entry) {
  return {
    id: entry.id,
    revision: entry.revision,
    title: entry.title,
    username: entry.username,
    url: entry.url,
    folderId: entry.folderId,
    tags: [...entry.tags],
    favorite: entry.favorite,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    hasPassword: Boolean(entry.password),
    hasNotes: Boolean(entry.notes),
    fields: entry.fields.map((item) => ({
      id: item.id,
      label: item.label,
      protected: item.protected,
      hasValue: Boolean(item.value),
    })),
    history: entry.history.map((prior) => ({
      revision: prior.revision,
      updatedAt: prior.updatedAt,
    })),
  };
}
function changed(before, next) {
  next.revision = before.revision + 1;
  revision(next.revision);
  next.updatedAt = new Date().toISOString();
  next.history = [...before.history, record(before)].slice(-LIMITS.history);
  while (
    next.history.length &&
    Buffer.byteLength(JSON.stringify(next)) > LIMITS.entryBytes
  )
    next.history.shift();
  return next;
}
class PasswordManager {
  constructor({ getData, persist } = {}) {
    if (typeof getData !== "function" || typeof persist !== "function") fail();
    this.getData = getData;
    this.persist = persist;
  }
  _read(data = this.getData()) {
    return data.passwordManager === undefined
      ? { version: 1, folders: [], entries: [] }
      : validate(data.passwordManager);
  }
  _transaction(task) {
    const data = this.getData(),
      source = this._read(data),
      next = structuredClone(source),
      result = task(next);
    validate(next);
    if (isDeepStrictEqual(source, next)) return result;
    const existed = Object.hasOwn(data, "passwordManager"),
      previous = data.passwordManager;
    data.passwordManager = next;
    try {
      const saved = this.persist();
      if (saved && typeof saved.then === "function")
        fail(localeText.message_9a57c2b);
    } catch (error) {
      let current;
      try {
        current = this.getData();
      } catch {}
      if (current === data) {
        if (existed) data.passwordManager = previous;
        else delete data.passwordManager;
      }
      throw error;
    }
    return result;
  }
  _entry(storage, p) {
    id(p.id);
    revision(p.revision);
    const entry = storage.entries.find((entry) => entry.id === p.id);
    if (!entry) fail(localeText.message_2387c17);
    if (entry.revision !== p.revision) fail(localeText.message_4b42de6);
    return entry;
  }
  snapshot() {
    const storage = this._read();
    return {
      folders: storage.folders.map((folder) => ({ ...folder })),
      entries: storage.entries.map(metadata),
    };
  }
  saveFolder(p) {
    request(p, ["id", "name"]);
    return this._transaction((storage) => {
      const name = text(p.name, 120, {
        trim: true,
        empty: false,
        metadata: true,
      });
      let folder =
        p.id === undefined
          ? null
          : storage.folders.find((folder) => folder.id === id(p.id));
      if (p.id !== undefined && !folder) fail(localeText.message_b0c9f84);
      if (
        storage.folders.some(
          (existing) =>
            existing.id !== folder?.id &&
            existing.name.toLowerCase() === name.toLowerCase(),
        )
      )
        fail(localeText.aFolderWithThisNameAlreadyExists);
      const now = new Date().toISOString();
      if (folder) {
        folder.name = name;
        folder.updatedAt = now;
      } else {
        if (storage.folders.length >= LIMITS.folders) fail();
        folder = {
          id: crypto.randomUUID(),
          name,
          createdAt: now,
          updatedAt: now,
        };
        storage.folders.push(folder);
      }
      return { ...folder };
    });
  }
  deleteFolder(p) {
    request(p, ["id"]);
    id(p.id);
    return this._transaction((storage) => {
      if (!storage.folders.some((folder) => folder.id === p.id))
        fail(localeText.message_b0c9f84);
      storage.folders = storage.folders.filter((folder) => folder.id !== p.id);
      for (let i = 0; i < storage.entries.length; i++) {
        const entry = storage.entries[i];
        if (entry.folderId === p.id)
          storage.entries[i] = changed(entry, {
            ...record(entry),
            folderId: null,
          });
      }
      return { deleted: true };
    });
  }
  saveEntry(p) {
    request(p, ENTRY_INPUT);
    return this._transaction((storage) => {
      const prior = p.id === undefined ? null : this._entry(storage, p);
      if (prior?.deletedAt !== null && prior)
        fail(localeText.restoreThisEntryFromTheRecycleBinFirst);
      if (!prior && p.revision !== undefined) fail();
      const now = new Date().toISOString();
      const selected = (key, fallback) =>
        p[key] === undefined ? (prior?.[key] ?? fallback) : p[key];
      const folderId = selected("folderId", null);
      if (
        folderId !== null &&
        !storage.folders.some((folder) => folder.id === id(folderId))
      )
        fail(localeText.message_b0c9f84);
      let fields = prior ? structuredClone(prior.fields) : [];
      if (p.fields !== undefined) {
        if (!Array.isArray(p.fields) || p.fields.length > LIMITS.fields) fail();
        const used = new Set();
        fields = p.fields.map((item) => {
          object(item, FIELD_KEYS, ["label", "protected"]);
          let old = null;
          if (item.id !== undefined) {
            id(item.id);
            old = prior?.fields.find((field) => field.id === item.id);
            if (!old) fail(localeText.message_b16fc7a);
          }
          const fieldId = old?.id || crypto.randomUUID();
          if (used.has(fieldId)) fail();
          used.add(fieldId);
          if (typeof item.protected !== "boolean") fail();
          return {
            id: fieldId,
            label: text(item.label, 120, {
              trim: true,
              empty: false,
              metadata: true,
            }),
            protected: item.protected,
            value:
              item.value === undefined
                ? (old?.value ?? "")
                : text(item.value, 16384),
          };
        });
      }
      const favorite = selected("favorite", false);
      if (typeof favorite !== "boolean") fail();
      let entry = {
        id: prior?.id || crypto.randomUUID(),
        revision: prior?.revision || 1,
        title: text(selected("title", ""), 200, {
          trim: true,
          empty: false,
          metadata: true,
        }),
        username: text(selected("username", ""), 512, { metadata: true }),
        url: url(selected("url", "")),
        folderId,
        tags: tags(selected("tags", [])),
        favorite,
        password: text(selected("password", ""), 16384),
        notes: text(selected("notes", ""), 65536),
        fields,
        createdAt: prior?.createdAt || now,
        updatedAt: now,
        deletedAt: null,
        history: [],
      };
      if (prior) {
        if (sameContent(prior, entry)) return metadata(prior);
        entry = changed(prior, entry);
        storage.entries[storage.entries.indexOf(prior)] = entry;
      } else {
        if (storage.entries.length >= LIMITS.entries) fail();
        storage.entries.push(entry);
      }
      return metadata(entry);
    });
  }
  revealField(p) {
    request(p, ["id", "revision", "field", "historyRevision"]);
    const storage = this._read(),
      entry = this._entry(storage, p);
    let source = entry;
    if (p.historyRevision !== undefined) {
      revision(p.historyRevision);
      source = entry.history.find(
        (prior) => prior.revision === p.historyRevision,
      );
      if (!source) fail(localeText.message_2c1654c);
    }
    if (p.field === "password" || p.field === "notes")
      return { value: source[p.field] };
    id(p.field);
    const item = source.fields.find((field) => field.id === p.field);
    if (!item) fail(localeText.message_b16fc7a);
    return { value: item.value };
  }
  getField(p) {
    return this.revealField(p);
  }
  deleteEntry(p) {
    request(p, ["id", "revision"]);
    return this._transaction((storage) => {
      const prior = this._entry(storage, p);
      if (prior.deletedAt !== null) fail(localeText.message_49397af);
      const next = changed(prior, {
        ...record(prior),
        deletedAt: new Date().toISOString(),
      });
      storage.entries[storage.entries.indexOf(prior)] = next;
      return metadata(next);
    });
  }
  restoreEntry(p) {
    request(p, ["id", "revision"]);
    return this._transaction((storage) => {
      const prior = this._entry(storage, p);
      if (prior.deletedAt === null) fail(localeText.message_847c94f);
      const next = changed(prior, { ...record(prior), deletedAt: null });
      storage.entries[storage.entries.indexOf(prior)] = next;
      return metadata(next);
    });
  }
  purgeEntry(p) {
    request(p, ["id", "revision"]);
    return this._transaction((storage) => {
      const entry = this._entry(storage, p);
      if (entry.deletedAt === null) fail(localeText.message_1d03edf);
      storage.entries = storage.entries.filter(
        (candidate) => candidate.id !== entry.id,
      );
      return { purged: true };
    });
  }
  restoreHistory(p) {
    request(p, ["id", "revision", "historyRevision"]);
    revision(p.historyRevision);
    return this._transaction((storage) => {
      const entry = this._entry(storage, p);
      if (entry.deletedAt !== null)
        fail(localeText.restoreThisEntryFromTheRecycleBinFirst);
      const prior = entry.history.find(
        (prior) => prior.revision === p.historyRevision,
      );
      if (!prior) fail(localeText.message_2c1654c);
      const restored = {
        ...structuredClone(prior),
        folderId: storage.folders.some((folder) => folder.id === prior.folderId)
          ? prior.folderId
          : null,
        deletedAt: null,
      };
      if (sameContent(entry, restored)) return metadata(entry);
      const next = changed(entry, restored);
      storage.entries[storage.entries.indexOf(entry)] = next;
      return metadata(next);
    });
  }
}
function generateSecret(p = {}) {
  request(p, [
    "kind",
    "length",
    "lower",
    "upper",
    "digits",
    "symbols",
    "excludeAmbiguous",
    "bytes",
  ]);
  const kind = p.kind === undefined ? "password" : p.kind;
  if (kind === "hex" || kind === "base64url") {
    if (
      [
        "length",
        "lower",
        "upper",
        "digits",
        "symbols",
        "excludeAmbiguous",
      ].some((key) => p[key] !== undefined)
    )
      fail(localeText.message_7e7cc08);
    const bytes = p.bytes === undefined ? 32 : p.bytes;
    if (!Number.isInteger(bytes) || bytes < 16 || bytes > 128)
      fail(localeText.message_2a28a7a);
    return { value: crypto.randomBytes(bytes).toString(kind) };
  }
  if (kind !== "password" || p.bytes !== undefined)
    fail(localeText.message_7e7cc08);
  const length = p.length === undefined ? 32 : p.length;
  if (!Number.isInteger(length) || length < 8 || length > 128)
    fail(localeText.message_bfd3a94);
  const groups = {
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digits: "0123456789",
    symbols: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
  };
  if (
    p.excludeAmbiguous !== undefined &&
    typeof p.excludeAmbiguous !== "boolean"
  )
    fail();
  const selected = [];
  for (const [key, characters] of Object.entries(groups)) {
    if (p[key] !== undefined && typeof p[key] !== "boolean") fail();
    if (p[key] !== false)
      selected.push(
        p.excludeAmbiguous
          ? [...characters]
              .filter((character) => !"Il1O0o|".includes(character))
              .join("")
          : characters,
      );
  }
  if (
    !selected.length ||
    selected.some((group) => !group.length) ||
    length < selected.length
  )
    fail(localeText.message_2c4a397);
  const alphabet = selected.join("");
  // Uniform whole-output rejection avoids privileging positions or forcing a
  // biased mandatory prefix while ensuring each requested class is present.
  for (let attempt = 0; attempt < 10000; attempt++) {
    let value = "";
    for (let i = 0; i < length; i++)
      value += alphabet[crypto.randomInt(alphabet.length)];
    if (
      selected.every((group) =>
        [...value].some((character) => group.includes(character)),
      )
    )
      return { value };
  }
  fail(localeText.message_9018d29);
}
module.exports = { PasswordManager, generateSecret, LIMITS };
