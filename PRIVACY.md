# Privacy Policy: Focus Safelist for YouTube

_Effective November 2, 2026_

Focus Safelist for YouTube ("the extension") is an open-source Chrome extension. It hides YouTube recommendations from channels you haven't chosen. This page explains what data the extension handles. In short: **your data stays in your browser. Nothing is sent to the developer or to any third party.**

## What the extension stores

| Data | Where it's stored | Why |
|---|---|---|
| Your safelist: each channel's ID, @handle, name and avatar image URL | `chrome.storage.sync` | So your safelist persists and follows you to other Chrome browsers signed into the same Chrome profile |
| Your settings (for example, Shorts blocking or your schedule) | `chrome.storage.sync` | Same as above |
| Daily watch-time totals: seconds watched from safelisted channels vs. other channels. No video titles, IDs or URLs are recorded. | `chrome.storage.local` (this computer only) | To show your watch-time summary |
| A cache of your safelisted channels' latest public uploads | `chrome.storage.local` (this computer only, refreshed every 20 minutes) | To build the "Latest from your safelist" home page quickly |
| Videos you chose to watch anyway, and search results you revealed | The YouTube tab's session storage (cleared when you close the tab) | So you aren't asked twice about the same video |

Data in `chrome.storage.sync` is synced by Chrome itself through your Google account, under Chrome Sync. The developer cannot access it.

## Network requests

The extension only communicates with **youtube.com**:

- It reads the YouTube pages you visit, in order to hide or blur videos and add the Safelist button.
- It fetches public YouTube pages (a channel's page or its Videos tab) to look up channels you add and to show their latest uploads.

These requests go directly from your browser to YouTube, exactly as when you visit those pages yourself. The extension has no servers of its own. It uses no analytics, tracking, advertising or remote code.

## Sharing and selling

The developer does not collect, sell or share any user data. None of the data above is transferred to anyone.

## Permissions

- **storage**: saves your safelist, settings and watch-time totals, as described above.
- **declarativeContent**: greys out the extension's toolbar button on sites other than YouTube. Chrome applies this rule itself; the extension never sees which sites you visit.
- **Access to www.youtube.com**: the extension only runs on YouTube, where it filters recommendations and fetches public channel pages.

## Removing your data

You can remove channels at any time on the extension's settings page. Uninstalling the extension deletes everything it stored.

## Changes

If this policy changes, the updated version will be published at this address with a new effective date.

## Contact

Questions or concerns: [open an issue](https://github.com/thisisjoey/focus-safelist/issues). The full source code is available at [github.com/thisisjoey/focus-safelist](https://github.com/thisisjoey/focus-safelist).
