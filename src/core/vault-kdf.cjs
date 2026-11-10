"use strict";
const localeText = require("../locales/application.json");
const crypto = require("node:crypto");
const V2_KDF = Object.freeze({
  name: "scrypt",
  N: 262144,
  r: 8,
  p: 1,
  keyLength: 32,
});
const V1_KDF = Object.freeze({
  name: "scrypt",
  N: 32768,
  r: 8,
  p: 1,
  keyLength: 32,
});
function descriptor(version) {
  return { ...(version === 1 ? V1_KDF : V2_KDF) };
}
function validateKdf(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "N,keyLength,name,p,r" ||
    Object.keys(V2_KDF).some((key) => value[key] !== V2_KDF[key])
  )
    throw Error(localeText.invalidVaultProtectionParameters);
}
function passwordPolicy(password) {
  if (
    typeof password !== "string" ||
    [...password].length < 15 ||
    password.length > 4096
  )
    throw Error(localeText.passwordMustContainAtLeast15Characters);
}
function derivePasswordKey(password, salt, version = 2) {
  if (
    typeof password !== "string" ||
    password.length > 4096 ||
    !Buffer.isBuffer(salt) ||
    salt.length !== (version === 1 ? 16 : 32)
  )
    return Promise.reject(Error(localeText.incorrectCredentials));
  if (version !== 1 && version !== 2)
    return Promise.reject(Error(localeText.unknownVaultVersion));
  const parameters = descriptor(version),
    message = Buffer.from(password, "utf8");
  return new Promise((resolve, reject) =>
    crypto.scrypt(
      message,
      salt,
      32,
      {
        N: parameters.N,
        r: parameters.r,
        p: parameters.p,
        maxmem: version === 1 ? 64 * 1024 * 1024 : 384 * 1024 * 1024,
      },
      (error, key) => {
        message.fill(0);
        if (error) reject(error);
        else resolve(key);
      },
    ),
  );
}
module.exports = {
  V2_KDF,
  V1_KDF,
  descriptor,
  validateKdf,
  passwordPolicy,
  derivePasswordKey,
};
