# smart-auth 0.14.4-beta.10

**Beta software, still under testing. Use at your own risk.** Back up the encrypted vault before upgrading.

- smart-auth explicitly identifies its windows to Windows Explorer and uses the stable portable launcher for its taskbar identity. This fixes taskbar icon and grouping behavior; the executable icon resources were already correct in beta.9.
- Packaged smart-auth and development launches use separate Windows shell identities, preventing taskbar grouping with Electron development shortcuts. If an older pinned shortcut keeps its previous icon or group, launch the new portable executable and pin that running application again.
- Each managed Chrome profile uses the full Steam login as its profile name and Windows taskbar group label, with a colored two-letter account monogram to distinguish accounts.
- Close and reopen existing account browsers after upgrading to apply their updated profile name and taskbar identity.

See the [user guide](USER-GUIDE.md) and [Windows build instructions](BUILD.md).
