# smart-auth 0.14.4-beta.3

**BETA — still under testing. Use at your own risk.** Bugs or automated actions may cause loss of data, items, balances or account access. Keep independent backups and review account routes and automation before use.

## Single-account import

Choose **Import → Source → One .maFile** to import a single authenticator file and enter its Steam password and individual proxy in the same form. Both fields are optional. The proxy field accepts HTTP, HTTPS and SOCKS5 addresses, including `host:port:login:password`.

The import review shows whether a password will be added and whether an individual proxy was supplied. Applying the import stores the account and its proxy together in the encrypted vault. Existing accounts continue through the duplicate and password-conflict checks.

## Windows appearance

The default interface language follows the Windows display language for Ukrainian and Russian and falls back to English for other languages. The default theme follows the Windows light or dark app setting and updates while the application is open. You can override either preference independently or choose **System** to follow Windows again.

## Download and update

The **Updates** section in Settings checks the official GitHub repository and downloads newer builds for this application. Before restarting, smart-auth rechecks the download and makes a separate encrypted vault backup. The new EXE opens the same data folder. To upgrade from beta.2, download this release manually once.

- `smart-auth-0.14.4-beta.3-win-x64.exe` is the portable Windows x64 application.
- `smart-auth-0.14.4-beta.3-source.zip` contains the source and build instructions.
- `SHA256SUMS.txt` contains the release file checksums.

Fully exit the earlier version, including its tray process, and back up your vault before launching the new EXE. Existing installations reuse their saved application data. The executable is unsigned.

Account browsers download Google Chrome for Testing directly from Google on first use after acceptance of its terms. Existing browser installations reuse the versioned local cache.

See the [user guide](USER-GUIDE.md), [build instructions](BUILD.md), [license](../LICENSE) and [third-party notices](../THIRD-PARTY-NOTICES.md). Use is free of charge. Modifications and redistribution require the author's permission under the license.
