'use strict';
importScripts('lib/core.js');

// Runs whenever the service worker starts (install, update, reload, browser
// start), so saved settings always get upgraded. A no-op once up to date.
(async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  const migrated = YFCore.migrateSettings(settings);
  if (migrated) await chrome.storage.sync.set({ settings: migrated });
})();

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#welcome') });

  // The toolbar button is only useful on YouTube, so it's greyed out on every
  // other site and this rule turns it back on for YouTube pages. (Chrome
  // doesn't let an extension hide a pinned button.)
  chrome.action.disable();
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [new chrome.declarativeContent.PageStateMatcher({ pageUrl: { hostEquals: 'www.youtube.com', schemes: ['https'] } })],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
});

// Rules survive a browser restart; make sure the greyed-out default does too.
chrome.runtime.onStartup.addListener(() => chrome.action.disable());

// Content scripts can't open the options page themselves.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'yf:openOptions') chrome.runtime.openOptionsPage();
});
