"use strict";
const path = require("node:path");
const fs = require("node:fs");

function configureAppIdentity(app, env = process.env, exists = fs.existsSync) {
  const isolatedHome = !app.isPackaged && env.SMART_SDA_TEST_HOME;
  const explicitHome = app.commandLine.getSwitchValue("user-data-dir");
  let home = isolatedHome || explicitHome;
  if (!home) {
    const appData = app.getPath("appData");
    const legacyHome = path.join(appData, "Smart SDA");
    const currentHome = path.join(appData, "smart-auth");
    const hasVault = (dir) =>
      exists(path.join(dir, "smart-sda.vault")) ||
      exists(path.join(dir, "smart-sda.vault.bak"));
    // Prefer existing vaults over empty directories; legacy wins ties.
    // Discovery checks names only, never reading or moving user files.
    home = hasVault(legacyHome) || (exists(legacyHome) && !hasVault(currentHome))
      ? legacyHome
      : currentHome;
  }
  app.setPath("userData", home);
  app.setName("smart-auth");
}

module.exports = { configureAppIdentity };
