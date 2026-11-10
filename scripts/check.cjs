"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((x) =>
      x.isDirectory()
        ? files(path.join(dir, x.name))
        : [path.join(dir, x.name)],
    );
}
// Public source archives omit the private maintainer test suite.
// The application source directory is always required.
for (const file of [...files("src"), ...(fs.existsSync("tests") ? files("tests") : []), ...files("scripts")].filter((x) =>
  /\.(c?js)$/.test(x),
)) {
  const result = cp.spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status) process.exit(result.status);
}
console.log("JavaScript syntax checked.");
