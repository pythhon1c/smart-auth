"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

// UI Automation addresses only the browser process obtained from this context's
// browser-target CDP connection. No desktop keyboard input or foreground-window
// assumptions are involved. Unsupported platforms fail closed.
async function prepareSmartTraderNativePermission({
  context,
  extensionName,
  profilePath,
  signal,
  platform = process.platform,
  spawnProcess = spawn,
} = {}) {
  if (
    platform !== "win32" ||
    signal?.aborted ||
    !extensionName ||
    typeof extensionName !== "string" ||
    typeof profilePath !== "string" ||
    !path.isAbsolute(profilePath)
  )
    return null;
  let session;
  let pid;
  try {
    session = await context.browser().newBrowserCDPSession();
    const processes = await session.send("SystemInfo.getProcessInfo");
    pid = processes.processInfo.find((p) => p.type === "browser")?.id;
  } catch {
    return null;
  } finally {
    await session?.detach().catch(() => {});
  }
  if (!Number.isSafeInteger(pid) || pid <= 0 || signal?.aborted) return null;
  return new Promise((resolve) => {
    let child,
      settled = false,
      ready = false,
      outcomeResolve;
    const outcome = new Promise((r) => {
      outcomeResolve = r;
    });
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      if (!accepted) child?.kill();
      signal?.removeEventListener("abort", abort);
      if (!ready) resolve(null);
      outcomeResolve(accepted);
    };
    const abort = () => finish(false);
    try {
      const script = fs.readFileSync(
        path.join(__dirname, "smart-trader-native-permission.ps1"),
        "utf8",
      );
      const literal = (value) =>
        "([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
        Buffer.from(value, "utf8").toString("base64") +
        "')))";
      // Read via Node (including app.asar) and pass data as base64 literals;
      // localized manifest text and filesystem paths never become shell syntax.
      const command = `& { ${script}\n } -BrowserPid ${pid} -ProfilePath ${literal(profilePath)} -ExtensionName ${literal(extensionName)}`;
      child = spawnProcess(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-EncodedCommand",
          Buffer.from(command, "utf16le").toString("base64"),
        ],
        {
          windowsHide: true,
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 18000,
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (!ready && !settled && output.includes("SMART_SDA_READY")) {
          ready = true;
          let armed = false;
          resolve({
            approve() {
              if (!armed && !settled && !signal?.aborted) {
                armed = true;
                child.stdin.end("approve\n");
              }
              return outcome;
            },
            cancel: abort,
          });
        }
        if (output.length > 1024) abort();
      });
      child.stdin.on("error", () => finish(false));
      child.once("error", () => finish(false));
      child.once("exit", (code) => finish(code === 0 && !signal?.aborted));
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    } catch {
      finish(false);
    }
  });
}
module.exports = { prepareSmartTraderNativePermission };
