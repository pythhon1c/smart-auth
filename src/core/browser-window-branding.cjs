"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function startBrowserWindowBranding({ pid, profilePath, executablePath, iconPath, appId, displayName, signal,
  platform = process.platform, spawnProcess = spawn, systemRoot = process.env.SystemRoot } = {}) {
  if (platform !== "win32" || signal?.aborted || !Number.isSafeInteger(pid) || pid <= 0 ||
      ![profilePath, executablePath, iconPath].every(v => typeof v === "string" && path.win32.isAbsolute(v)) ||
      !/^[A-Za-z]:\\/.test(systemRoot || "") || typeof appId !== "string" ||
      !/^[A-Za-z0-9_.-]{1,128}$/.test(appId) || typeof displayName !== "string" ||
      !displayName || displayName.length > 1024 || /[\u0000-\u001f]/.test(displayName)) return null;
  const relative = path.win32.relative(profilePath, iconPath);
  if (!relative || relative.startsWith("..") || path.win32.isAbsolute(relative) || !/\.ico$/i.test(iconPath)) return null;
  const script = fs.readFileSync(path.join(__dirname, "browser-window-branding.ps1"), "utf8");
  let child;
  try {
    child = spawnProcess(path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadLine()))))"],
      { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
  } catch { return null; }
  let stopped = false, timer, killTimer;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    signal?.removeEventListener("abort", stop);
    child.stdin?.end();
    // EOF wakes the reader and lets the helper release process/COM objects.
    killTimer = setTimeout(() => child.kill(), 2500);
    killTimer.unref?.();
  };
  const done = new Promise(resolve => {
    child.once("error", () => { stop(); clearTimeout(killTimer); resolve(false); });
    child.once("exit", code => { stop(); clearTimeout(killTimer); resolve(code === 0); });
  });
  child.stdin?.on("error", stop);
  child.stdin?.write(Buffer.from(script, "utf8").toString("base64") + "\n");
  child.stdin?.write(Buffer.from(JSON.stringify({ pid, parentPid: process.pid, profilePath, executablePath, iconPath, appId, displayName }), "utf8").toString("base64") + "\n");
  timer = setInterval(() => { if (!stopped) child.stdin?.write("alive\n"); }, 3000);
  timer.unref?.();
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  return { stop, done };
}
module.exports = { startBrowserWindowBranding };
