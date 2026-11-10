# smart-auth

**BETA — still under testing. Use at your own risk.** This prerelease may cause loss of data, items, balances or account access. Back up your data and review automated actions before use.

**English** · [Українська](README.uk.md) · [Русский](README.ru.md)

Windows Steam authenticator with encrypted local storage, per-account proxies, trade and market confirmations, persistent browser profiles, Loot automation, and password/2FA managers.

**Current version: 0.14.4-beta.2.** The interface supports English, Ukrainian and Russian. English is the primary documentation language; Ukrainian and Russian README versions are available above. Application translations are stored separately under `src/locales/`.

[User guide](docs/USER-GUIDE.md) · [Build instructions](docs/BUILD.md) · [Release notes](docs/RELEASE-0.14.4-beta.2.md) · [License](LICENSE)

## Features

- Steam Guard codes, account folders, notes, import/export and bulk actions.
- Individual proxy routes, folder allocation, fallback proxies and proxy checks. Direct Steam connections are disabled by default.
- Review and confirm market or trade requests with item and counterparty details; configurable polling and automation.
- Persistent browser profiles with separate web sessions, account-specific proxies and extension preferences.
- Parallel Loot schemes with source/warehouse selection, per-source processing, retries and progress.
- Local password manager, password generation and a separate non-Steam TOTP/HOTP manager.
- Encrypted vault, optional app TOTP and PIN, automatic interface locking, tray actions, light/dark themes.

## Start using the app

Use `smart-auth-0.14.4-beta.2-win-x64.exe` from the prepared release assets or the project's Releases section once published. Node.js is not required for the EXE. Compare the download with its accompanying `SHA256SUMS.txt`.

1. Read the [license](LICENSE) and [distribution notes](docs/DISTRIBUTION-NOTES.md).
2. Fully exit any previous version, including its tray process, then start the EXE.
3. Create or unlock your local vault. Store your password and recovery information safely.
4. Import your authenticator accounts, configure their proxies, and check the routes before enabling automation.
5. Review account and automation settings. Keep an independent backup before bulk operations.

Existing installations normally retain application data under `%APPDATA%\Smart SDA`, independently of the portable EXE. Updating the executable does not require reimporting accounts. UI locking hides all application windows while already-running Loot and configured polling continue. Fully exiting the application stops background work. See the [user guide](docs/USER-GUIDE.md) for backup and browser-profile limits. Existing installations retain this original directory. Fresh installations normally use `%APPDATA%\smart-auth`. An existing vault or recovery backup in the original directory takes precedence; an empty original directory does not hide a vault in the new directory. Data is not moved or merged.

## Build on Windows x64

Use **Node.js 24** and **pnpm 11.25.0**:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm dist
```

The EXE is written to `release/smart-auth-0.14.4-beta.2-win-x64.exe`. The EXE and source ZIP contain no Google Chrome runtime. First account-browser use offers a direct Google download after accepting Google terms; later launches reuse the versioned local cache. Build and verification run locally; this repository does not require GitHub Actions. See [build instructions](docs/BUILD.md).

The prepared source archive contains application code and build tools. Build outputs are excluded from Git. Download the portable EXE separately from the release assets.

## License and third-party components

Copyright (c) 2026 smart-auth author and the respective rights holders. smart-auth uses a [proprietary use license](LICENSE): use is free of charge for personal and internal business purposes. Modifying, forking or redistributing smart-auth requires the author's prior written permission, subject to applicable law, third-party licenses and platform rights. See the license for the complete terms.

The software is provided **as is**, subject to the license's warranty and liability limitations and mandatory legal rights. It does not guarantee preservation of data, items, balances or account access. Steam restrictions and service changes remain outside the application's control.

Third-party code, browser runtimes, extensions and research materials retain their own terms. See [third-party notices](THIRD-PARTY-NOTICES.md), [supplemental licenses](docs/THIRD-PARTY-LICENSES.txt), and [browser redistribution review](docs/DISTRIBUTION-NOTES.md). smart-auth is independent and is not affiliated with Valve, Steam, Google, SIH or the referenced upstream projects.
