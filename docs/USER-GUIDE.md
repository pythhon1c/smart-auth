# smart-auth user guide

**BETA — still under testing. Use at your own risk.** Version 0.14.4-beta.2 may cause loss of data, items, balances or account access. Keep an independent backup and review automation settings before use.

This guide covers **0.14.4-beta.2**, Windows x64. smart-auth manages existing Steam authenticators, codes for other services, and a local password manager. It does not enroll, transfer, or revoke Steam Mobile Authenticators or perform SMS registration. For source builds, see [BUILD.md](BUILD.md).

Use is free of charge for personal and internal business purposes. Modifying, forking or redistributing smart-auth requires the author's prior written permission, subject to applicable law, third-party licenses and platform rights. See [LICENSE](../LICENSE) for complete terms.

## First launch and access

1. Run `smart-auth-0.14.4-beta.2-win-x64.exe`. Node.js and pnpm are not required. First account-browser installation requires an internet connection.
2. Enter and repeat a unique vault password of at least **15 characters**, then create the vault. On subsequent launches, enter the password to unlock it. This password is separate from your Steam passwords.
3. Choose your preferred appearance in Settings. Optionally configure login TOTP and a 6-12 digit PIN for the current open session.
4. Create an encrypted vault backup after setup and important changes. Keep its access credentials and recovery materials separately.

The PIN cannot open the vault after an application restart. Default inactivity timeouts are 2 minutes for PIN lock and 10 minutes for password lock. Configure them independently; `0` disables the corresponding timer. Five incorrect PIN attempts require primary authentication. If login TOTP is enabled, provide the required fresh code alongside the configured access credentials. A previously accepted code cannot be reused within the same time step.

**Locking hides the interface while retaining the working key in memory.** Account browsers close and application windows hide private content. Already running Loot, its retries, and configured background confirmations or acceptance can continue. New scheduled Loot runs wait for unlock. Use the application's full Exit action to stop work and release keys accessible to the application. If hiding to the system tray is enabled, closing the main window may only hide it.

## Import Steam accounts

Open Import, select a format, and choose pasted text, one or more files, or a folder. Review the summary, warnings, destination folder, and duplicate policy before applying the import. Cancel discards the prepared changes.

Supported inputs include:

- Unencrypted canonical `.maFile` / JSON from SDA and compatible SIH or Nebula exports.
- Supported Deps, Nan, and `.steamsession` records, including compatible companion files.
- smart-auth native portable JSON and its encrypted variant.
- **Trade Bots System v1** JSON/TXT or an unpacked package folder. Select the root containing `manifest.json` to preserve package proxy assignments.
- Steam password lists in `login:password` form, which enrich uniquely matched accounts. Password lists alone do not create authenticators. Supported four-field account exports discard the email password.

Unpack ZIP archives before importing. Encrypted SDA maFiles/manifests and third-party vaults must first be exported in a supported form using their original application. smart-auth does not decrypt those vendor formats or accept arbitrary browser-extension databases.

Confirmations require the original `identity_secret` and enrolled `device_id`. An import without the necessary enrolled-device data may only generate offline codes; the app shows its limitations and does not invent a device ID. A TBS record without authenticator secrets cannot generate Steam Guard codes. A stored token does not prove that authentication is valid.

Native imports support skipping, replacing, or filling missing fields for duplicates. Replacement can change the account's folder, route, and fields. Newly imported or replaced accounts start with periodic checks and automatic actions disabled. Financial action history is combined conservatively instead of being reset by import.

## Folders and proxies

Create nested folders from the sidebar, move selected accounts, and use search, filters, and bulk actions. A selected import folder may supply a destination-group name; importing does not automatically reproduce every source subdirectory.

Import proxy lists from text or files. Supported forms include HTTP, HTTPS, and SOCKS5 URLs, `host:port:login:password`, `login:password@host:port`, and `host:port`. A list holds up to 2,000 addresses. In a folder's proxy settings, select ordered lists and save/redistribute: the first list supplies primary addresses and later lists supply backups. Address reuse and additional free backups require explicit selection in the allocation preview.

