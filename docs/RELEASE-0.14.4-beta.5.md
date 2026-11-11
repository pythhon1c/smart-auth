# smart-auth 0.14.4-beta.5

**BETA — still under testing. Use at your own risk.** Keep an independent backup of your data before upgrading or enabling automation.

- Settings → Chromium browser now supports local extension ZIP packages through a native file picker. The list shows each package's name and version and supports enable, disable and remove actions. Changes stay in the draft until Save settings; reopen active account browsers to apply them on the next launch.
- Smart Trader remains a separate control. Local packages cannot claim a verified Chrome Web Store identity, and existing Web Store configuration remains available.
- Imports validate Manifest V3 compatibility, required resources, archive paths and size limits before staging a package. Unsupported privileged browser permissions are rejected. Only import extensions you trust: their permitted pages can include Steam.
- Local extension files are stored separately from the encrypted vault. Keep original ZIPs for recovery or transfer; vault backups and account exports do not contain their files. Changed package contents can receive a new identity with separate browser preferences.
- Existing vaults start with an empty local-extension list. Existing accounts, browser profiles and unrelated settings are preserved.

Users on beta.4 can upgrade from **Settings → App updates** after publication. The updater verifies the EXE and backs up the encrypted vault before restarting. For a manual upgrade, fully exit the previous version and start the new Windows x64 EXE. This beta is unsigned.

See the [user guide](USER-GUIDE.md#local-zip-extensions), [build instructions](BUILD.md), and [license](../LICENSE).
