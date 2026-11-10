# Distribution notes

smart-auth 0.14.4-beta.2 is a beta, still under testing, and is used at your own risk. Use is free of charge. Modifying, forking or redistributing smart-auth requires the author's prior written permission, subject to applicable law, third-party licenses and platform rights. See [LICENSE](../LICENSE) for complete terms.

The smart-auth license covers only rights controlled by its licensor. Dependencies, third-party code and assets, extensions, and externally downloaded browsers retain their own terms. See [third-party notices](../THIRD-PARTY-NOTICES.md) and [dependency notices](THIRD-PARTY-LICENSES.txt).

## Browser delivery in 0.14.4-beta.2

The EXE and public source ZIP include no Google Chrome or Chrome for Testing executable files. They contain installer code and a pinned download manifest. On first account-browser use the user reviews and accepts Google's applicable terms before a direct Google download. Upstream ABOUT, terms and component credits remain in the user's versioned runtime cache.

Release verification rejects browser binaries and resource directories, requires the installer and manifest inside app.asar, and compares every extracted portable file with the unpacked build. Developer caches are excluded from release artifacts.

The previous bundled Chrome redistribution review is inapplicable to this release's browser delivery. distributionReviewRequired=false refers only to that removed bundled-browser question. It is not a blanket legal certification, permission to redistribute downloaded Google binaries, or waiver of obligations for other components. Preserve applicable notices when distributing smart-auth.