For one account, use Assign proxy. Enter an address or choose a free list member and make it primary or backup. Manual assignment gives the account its own route. Use the proxy check action to test it; assigning an address does not establish that it works.

**Direct account connections are disabled by default.** Without a route, network actions fail. The separate option to allow operation without a proxy applies only to accounts with no assigned route. Failure of an assigned proxy never enables a direct fallback. If no permitted backup is available, the request fails.

This policy covers smart-auth's network paths; it is not a system VPN or firewall. The browser-extension package downloader may contact allowlisted package hosts directly without a Steam session. Proxy credentials can be revealed by explicit local editing actions, so protect the unlocked interface.

## Steam Guard, sign-in, and confirmations

Open an account to view or copy Steam Guard. Codes are generated locally and depend on the correct Windows clock. Network functions require a working route and Steam session. If refresh fails, sign in with a typed or saved Steam password and handle any required Steam Guard/email challenge.

Typing a password for manual sign-in does not save it automatically. The saved-password editor updates only the encrypted local record; it does not change the password on Steam.

Open Confirmations from the account profile or context menu. Inspect the counterparty, direction, items, and quantities, expand details, and explicitly accept or reject. Incomplete data and unavailable images are marked. Check an uncertain result in official Steam: the app records dispatch intent before sending and prevents unsafe repetition of the same action.

Account settings separately control periodic checks, notifications, and automatic confirmation of market sales, market purchases, and trades. Confirmation intervals range from 30 to 86,400 seconds, with a default of 60. New accounts have automation disabled. **Automatic trade confirmation accepts all current trade confirmations for that account**, including trades that are not gifts. That rule has no recipient or price limit. Unknown confirmation types are never automatically accepted.

Incoming-offer watching and automatic gift acceptance are separate settings, disabled by default. They inspect both sides of an offer. An uncertain response is not treated as success. Adding a Steam administrator grants broader authority: accounts with incoming watching can also accept two-sided trades and outgoing-item transfers from that administrator. Add only Steam identities whose authority you intend to grant.

## Account browsers

Open the browser from an account or for selected accounts. First use shows the pinned Google Chrome for Testing version, source, and Google terms. Accept to download directly from Google; download and extraction progress is displayed. Declining leaves it uninstalled, and failed or cancelled downloads can be retried. The verified versioned cache lives with application data, separately from account profiles. Later launches reuse it without another download. Updating the runtime preserves existing account browser profiles. Each uses its own saved Chromium profile, session, and checked proxy. The simultaneous-account limit defaults to 10 and is configurable from 1 to 100. Browser settings control extensions, language, theme, and related preferences.

The independent browser web session is enabled by default. Its first sign-in needs a saved Steam password. Valid web tokens are reused without overwriting the mobile authenticator session. Additional Steam challenges are not bypassed. Independent web-session mode and authenticator-session mode have separate persistent browser directories. Changing relevant settings may close active browsers.

Cookies, site data, and extension preferences survive normal browser closure. **The Chromium directory is not fully encrypted with the smart-auth vault password.** It is not included in vault backups or account JSON exports, and locking does not erase its files. Browser fingerprint settings do not guarantee anonymity or prevent accounts from being linked.

## Loot

Open Loot and create a scheme. Select sources, storage accounts, games, and the senders allowed for each storage account. Every source must have an allowed destination. Review destinations in the optional Loot preview, or start collection to prepare and process sources without first loading every inventory.

Scheduling is disabled by default. Defaults are a 4-hour cycle, 3 parallel accounts per scheme, and 30 seconds between actual sends. Temporary source failures are retried after the first pass, after 60 seconds, with up to 2 additional attempts. Set additional attempts to zero to disable retries. Multiple schemes share protection against sending the same reserved assets twice; the overall limit is 4 concurrent account operations.

New internal storage accounts receive gift-acceptance mode; review this setting before starting. Known Community bans and detected game-specific restrictions can block sending. An unknown ban result does not mean that no ban exists.

