# Building smart-auth

These instructions cover **0.14.4-beta.4**. Run commands in PowerShell from the source directory containing `package.json`. The packaged EXE includes Electron; Google Chrome is downloaded separately on first browser use after accepting its terms; end users do not need Node.js or pnpm. See the [user guide](USER-GUIDE.md).

## Requirements

| Component                          | Requirement                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| Build platform                     | Windows x64                                                                                         |
| Node.js                            | **24.x x64**                                                                                        |
| Package manager                    | **pnpm 11.25.0**, pinned in `package.json`                                                          |
| Dependencies                       | Install from `pnpm-lock.yaml` without updating it                                                   |
| Network during initial preparation | Package registry and Electron/build tools |

The pinned direct tool versions are Electron **42.11.14**, electron-builder **26.15.3**, and Playwright / playwright-core **1.62.1**. The browser is pinned in `src/core/browser-runtime.json`. The build does not substitute an arbitrary system Chrome installation.

pnpm 11.25.0 itself requires Node.js `>=22.13`; the Electron package requires `>=22.12.0`. Use the project's stricter **Node.js 24** requirement. Full local CI enforces Node major 24 and Windows x64. A specific minimum Windows build and disk-space requirement are not defined in the project. Allow additional space for dependencies, Chromium, build output, and portable extraction.

## Install and run from source

Obtain a clean checkout of the intended release tag or download `smart-auth-0.14.4-beta.4-source.zip` from the same release and extract it into a new directory. GitHub source viewers display files; use a release asset download to obtain the EXE or prepared ZIP. Open PowerShell in that directory (containing `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`). Install Node.js 24 x64, then install the pinned pnpm if it is not already available:

```powershell
npm install --global pnpm@11.25.0
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
pnpm start
```

Expect `v24.x.x` and `11.25.0`. Keep `pnpm-workspace.yaml` with the lockfile: it contains permissions for required dependency build scripts. A normal `pnpm start` uses the application user profile; do not assume it creates an isolated development vault.

## Build the portable EXE

```powershell
pnpm dist
```

This runs `electron-builder --win portable --x64` without downloading or bundling Google Chrome.

Build output:

- `release/smart-auth-0.14.4-beta.4-win-x64.exe`: portable executable for distribution.
- `release/win-unpacked/smart-auth.exe`: unpacked application.
- `release/win-unpacked/resources/app.asar`: application, runtime installer, and pinned manifest. No browser resource directory is permitted.

Executable signing is disabled in the build configuration. Portable means no installer is required. Vault and browser data live in the Windows application-data directory, outside the EXE; copying the EXE does not transfer them.

For a distributor with a trusted Windows code-signing identity already configured for electron-builder, run `pnpm dist --config.win.signExecutable=true --config.forceCodeSigning=true` before generating checksums. Verify that `(Get-AuthenticodeSignature -LiteralPath '.\release\smart-auth-0.14.4-beta.4-win-x64.exe').Status` is `Valid` and check the signer before publishing. A new signed file may still prompt while SmartScreen establishes reputation. See [Microsoft's SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

Build output, dependency caches, vaults, exports, and credentials do not belong in source control. Distribute the EXE as a release asset. Include the applicable license and third-party notices with the release.

## Verify a downloaded release

```powershell
Get-FileHash -LiteralPath 'release/smart-auth-0.14.4-beta.4-win-x64.exe' -Algorithm SHA256
```

Compare the result with `SHA256SUMS.txt` supplied alongside the release assets for the same filename. Adjust the path if the file is in another directory. A matching checksum establishes file correspondence; it is not a publisher signature. `pnpm dist` alone does not generate a full-CI checksum record.

