# smart-auth 0.14.4-beta.4

**BETA — still under testing. Use at your own risk.** Keep an independent backup of your data before upgrading or enabling automation.

- General Settings groups controls by task and keeps Save accessible in narrow windows. The full path of the active data folder is visible at the top. Click the path and press Ctrl+C to copy it into Windows Explorer.
- App updates shows the installed version immediately. Select **Check for updates** to see the latest compatible Windows build on GitHub. Select the version button for download and restart details.
- When an imported account has no Steam session, confirmations and incoming offer checks can sign in using its saved Steam password before continuing. If the password is missing, opening that account's confirmations prompts for sign-in and resumes the list after authentication. Login follows the account's proxy settings.
- The account browser uses the session type selected in Settings. Independent web sessions and mobile authenticator sessions are stored separately.
- Inactivity locking is off by default, so open account browsers stay open while you work. An upgrade turns the former default pair of 2 and 10 minutes off. Other configured intervals are preserved. To enable timers, set the intervals in **Settings → Locking**. Manual locking, Windows screen locking and system suspend still lock the app and close account browsers.

Users on beta.3 can upgrade from **Settings → App updates**. The updater verifies the EXE and backs up the encrypted vault before restarting. For a manual upgrade, fully exit the previous version and start the new Windows x64 EXE. This beta is unsigned.

See the [user guide](USER-GUIDE.md), [build instructions](BUILD.md), and [license](../LICENSE).