Watch the scheme's progress and action history. Sent means an offer was created; Delivered requires separate trade-result verification. Uncertain responses keep items reserved until reconciliation. Refreshing trade status reads Steam and does not resend the offer. UI lock does not stop active Loot; use the scheme's stop action or fully exit the application to stop it.

## Password manager and other-service 2FA

The password manager opens a separate local window. Create a folder and entry, set the password, notes, and custom fields, then save. It includes a generator, tags, favorites, history, and a recycle bin. Leaving an existing secret's edit field empty preserves it; use the explicit clear action to remove its value. All entries use the shared encrypted vault. KDBX compatibility, Auto-Type, and browser autofill are not supported.

In **2fa (not steam)**, add Base32 secrets, standard `otpauth://` URIs, or Google Authenticator migration QR images/text. Select every part of a multipart export together. Review the preview and compare generated codes before completing a transfer. TOTP and HOTP are supported; the explicit next-HOTP action advances its counter, while copying the code does not. Codes are calculated locally without cloud synchronization. Export QR images contain authenticator secrets.

## Backups, exports, and recovery

| Operation                              | Contents                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encrypted vault backup                 | All shared vault data: Steam, proxies, settings, financial action history, password-manager entries, and other-service 2FA; excludes Chromium's directory            |
| Native smart-auth account export        | Selected Steam accounts, related groups and action history, and optional proxies; excludes password-manager entries, other-service 2FA, and vault access credentials |
| Classic `.maFile` with `manifest.json` | Compatible authenticator and mobile-session data; excludes native saved passwords, proxy routes, and smart-auth action history                                        |

Unencrypted native JSON and classic maFiles expose secrets as plaintext. For an encrypted smart-auth export, choose a separate passphrase of at least 15 characters. Classic maFiles do not use smart-auth export encryption or transfer its financial replay protections. Keep exports, QR images, vaults, and proxy credentials private.

Existing installations retain **`%APPDATA%\Smart SDA\smart-sda.vault`**. Fresh installations normally use **`%APPDATA%\smart-auth\smart-sda.vault`**. Selection checks only for the existence of `smart-sda.vault` or `smart-sda.vault.bak`: the original directory wins if it contains either; otherwise the new directory wins if it contains either. If neither contains a vault or backup, an existing original directory is retained to preserve browser sessions; otherwise the new directory is used. Discovery does not move, merge or overwrite data. Upgrades reuse the vault without reimporting accounts. An explicit `--user-data-dir` selects that directory instead. Browser profiles and the downloaded runtime remain under the selected directory as `browser-sessions` and `browser-runtime`. Its adjacent `.bak` is a current recovery mirror, not version history. A portable EXE still stores these files outside itself.

To restore manually:

1. Fully exit the application, including its tray process.
2. Preserve the current `smart-sda.vault` and `smart-sda.vault.bak` in another directory, even if one appears damaged or a partial-save error occurred.
3. Copy a verified encrypted backup into place as `smart-sda.vault`.
4. Start the application with the password and TOTP policy in effect when that backup was created. A passwordless backup requires the original Windows profile/machine. Check restored data and actual Steam trading results before re-enabling automation.

Changing the vault password does not update previously exported backups. Restoring an old vault also restores its old credentials, policies, data, and action history; it does not reverse events on Steam. Do not overwrite your only recovery copy with an empty vault.

## Security boundaries

The vault uses AES-256-GCM and scrypt. Login TOTP is an application access check, not an independent encryption key against offline decryption. Passwordless mode relies on Windows DPAPI. A session PIN cannot replace a forgotten vault password after restart.

Unlocked memory, ordinary browser profiles, and the system clipboard depend on a trusted operating system. A copied secret is cleared after about 10 seconds only if the clipboard text still matches. Windows clipboard history and synchronization are not cleared. Protection against malware or an administrator reading process memory is not guaranteed. Full exit releases keys accessible to the application, but absolute erasure of every JavaScript or operating-system memory copy cannot be guaranteed.
