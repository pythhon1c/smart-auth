"use strict";
const { OfferRecord } = require("./trade-offer-record.cjs");
const PERMISSIONS = new Set(["FULL", "NONE", "SENDONLY", "RECEIVEONLY", "SENDONLY_FULLINVENTORY"]);
const MAX_JSON = 2 * 1024 * 1024;

function scriptStart(html, at) {
  let cursor = 0, templates = 0;
  function tagEnd(start) {
    let quote = "";
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") return i;
    }
    throw Error();
  }
  while (cursor < at) {
    const open = html.indexOf("<", cursor);
    if (open < 0 || open >= at) break;
    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4);
      if (close < 0) return -1;
      cursor = close + 3; continue;
    }
    const end = tagEnd(open + 1), tag = html.slice(open, end + 1),
      name = /^<([a-z][a-z0-9-]*)(?=[\s>])/i.exec(tag)?.[1]?.toLowerCase();
    if (name === "template") templates++;
    if (/^<\/template(?=[\s>])/i.test(tag)) templates = Math.max(0, templates - 1);
    if (name === "plaintext") return -1;
    if (["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"].includes(name)) {
      const closing = new RegExp("<\\/" + name + "(?=[\\s>])[^>]*>", "ig");
      closing.lastIndex = end + 1;
      const close = closing.exec(html);
      if (!close) return -1;
      if (at > end && at < close.index) {
        if (name !== "script" || templates || /\bsrc\s*=|\bnomodule\b/i.test(tag)) return -1;
        const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
        if (type && !["text/javascript", "application/javascript"].includes((type[1] ?? type[2] ?? type[3]).toLowerCase())) return -1;
        return end + 1;
      }
      cursor = close.index + close[0].length;
    } else cursor = end + 1;
  }
  return -1;
}

function declaration(html, at) {
  const prefix = /\b(?:var|let|const)\s+$/.exec(html.slice(0, at));
  if (!prefix) return false;
  const end = prefix.index, start = scriptStart(html, end);
  if (start < 0) return false;
  let quote = "", escaped = false, comment = "", characterClass = false,
    depth = 0, statement = true;
  for (let i = start; i < end; i++) {
    const c = html[i], next = html[i + 1];
    if (comment === "line") { if (c === "\n" || c === "\r") comment = ""; continue; }
    if (comment === "block") { if (c === "*" && next === "/") { comment = ""; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (quote === "/") {
        if (c === "[") characterClass = true;
        if (c === "]") characterClass = false;
        if (c === "/" && !characterClass) quote = "";
      } else if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && next === "/") { comment = "line"; i++; continue; }
    if (c === "/" && next === "*") { comment = "block"; i++; continue; }
    if (/\s/.test(c)) continue;
    // Treat ambiguous division as a regex too: ambiguity may refuse a page,
    // but must never turn string/comment/regex text into permission evidence.
    if (c === '"' || c === "'" || c === "`" || c === "/") {
      quote = c; characterClass = false; statement = false; continue;
    }
    if ("({[".includes(c)) depth++;
    if (")}]".includes(c)) depth--;
    if (depth < 0) return false;
    statement = c === ";" && depth === 0;
  }
  return !quote && !comment && depth === 0 && statement;
}

// JSON.parse alone silently accepts duplicate keys. Refuse ambiguous permission
// objects, including escaped duplicates, without evaluating any page JavaScript.
function uniqueKeys(text) {
  let at = 0, nodes = 0;
  const space = () => { while (/\s/.test(text[at] || "") && at < text.length) at++; };
  function string() {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") at++;
      else if (char === '"') return JSON.parse(text.slice(start, at));
    }
    throw Error();
  }
  function value(depth) {
    if (depth > 8 || ++nodes > 50000) throw Error();
    space();
    if (text[at] === "{") {
      at++; space();
      const keys = new Set();
      if (text[at] === "}") { at++; return; }
      while (at < text.length) {
        space();
        if (text[at] !== '"') throw Error();
        const key = string();
        if (keys.has(key)) throw Error();
        keys.add(key); space();
        if (text[at++] !== ":") throw Error();
        value(depth + 1); space();
        const delimiter = text[at++];
        if (delimiter === "}") return;
        if (delimiter !== ",") throw Error();
      }
      throw Error();
    }
    if (text[at] === "[") {
      at++; space();
      if (text[at] === "]") { at++; return; }
      while (at < text.length) {
        value(depth + 1); space();
        const delimiter = text[at++];
        if (delimiter === "]") return;
        if (delimiter !== ",") throw Error();
      }
      throw Error();
    }
    if (text[at] === '"') { string(); return; }
    const start = at;
    while (at < text.length && !/[,}\]\s]/.test(text[at])) at++;
    if (at === start) throw Error();
  }
  value(0); space();
  if (at !== text.length) throw Error();
}
function assignment(html, name) {
  const matches = OfferRecord.find(html, new RegExp("\\b" + name + "\\s*=\\s*", "g"));
  if (matches.length !== 1 || !declaration(html, matches[0].index)) throw Error();
  const start = matches[0].index + matches[0][0].length;
  if (html[start] !== "{") throw Error();
  const end = OfferRecord.scan(html, start);
  if (typeof end !== "number" || end - start > MAX_JSON ||
      !/^\s*(?:;|<\/script\s*>)/i.test(html.slice(end, end + 128))) throw Error();
  const text = html.slice(start, end), parsed = JSON.parse(text);
  uniqueKeys(text);
  if (!OfferRecord.plain(parsed)) throw Error();
  return parsed;
}

// The caller must bind both Steam identities on this same page before using it.
function tradePagePermissions(html, appIds) {
  try {
    if (typeof html !== "string" || html.length > OfferRecord.TEXT_MAX ||
        !Array.isArray(appIds) || !appIds.length || appIds.length > 8192) throw Error();
    const source = assignment(html, "g_rgAppContextData"),
      partner = assignment(html, "g_rgPartnerAppContextData");
    for (const appid of new Set(appIds)) {
      if (!Number.isSafeInteger(appid) || appid < 1 || appid > 2147483647) throw Error();
      const permissions = [source, partner].map((apps) => {
        if (!Object.hasOwn(apps, String(appid))) throw Error();
        const app = apps[appid];
        if (!OfferRecord.plain(app) || app.appid !== appid || !PERMISSIONS.has(app.trade_permissions)) throw Error();
        return app.trade_permissions;
      });
      if (!["FULL", "SENDONLY", "SENDONLY_FULLINVENTORY"].includes(permissions[0]))
        return { ok: false, reason: "source", appid };
      if (!["FULL", "RECEIVEONLY"].includes(permissions[1]))
        return { ok: false, reason: "partner", appid };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "unknown" };
  }
}
module.exports = { tradePagePermissions };
