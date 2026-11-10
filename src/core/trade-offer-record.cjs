"use strict";
// Adapted from Smart Trader with the author's permission. See THIRD-PARTY-NOTICES.md.
// Steam embeds each offer's status and partner in the offer page. Parse the
// bounded JSON as data and reject ambiguous records before exposing either side.
// Hold values use the maximum reported duration to avoid understating a hold.

const OfferRecord = {
  V: 1,
  // Desktop port: byte-bounded transport and JSON bound replace the browser's
  // 8192 preview truncation. Every asset in a bounded page is retained/checked.
  TEXT_MAX: 16 * 1024 * 1024,
  JSON_MAX: 16 * 1024 * 1024,
  DEPTH_MAX: 8, // nesting of the status' JSON (Steam's: 4 — the status, a side, its assets, an asset)
  SIDE_MAX: 16 * 1024 * 1024, // no reachable count cap within the bounded JSON
  HOLD_MAX: 1e6, // (1.12.10 review) days of a trade hold kept (a longer number of digits: this many, still a hold)
  HOLDS: [
    ["my", /g_daysMyEscrow\s*=\s*(\d+)/g],
    ["their", /g_daysTheirEscrow\s*=\s*(\d+)/g],
    ["both", /g_daysBothEscrow\s*=\s*(\d+)/g],
  ],
  ID: /^[1-9]\d{0,19}$/, // an offer id (the address' rule: sw.js OFFER_URL, OffersTamper.OFFER_URL_RE)
  PARTNER: /^765\d{14}$/,
  APP: /^[1-9]\d{0,9}$/,
  NUM: /^\d{1,20}$/, // contextid, assetid
  // Desktop port preserves arbitrary 64-bit amounts without numeric coercion.
  AMOUNT: /^[1-9]\d{0,19}$/,
  REASONS: ["gone", "shape", "size"],

  /** the offer's page (its text) → the record of that offer (id: the address' offer id), or { v, ok: false, r } */
  parse(html, id) {
    const R = OfferRecord;
    const no = (r) => ({ v: R.V, ok: false, r });
    if (typeof html !== "string" || typeof id !== "string" || !R.ID.test(id))
      return no("shape");
    if (html.length > R.TEXT_MAX) return no("size");
    const status = R.find(html, /\bg_rgCurrentTradeStatus\s*=\s*(?=\{)/g);
    const partners = R.find(
      html,
      /\bg_ulTradePartnerSteamID\s*=\s*'(\d{17})'/g,
    );
    if (!status.length && !partners.length) return no("gone");
    if (status.length !== 1 || partners.length > 1) return no("shape");
    for (const m of status.concat(partners))
      if (!R.inScript(html, m.index)) return no("shape");
    const start = status[0].index + status[0][0].length;
    const end = R.scan(html, start);
    if (typeof end === "string") return no(end);
    let st = null;
    try {
      st = JSON.parse(html.slice(start, end));
    } catch (e) {
      return no("shape");
    }
    if (!R.plain(st)) return no("shape");
    const me = R.side(R.own(st, "me"));
    const them = me ? R.side(R.own(st, "them")) : null;
    if (!me || !them) return no("shape");
    const partner = partners.length ? partners[0][1] : "";
    return {
      v: R.V,
      ok: true,
      offer: id,
      partner: R.PARTNER.test(partner) ? partner : "",
      hold: R.holds(html),
      me,
      them,
    };
  },
  /**
   * (1.12.10 review) the hold days the page names → { my, their, both }: each the largest of EVERY copy (no cap on how
   * many: one copy past the cap could be Steam's own), at most HOLD_MAX; -1 when none
   */
  holds(text) {
    const R = OfferRecord;
    const out = {};
    for (const [k, re] of R.HOLDS) {
      let best = -1;
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const d = m[1].length > 7 ? R.HOLD_MAX : Math.min(R.HOLD_MAX, +m[1]);
        if (d > best) best = d;
      }
      out[k] = best;
    }
    return out;
  },
  /** every match of a global pattern (at most 64: more is no page of Steam's) */
  find(text, re) {
    const out = [];
    re.lastIndex = 0;
    for (let m = re.exec(text); m && out.length < 64; m = re.exec(text))
      out.push(m);
    return out;
  },
  /** the place lies inside an inline <script> element: the last <script before it opens no src, and no </script comes between */
  inScript(text, at) {
    const low = text
      .slice(Math.max(0, at - OfferRecord.TEXT_MAX), at)
      .toLowerCase();
    const open = low.lastIndexOf("<script");
    if (open < 0 || low.lastIndexOf("</script") > open) return false;
    const tagEnd = low.indexOf(">", open);
    if (tagEnd < 0) return false;
    const after = low.charAt(open + 7);
    if (after !== ">" && !/\s/.test(after)) return false; // (<scripts…: another tag)
    return !/\bsrc\s*=/.test(low.slice(open, tagEnd));
  },
  /**
   * the end (exclusive) of the JSON value that starts at `start` with { — a scan of its characters: strings with their
   * backslash escapes, the depth of { [ against } ] outside them — or the reason it is refused: 'shape' (deeper than
   * DEPTH_MAX, a bracket that does not close its own, the text ends first), 'size' (longer than JSON_MAX)
   */
  scan(text, start) {
    const R = OfferRecord;
    const stack = [];
    let inStr = false;
    let esc = false;
    const last = Math.min(text.length, start + R.JSON_MAX);
    for (let i = start; i < last; i++) {
      const c = text.charCodeAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === 92)
          esc = true; // \
        else if (c === 34) inStr = false; // "
        continue;
      }
      if (c === 34) inStr = true;
      else if (c === 123 || c === 91) {
        // { [
        stack.push(c === 123 ? 125 : 93);
        if (stack.length > R.DEPTH_MAX) return "shape";
      } else if (c === 125 || c === 93) {
        // } ]
        if (stack.pop() !== c) return "shape";
        if (!stack.length) return i + 1;
      }
    }
    return last < text.length ? "size" : "shape";
  },
  /** an object of JSON's (not an array, not null) */
  plain(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  },
  /** an own property's value (never one inherited) */
  own(o, k) {
    return o !== null &&
      typeof o === "object" &&
      Object.prototype.hasOwnProperty.call(o, k)
      ? o[k]
      : undefined;
  },
  /**
   * a field of an asset as Steam writes it — a string of digits by the pattern, or a safe integer at least min (a
   * number past 2^53 lost its digits) — as its string; '' when it is neither
   */
  digits(v, re, min) {
    if (typeof v === "string") return re.test(v) ? v : "";
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= min) {
      const s = String(v);
      return re.test(s) ? s : "";
    }
    return "";
  },
  /** a side of the status ({ assets: [...], currency?: [...] }) → Side, or null when it is not that shape */
  side(x) {
    const R = OfferRecord;
    if (!R.plain(x)) return null;
    const assets = R.own(x, "assets");
    const cur = R.own(x, "currency");
    if (!Array.isArray(assets) || (cur !== undefined && !Array.isArray(cur)))
      return null;
    const a = [];
    for (const it of assets) {
      if (!R.plain(it)) return null;
      const t = [
        R.digits(R.own(it, "appid"), R.APP, 1),
        R.digits(R.own(it, "contextid"), R.NUM, 0),
        R.digits(R.own(it, "assetid"), R.NUM, 0),
        R.digits(R.own(it, "amount"), R.AMOUNT, 1),
      ];
      if (t.some((s) => !s)) return null;
      if (a.length < R.SIDE_MAX) a.push(t);
    }
    const curs = cur || [];
    for (const c of curs) if (!R.plain(c)) return null;
    return {
      n: assets.length,
      cur: curs.length,
      a,
      cut: assets.length > a.length,
    };
  },
  /** a record as the page code got it (the worker's JSON) → the same record built from its own properties, or null */
  check(obj, id) {
    const R = OfferRecord;
    const own = (o, k) => R.own(o, k);
    if (
      !R.plain(obj) ||
      own(obj, "v") !== R.V ||
      typeof id !== "string" ||
      !R.ID.test(id)
    )
      return null;
    const ok = own(obj, "ok");
    if (ok === false) {
      const r = own(obj, "r");
      return R.REASONS.includes(r) ? { v: R.V, ok: false, r } : null;
    }
    if (ok !== true || own(obj, "offer") !== id) return null;
    const partner = own(obj, "partner");
    if (
      partner !== "" &&
      !(typeof partner === "string" && R.PARTNER.test(partner))
    )
      return null;
    const side = (s) => {
      if (!R.plain(s)) return null;
      const n = own(s, "n");
      const cur = own(s, "cur");
      const a = own(s, "a");
      const cut = own(s, "cut");
      const count = (x) => Number.isSafeInteger(x) && x >= 0 && x <= 1e6;
      if (
        !count(n) ||
        !count(cur) ||
        !Array.isArray(a) ||
        a.length !== Math.min(n, R.SIDE_MAX) ||
        cut !== n > a.length
      )
        return null;
      const pats = [R.APP, R.NUM, R.NUM, R.AMOUNT];
      const list = [];
      for (const t of a) {
        if (!Array.isArray(t) || t.length !== 4) return null;
        const one = [];
        for (let i = 0; i < 4; i++) {
          if (typeof t[i] !== "string" || !pats[i].test(t[i])) return null;
          one.push(t[i]);
        }
        list.push(one);
      }
      return { n, cur, a: list, cut };
    };
    const h = own(obj, "hold");
    if (!R.plain(h)) return null;
    const hold = {};
    for (const [k] of R.HOLDS) {
      const d = own(h, k);
      if (!Number.isSafeInteger(d) || d < -1 || d > R.HOLD_MAX) return null;
      hold[k] = d;
    }
    const me = side(own(obj, "me"));
    const them = me ? side(own(obj, "them")) : null;
    return me && them
      ? { v: R.V, ok: true, offer: id, partner, hold, me, them }
      : null;
  },
};
module.exports = { OfferRecord };
