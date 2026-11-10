"use strict";
const localeText = require("../locales/application.json");
// Steam HTML is input data only. Nothing in this module executes or returns HTML.
const { avatarUrl } = require("./avatar.cjs");
const { stackItems, itemMetadata, itemQuantity } = require("./item-stacks.cjs");
// Steam may render all 8192 legal asset rows before grouping. Input, token,
// depth and traversal budgets bound parsing without truncating legal trades.
const MAX_DETAIL_BYTES = 16 * 1024 * 1024;
const IMAGE_HOSTS = new Set([
  "community.steamstatic.com",
  "community.fastly.steamstatic.com",
  "community.cloudflare.steamstatic.com",
  "steamcommunity-a.akamaihd.net",
  "cdn.steamcommunity.com",
  "steamcommunity.com",
]);
function confirmationImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  const avatar = avatarUrl(value);
  if (avatar) return avatar;
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
    !IMAGE_HOSTS.has(u.hostname) ||
    !/^\/economy\/image\/[A-Za-z0-9_=-]+(?:\/\d{1,4}x\d{1,4})?(?:\/\d{1,4})?$/.test(
      u.pathname,
    )
  )
    return null;
  return u.href;
}
function decode(value) {
  return String(value || "").replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (all, code) => {
      const named = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
      };
      if (code[0] !== "#") return named[code.toLowerCase()] || all;
      const n =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : "";
    },
  );
}
function clean(value, max = 500) {
  return decode(value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function tree(html) {
  const root = { tag: "root", attrs: {}, children: [] },
    stack = [root];
  const tokens = html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || [];
  if (tokens.length > 262144)
    throw new Error(localeText.validationMessage_81e0ecb);
  for (const token of tokens) {
    if (token.startsWith("<!--") || /^<!/.test(token)) continue;
    if (/^<\//.test(token)) {
      const tag = /^<\/\s*([\w-]+)/.exec(token)?.[1]?.toLowerCase();
      const index = stack.findLastIndex((n) => n.tag === tag);
      if (index > 0) stack.length = index;
    } else if (token[0] === "<") {
      const tag = /^<\s*([\w-]+)/.exec(token)?.[1]?.toLowerCase();
      if (!tag) continue;
      const attrs = Object.create(null);
      for (const m of token
        .slice(token.indexOf(tag) + tag.length)
        .matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
        attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
      const node = { tag, attrs, children: [], parent: stack.at(-1) };
      stack.at(-1).children.push(node);
      if (
        !/^(img|br|hr|input|meta|link|area|source|wbr)$/.test(tag) &&
        !/\/>$/.test(token)
      ) {
        if (stack.length > 100)
          throw new Error(localeText.validationMessage_da6383e);
        stack.push(node);
      }
    } else stack.at(-1).children.push({ text: token });
  }
  return root;
}
function has(node, name) {
  return (node.attrs?.class || "").split(/\s+/).includes(name);
}
function nodes(root, predicate) {
  const result = [],
    queue = [root];
  while (queue.length) {
    const n = queue.pop();
    if (predicate(n)) result.push(n);
    queue.push(...(n.children || []).slice().reverse());
  }
  return result;
}
// A cumulative budget bounds repeated nested text queries as well as each result.
function textCollector() {
  let visits = 2000000,
    characters = 4 * MAX_DETAIL_BYTES;
  return (node, limit = 12000) => {
    const queue = [node],
      parts = [];
    let remaining = limit;
    while (queue.length && remaining > 0) {
      if (--visits < 0) throw new Error(localeText.validationMessage_da6383e);
      const current = queue.pop();
      if (/^(script|style|iframe|object|noscript)$/.test(current.tag)) continue;
      if (current.text !== undefined) {
        const take = Math.min(current.text.length, remaining);
        characters -= take;
        if (characters < 0)
          throw new Error(localeText.validationMessage_da6383e);
        parts.push(current.text.slice(0, take));
        remaining -= take + 1;
      } else {
        const children = current.children || [];
        for (let i = children.length - 1; i >= 0; i--) {
          if (--visits < 0)
            throw new Error(localeText.validationMessage_da6383e);
          queue.push(children[i]);
        }
      }
    }
    return parts.join(" ");
  };
}
function profile(value) {
  try {
    const u = new URL(value, "https://steamcommunity.com");
    if (
      u.origin !== "https://steamcommunity.com" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      return null;
    const m = /^\/(profiles\/(765\d{14})|id\/([A-Za-z0-9_-]{1,100}))\/?$/.exec(
      u.pathname,
    );
    return m ? { url: u.href, steamId: m[2] || null } : null;
  } catch {
    return null;
  }
}
function economyClass(value) {
  const m =
    /^classinfo\/(\d{1,10})\/(\d{1,24})(?:\/(\d{1,24})|\/a:(\d{1,20}))?$/.exec(
      value || "",
    );
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 2147483647) return null;
  return {
    appId: m[1],
    classId: m[2],
    instanceId: m[3] || "0",
    ...(m[4] ? { quantity: itemQuantity(m[4]) } : {}),
  };
}
function parseEconomyHover(html, expected) {
  if (typeof html !== "string" || Buffer.byteLength(html) > 256 * 1024)
    return null;
  const marker = /BuildHover\s*\(\s*(['"])[^'"]{1,150}\1\s*,\s*/g;
  let match,
    attempts = 0;
  while ((match = marker.exec(html)) && attempts++ < 10) {
    const start = marker.lastIndex;
    if (html[start] !== "{") continue;
    let depth = 0,
      quoted = false,
      escaped = false,
      end = start;
    for (; end < html.length; end++) {
      const c = html[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "{") {
        if (++depth > 100) return null;
      } else if (c === "}" && --depth === 0) {
        end++;
        break;
      }
    }
    marker.lastIndex = end;
    try {
      const d = JSON.parse(html.slice(start, end));
      if (
        String(d.appid) !== expected.appId ||
        String(d.classid) !== expected.classId ||
        String(d.instanceid || "0") !== expected.instanceId
      )
        continue;
      return {
        name: clean(d.name || d.market_hash_name) || null,
        imageUrl:
          typeof d.icon_url === "string"
            ? confirmationImageUrl(
                `https://community.steamstatic.com/economy/image/${d.icon_url}`,
              )
            : null,
        ...itemMetadata(d),
        appId: expected.appId,
      };
    } catch {
      /* A hover is optional read-only metadata. */
    }
  }
  return null;
}
function parseConfirmationDetails(html, confirmation = {}, ownSteamId = "") {
  if (typeof html !== "string" || Buffer.byteLength(html) > MAX_DETAIL_BYTES)
    throw new Error(localeText.validationMessage_da6383e);
  const text = textCollector();
  const root = tree(html),
    images = [],
    imageIndexes = new Map();
  let imagesTruncated = false;
  const image = (value) => {
    const url = confirmationImageUrl(value);
    if (!url) return null;
    if (!imageIndexes.has(url)) {
      if (images.length >= 100) {
        imagesTruncated = true;
        return null;
      }
      imageIndexes.set(url, images.length);
      images.push(url);
    }
    return imageIndexes.get(url);
  };
  const items = [],
    itemByElementId = new Map();
  let itemsTruncated = false;
  for (const node of nodes(
    root,
    (n) =>
      has(n, "trade_item") ||
      has(n, "tradeoffer_item") ||
      (has(n, "item") && n.attrs?.["data-economy-item"]) ||
      n.attrs?.id === "confiteminfo",
  )) {
    if (items.length >= 8192)
      throw new Error(localeText.validationMessage_2cd2a21);
    let direction = "unknown",
      ancestor = node;
    while (ancestor) {
      if (has(ancestor, "tradeoffer_items")) {
        if (has(ancestor, "primary")) direction = "outgoing";
        else if (has(ancestor, "secondary")) direction = "incoming";
        break;
      }
      ancestor = ancestor.parent;
    }
    if (confirmation.type === 3) direction = "outgoing";
    if (confirmation.type === 12) direction = "incoming";
    const img = nodes(node, (n) => n.tag === "img")[0];
    const nameNode = nodes(
      node,
      (n) =>
        has(n, "item_name") ||
        has(n, "trade_item_name") ||
        has(n, "market_listing_item_name"),
    )[0];
    const countNode = nodes(
      node,
      (n) => has(n, "trade_item_stack_count") || has(n, "item_amount"),
    )[0];
    const amountText = clean(
      countNode ? text(countNode) : node.attrs["data-amount"],
      30,
    ).replace(/[,\s]/g, "");
    const amount = /^[1-9]\d{0,19}$/.test(amountText)
      ? itemQuantity(amountText)
      : 1;
    items.push({
      name:
        clean(
          nameNode
            ? text(nameNode)
            : img?.attrs.alt || img?.attrs.title || node.attrs["data-name"],
        ) || null,
      ...economyClass(node.attrs["data-economy-item"]),
      quantity: amountText
        ? amount
        : economyClass(node.attrs["data-economy-item"])?.quantity || amount,
      ...(/^\d{1,24}$/.test(node.attrs["data-contextid"] || "")
        ? { contextId: node.attrs["data-contextid"] }
        : {}),
      direction,
      image: image(
        img?.attrs.src ||
          /url\(\s*['"]?(https:\/\/[^'"\s)]+)['"]?\s*\)/i.exec(
            node.attrs.style || "",
          )?.[1],
      ),
      economyId: clean(node.attrs["data-economy-item"], 150) || null,
    });
    if (node.attrs.id) itemByElementId.set(node.attrs.id, items.at(-1));
  }
  // Market details embed item metadata in a BuildHover call. Parse only strict JSON;
  // never evaluate JavaScript or assume arbitrary page scripts are trusted.
  const marker = /BuildHover\s*\(\s*(['"])([^'"]{1,150})\1\s*,\s*/g;
  const source = html;
  let match;
  while ((match = marker.exec(source))) {
    if (
      source[marker.lastIndex] !== "{" ||
      (!itemByElementId.has(match[2]) && match[2] !== "confiteminfo")
    )
      continue;
    let depth = 0,
      quoted = false,
      escaped = false,
      end = marker.lastIndex;
    for (; end < source.length; end++) {
      const c = source[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end++;
        break;
      }
    }
    const start = marker.lastIndex;
    marker.lastIndex = end;
    try {
      const data = JSON.parse(source.slice(start, end));
      const item = itemByElementId.get(match[2]) || {
        direction:
          confirmation.type === 12
            ? "incoming"
            : confirmation.type === 3
              ? "outgoing"
              : "unknown",
        quantity: 1,
        image: null,
      };
      Object.assign(item, itemMetadata(data));
      item.name =
        clean(data.name || data.market_hash_name) || item.name || null;
      if (/^[1-9]\d{0,19}$/.test(String(data.amount || "")))
        item.quantity = itemQuantity(data.amount);
      item.appId = /^\d{1,10}$/.test(String(data.appid))
        ? String(data.appid)
        : null;
      if (item.image === null && typeof data.icon_url === "string")
        item.image = image(
          `https://community.steamstatic.com/economy/image/${data.icon_url}`,
        );
      if (!items.includes(item)) {
        items.push(item);
      }
    } catch {
      /* Unknown markup stays visible as plain Steam text below. */
    }
  }
  if (items.length > 8192)
    throw new Error(localeText.validationMessage_2cd2a21);
  const counterparties = [];
  const partnerArea = nodes(root, (n) =>
    has(n, "mobileconf_trade_partner_info"),
  )[0];
  if (partnerArea)
    for (const node of nodes(
      partnerArea,
      (n) => n.attrs?.["data-miniprofile"],
    )) {
      const accountId = node.attrs["data-miniprofile"];
      if (
        !/^\d{1,10}$/.test(accountId) ||
        BigInt(accountId) < 1n ||
        BigInt(accountId) > 4294967295n
      )
        continue;
      const steamId = String(76561197960265728n + BigInt(accountId));
      if (steamId === ownSteamId) continue;
      const existing = counterparties.find((p) => p.steamId === steamId);
      const name = node.tag === "img" ? null : clean(text(node)) || null;
      const imageIndex = image(
        node.tag === "img"
          ? node.attrs.src
          : nodes(node, (n) => n.tag === "img")[0]?.attrs.src,
      );
      if (existing) {
        existing.name ||= name;
        if (existing.image === null) existing.image = imageIndex;
      } else if (counterparties.length < 5)
        counterparties.push({
          steamId,
          url: `https://steamcommunity.com/profiles/${steamId}`,
          name,
          image: imageIndex,
        });
    }
  for (const anchor of nodes(root, (n) => n.tag === "a")) {
    const identity = profile(anchor.attrs.href);
    if (!identity || identity.steamId === ownSteamId) continue;
    const existing = counterparties.find(
      (p) => p.url.replace(/\/$/, "") === identity.url.replace(/\/$/, ""),
    );
    const name = clean(text(anchor)) || null,
      imageIndex = image(nodes(anchor, (n) => n.tag === "img")[0]?.attrs.src);
    if (existing) {
      existing.name ||= name;
      if (existing.image === null) existing.image = imageIndex;
      continue;
    }
    counterparties.push({ ...identity, name, image: imageIndex });
    if (counterparties.length >= 5) break;
  }
  const offer = nodes(root, (n) => has(n, "tradeoffer"))[0]?.attrs.id;
  const offerId =
    /^tradeoffer(?:id)?_(\d{1,32})$/.exec(offer || "")?.[1] || null;
  const lines = nodes(
    root,
    (n) =>
      /^(p|h1|h2|h3)$/.test(n.tag) ||
      has(n, "mobileconf_trade_area") ||
      has(n, "mobileconf_listing_prices") ||
      has(n, "market_listing_price"),
  )
    .map((n) => clean(text(n), 1000))
    .filter(Boolean);
  const uniqueLines = [...new Set(lines)].slice(0, 30);
  return {
    detail: {
      offerId,
      counterparties,
      items: stackItems(items),
      itemsTruncated,
      imagesTruncated,
      lines: uniqueLines,
      plainText: clean(text(root), 12000),
      partial:
        itemsTruncated ||
        !items.length ||
        items.some((i) => !i.name || i.direction === "unknown"),
      kind:
        confirmation.type === 2
          ? "trade"
          : [3, 12].includes(confirmation.type)
            ? "market"
            : "other",
    },
    images,
  };
}
module.exports = {
  MAX_DETAIL_BYTES,
  confirmationImageUrl,
  parseConfirmationDetails,
  economyClass,
  parseEconomyHover,
  clean,
};
