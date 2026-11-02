# Chrome Web Store submission

Copy and paste for each tab of the Developer Dashboard. Upload the package built by `sh scripts/package.sh`, which is `dist/focus-safelist-<version>.zip`.

---

## Store listing tab

**Name** (taken from the manifest): Focus Safelist for YouTube

**Summary** (taken from the manifest, 112 of 132 characters):
See only videos from channels you trust. Hides other recommendations and Shorts so YouTube stops pulling you in.

**Description:**

```
YouTube is built to keep you watching. Focus Safelist keeps it useful.

Pick the channels you trust (your safelist), and Focus Safelist hides everything else: the endless recommendations on the home page, the sidebar next to the video you're watching, and Shorts.

HOW IT WORKS
• Click "+ Safelist" next to the Subscribe button on any video or channel page.
• Your home page becomes a calm feed of new uploads from your safelisted channels.
• The sidebar next to a video only suggests videos from your safelist.
• Opening a video from another channel asks first: "Is this video what you came to YouTube for?" You can go back, watch it once, or add the channel.

FEATURES
• Calm home page: the latest uploads from your channels, in YouTube's familiar layout
• Safelist button next to Subscribe on watch pages and channel pages
• Shorts blocked everywhere: shelves, tabs, links and /shorts pages
• Search still works, and results from other channels are blurred until you click
• Autoplay turned off and end-screen suggestions hidden
• Optional: hide comments, Explore and Trending, and the notifications bell
• "Hold to peek" when you want to see what's hidden
• Schedule: filter only during work hours, if you like
• Optional lock: add a countdown or a typed sentence before turning Focus off
• Watch-time summary: time spent on your safelist vs. everything else
• Works in light and dark mode
• Settings and safelist sync across your Chrome browsers
• Import and export your safelist

PRIVATE BY DESIGN
No accounts, no analytics, no tracking, and no servers. Your safelist and settings stay in your browser, synced only by Chrome itself. The extension talks only to youtube.com.

OPEN SOURCE
Read the code, report issues or contribute: https://github.com/thisisjoey/focus-safelist

Focus Safelist is an independent project and is not affiliated with or endorsed by YouTube or Google.
```

**Category:** Productivity › Workflow & Planning

**Language:** English

**Graphic assets** (all in this folder):

| Field | File |
|---|---|
| Store icon (128×128) | `../icons/icon128.png` |
| Screenshots (1280×800) | `screenshot-1-home.png` to `screenshot-5-settings.png`, in that order |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560), optional | `marquee-1400x560.png` |

**Homepage URL:** https://github.com/thisisjoey/focus-safelist
**Support URL:** https://github.com/thisisjoey/focus-safelist/issues

---

## Privacy practices tab

**Single purpose description:**

```
Reduces distraction on YouTube by showing videos only from channels the user has chosen (their safelist), and hiding other recommendations and Shorts.
```

**Permission justification for `storage`:**

```
Saves the user's safelist of channels and their settings (synced across the user's own Chrome browsers by Chrome Sync), plus daily watch-time totals and a short-lived cache of the safelisted channels' latest uploads, both kept locally.
```

**Permission justification for the host permission (`https://www.youtube.com/*`):**

```
The extension only works on YouTube. It needs access to YouTube pages to hide recommendations from channels that aren't on the user's safelist, add a Safelist button next to Subscribe, block Shorts, and fetch safelisted channels' public Videos pages to build the user's home feed.
```

**Are you using remote code?** No, I am not using remote code. (All JavaScript ships inside the package.)

**Data usage:** leave every data type unchecked. Nothing is collected or transmitted to the developer or to third parties. Everything stays in the user's browser (see PRIVACY.md). Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/thisisjoey/focus-safelist/blob/main/PRIVACY.md

---

## Distribution tab

- **Visibility:** Public
- **Regions:** All regions

---

## Test instructions (optional, helps reviewers)

```
No account or login is needed.
1. Open any YouTube video, e.g. https://www.youtube.com/watch?v=eyZEqSPeMwg (Veritasium).
2. Click "+ Safelist" next to the Subscribe button. It changes to "✓ Safelisted".
3. Open https://www.youtube.com/. The home page now shows "Latest from your safelist".
4. Open a video from another channel. A "Watch anyway?" prompt appears.
5. Search for anything. Results from non-safelisted channels are blurred; click one to reveal it.
6. Click the extension icon, then "Manage safelist & settings", to see all options.
```
