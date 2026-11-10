"use strict";
const localeText = require("../locales/application.json");
const { randomUUID } = require("node:crypto");
const { parseMafile, classifyRefreshToken } = require("./steam.cjs");
const { validatePortable } = require("./export.cjs");
const { validateProxy } = require("./transport.cjs");

// The TBS parser validates the wire format. This adapter preserves credentials
// while separating mobile sessions from inert desktop/web/opaque tokens.
function tradeBotsBundle(prepared, { groupName } = {}) {
  for (const proxy of prepared.proxies) {
    try {
      validateProxy(proxy.url);
    } catch {
      throw Error(
        localeText.aTradeBotsSystemProxyExceedsTransportLimitsThePackageWasNotImported,
      );
    }
  }
  const groupId = groupName ? randomUUID() : null;
  const proxies = prepared.proxies.map((p, i) => ({
    id: randomUUID(),
    name: `TBS ${i + 1}`,
    url: p.url,
  }));
  const warnings = new Map();
  const accounts = prepared.accounts.map((row) => {
    const notice = [];
    const mafile = { account_name: row.accountName, steamid: row.steamId };
    if (row.sharedSecret !== undefined)
      Object.assign(mafile, {
        shared_secret: row.sharedSecret,
        identity_secret: row.identitySecret,
        device_id: row.deviceId,
      });
    else
      notice.push(
        localeText.steamGuardSecretsAreMissingCodesAndConfirmationsAreUnavailable,
      );
    if (row.refreshToken !== undefined) {
      let decoded;
      try {
        decoded = JSON.parse(
          Buffer.from(row.refreshToken.split(".")[1], "base64url").toString(
            "utf8",
          ),
        );
      } catch {}
      if (
        decoded &&
        typeof decoded.sub === "string" &&
        decoded.sub !== row.steamId
      )
        throw Error(localeText.tradeBotsSystemTokenBelongsToAnotherAccount);
      let audience;
      try {
        audience = classifyRefreshToken(row.refreshToken, row.steamId);
      } catch {}
      if (audience === "mobile")
        mafile.Session = {
          SteamID: row.steamId,
          RefreshToken: row.refreshToken,
        };
      else if (audience === "desktop" || audience === "web") {
        mafile.ExternalSessions = {
          [audience === "desktop" ? "DesktopRefreshToken" : "WebRefreshToken"]:
            row.refreshToken,
        };
        notice.push(
          localeText.externalTokenSavedASeparateLoginIsNeededForAMobileSession,
        );
      } else {
        mafile.ImportedRefreshToken = row.refreshToken;
        notice.push(
          localeText.tokenSavedAsMetadataMobileLoginCompatibilityIsUnverified,
        );
      }
    }
    const account = parseMafile(JSON.stringify(mafile), {
      allowMissingAuthenticator: true,
    });
    Object.assign(account, {
      name: row.accountName.slice(0, 120),
      groupId,
      inheritProxy: false,
      proxyIds:
        row.proxyIndex === undefined ? [] : [proxies[row.proxyIndex]?.id],
      proxyListIds: [],
      checkConfirmations: false,
      autoMarket: false,
      autoMarketPurchases: false,
      autoTrades: false,
    });
    if (row.password !== undefined) account.loginPassword = row.password;
    if (!account.proxyIds.length)
      notice.push(localeText.noProxyAssignedCheckTheRouteBeforeSigningIn);
    warnings.set(row.steamId, notice);
    return account;
  });
  const bundle = validatePortable({
    format: "smart-sda",
    version: 1,
    exportedAt: new Date().toISOString(),
    includeProxies: proxies.length > 0,
    accounts,
    proxies,
    proxyLists: [],
    groups: groupId
      ? [
          {
            id: groupId,
            name: groupName,
            parentId: null,
            proxyIds: [],
            proxyListIds: [],
          },
        ]
      : [],
  });
  return { bundle, warnings };
}
function assertTradeBotsAssociations(data, bundle) {
  const byLogin = new Map();
  for (const a of data.accounts) {
    const login = a.mafile?.account_name?.toLowerCase();
    if (!login) continue;
    const ids = byLogin.get(login) || new Set();
    ids.add(a.steamId);
    byLogin.set(login, ids);
  }
  for (const a of bundle.accounts) {
    const ids = byLogin.get(a.mafile.account_name.toLowerCase());
    if (ids && (ids.size !== 1 || !ids.has(a.steamId)))
      throw Error(
        localeText.tradeBotsSystemLoginIsAlreadyLinkedToADifferentSteamID,
      );
    const prior = data.accounts.find((p) => p.steamId === a.steamId);
    if (
      prior &&
      prior.mafile?.account_name?.toLowerCase() !==
        a.mafile.account_name.toLowerCase()
    )
      throw Error(
        localeText.tradeBotsSystemSteamIDIsAlreadyLinkedToADifferentLogin,
      );
  }
}
module.exports = { tradeBotsBundle, assertTradeBotsAssociations };
