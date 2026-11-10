# smart-auth 0.14.4-beta.2

**BETA — still under testing. Use at your own risk.** This is a prerelease intended for testing. Bugs or automated actions may cause loss of data, items, balances or account access. Keep independent backups and review account routes and automation before use.

Account browsers use a separately downloaded Google Chrome for Testing runtime. The portable EXE and prepared source ZIP contain no Google browser files. First browser use shows the applicable Google terms and downloads the pinned version directly from Google after acceptance. Later launches reuse the versioned local cache. Persistent account browser profiles remain separate from the runtime cache.

## Changes in this beta

The application and release assets are named `smart-auth`. The unpacked standalone executable is `smart-auth.exe`. Upgrading reuses the existing vault without importing accounts again.

## Download and start

When this prerelease is published, download these assets from its Releases entry. A source viewer only displays files; the portable EXE and prepared source archive are separate downloadable release assets:

- `smart-auth-0.14.4-beta.2-win-x64.exe`: Windows x64 portable application; Node.js is not required.
- `smart-auth-0.14.4-beta.2-source.zip`: prepared source archive for local builds.
- `SHA256SUMS.txt`: SHA-256 checksums for the release assets.

1. Download the EXE and checksum file from the same release entry. In PowerShell, run `Get-FileHash -LiteralPath '.\smart-auth-0.14.4-beta.2-win-x64.exe' -Algorithm SHA256` and compare it with the matching filename in `SHA256SUMS.txt`. A checksum confirms file correspondence; it is not a publisher signature. The executable is unsigned.
2. Fully exit any earlier version, including its tray process. Back up application data before updating.
3. Run the EXE and create or unlock the local vault. Existing installations normally keep application data in `%APPDATA%\Smart SDA`, separately from the portable EXE; replacing the EXE does not create an isolated profile. Existing installations retain this original directory. Fresh installations normally use `%APPDATA%\smart-auth`. A vault or recovery backup in the original directory takes precedence; an empty original directory does not hide a vault in the new directory. No data is moved or merged; upgrades reuse the vault without reimporting accounts.
4. Configure and check account proxies, then review confirmations and automation settings before enabling them. UI locking can leave background work running; use full Exit to stop it.
5. First account-browser use requires internet access and acceptance of Google terms. Failed or cancelled downloads can be retried. Local authenticator features do not require the browser download.

See the [user guide](USER-GUIDE.md) for import, backup and browser-profile limits and [build instructions](BUILD.md) for building from clean source. English is the default documentation language; [Ukrainian](../README.uk.md) and [Russian](../README.ru.md) READMEs are also available.

## Terms

Use is free of charge for personal and internal business purposes. Modifying, forking or redistributing smart-auth requires the author's prior written permission, subject to applicable law, third-party licenses and platform rights. The software is provided as is. See [LICENSE](../LICENSE), [third-party notices](../THIRD-PARTY-NOTICES.md) and [distribution notes](DISTRIBUTION-NOTES.md) for complete terms. smart-auth is independent of Valve, Steam and Google.
