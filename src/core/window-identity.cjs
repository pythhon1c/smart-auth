"use strict";
const path = require("node:path");
const APP_ID = "app.smartauth.desktop";
const DEVELOPMENT_APP_ID = "app.smartauth.desktop.development";

function appUserModelId(app) {
  return app.isPackaged ? APP_ID : DEVELOPMENT_APP_ID;
}

function windowAppDetails(
  app,
  env = process.env,
  executable = process.execPath,
) {
  const launcher =
    app.isPackaged && env.PORTABLE_EXECUTABLE_FILE
      ? env.PORTABLE_EXECUTABLE_FILE
      : executable;
  return {
    appId: appUserModelId(app),
    appIconPath: app.isPackaged
      ? launcher
      : path.join(app.getAppPath(), "assets", "app-icon.ico"),
    appIconIndex: 0,
    relaunchCommand: `"${launcher}"${app.isPackaged ? "" : ` "${app.getAppPath()}"`}`,
    relaunchDisplayName: "smart-auth",
  };
}

module.exports = {
  APP_ID,
  DEVELOPMENT_APP_ID,
  appUserModelId,
  windowAppDetails,
};
