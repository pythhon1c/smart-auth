"use strict";
// Derived from Smart Trader stacks/src/items.js ItemKey + Stacker and README §3.
// Confirmation review uses the stricter class/instance identity AND all available
// description traits. Missing identity is never inferred from a name or icon.
const { createHash } = require("node:crypto");
const id = (value) =>
  /^\d{1,24}$/.test(String(value ?? "")) ? String(value) : null;
function itemMetadata(data = {}) {
  const d = data.description || data;
  const out = {};
  for (const [field, source] of [
    ["appId", "appid"],
    ["contextId", "contextid"],
    ["classId", "classid"],
    ["instanceId", "instanceid"],
  ]) {
    const value = id(data[source] ?? d[source]);
    if (value !== null) out[field] = value;
  }
  if (out.classId && !out.instanceId) out.instanceId = "0";
  // Keep every available discriminator, including renamed/craft names, paint,
  // effects, stickers, fraud warnings and tradability; hashing bounds IPC size.
  const traits = [
    "name",
    "market_hash_name",
    "market_name",
    "name_color",
    "descriptions",
    "owner_descriptions",
    "fraudwarnings",
    "tradable",
    "marketable",
    "tags",
    "app_data",
  ].map((k) => [k, d[k] ?? null]);
  out.traitKey = createHash("sha256")
    .update(JSON.stringify(traits))
    .digest("hex");
  return out;
}
function itemIdentity(item) {
  if (!item || !["outgoing", "incoming"].includes(item.direction)) return null;
  if (!id(item.appId) || !id(item.classId) || !id(item.instanceId)) return null;
  return JSON.stringify([
    item.direction,
    item.appId,
    item.contextId ?? null,
    item.classId,
    item.instanceId,
    item.traitKey ?? null,
    item.name ?? null,
  ]);
}
function itemQuantity(value) {
  if (!/^[1-9]\d{0,31}$/.test(String(value ?? ""))) return 1;
  const amount = BigInt(value);
  return amount <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(amount)
    : amount.toString();
}
function stackItems(items) {
  const stacks = [],
    byKey = new Map();
  for (const item of items || []) {
    const quantity = itemQuantity(item.quantity);
    const count =
      Number.isSafeInteger(item.stackCount) && item.stackCount > 0
        ? item.stackCount
        : 1;
    const key = itemIdentity(item),
      existing = key && byKey.get(key);
    if (existing && Number.isSafeInteger(existing.stackCount + count)) {
      existing.quantity = itemQuantity(
        BigInt(existing.quantity) + BigInt(quantity),
      );
      existing.stackCount += count;
      if (existing.image == null) existing.image = item.image;
    } else {
      const stack = { ...item, quantity, stackCount: count };
      stacks.push(stack);
      if (key) byKey.set(key, stack);
    }
  }
  return stacks;
}
module.exports = { itemMetadata, itemIdentity, stackItems, itemQuantity };
