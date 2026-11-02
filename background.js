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
});

// Content scripts can't open the options page themselves.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'yf:openOptions') chrome.runtime.openOptionsPage();
});
