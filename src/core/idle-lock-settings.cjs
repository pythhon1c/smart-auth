"use strict";

const IDLE_LOCK_SETTINGS_VERSION = 1;
const IDLE_LOCK_DEFAULTS = Object.freeze({
  autoLockMinutes: 0,
  pinLockMinutes: 0,
  passwordLockMinutes: 0,
  idleLockSettingsVersion: IDLE_LOCK_SETTINGS_VERSION,
});

function migrateIdleLockSettings(settings) {
  if (settings.idleLockSettingsVersion === IDLE_LOCK_SETTINGS_VERSION)
    return false;
  const pin = settings.pinLockMinutes ?? 2;
  const password = settings.passwordLockMinutes ?? settings.autoLockMinutes ?? 10;
  // Only replace the old implicit/stock pair. Mixed or custom values reflect
  // an existing preference, including the original password-only alias.
  const stock = pin === 2 && password === 10 &&
    (settings.autoLockMinutes === undefined || settings.autoLockMinutes === 10);
  settings.pinLockMinutes = stock ? 0 : pin;
  settings.passwordLockMinutes = stock ? 0 : password;
  settings.autoLockMinutes = stock ? 0 : (settings.autoLockMinutes ?? password);
  settings.idleLockSettingsVersion = IDLE_LOCK_SETTINGS_VERSION;
  return true;
}

module.exports = { IDLE_LOCK_DEFAULTS, migrateIdleLockSettings };
