/*
 * Wiring: start-up, reacting to YouTube's page changes and to settings
 * changes, URL rules (Shorts, home redirect), and the popup's questions.
 */
(function () {
  'use strict';
  const S = globalThis.YFStore;
  const YF = globalThis.YF;
  const ROOT = document.documentElement;
  const TOAST_KEY = 'yf-toast';

  function redirect(to, toast) {
    try {
      if (toast) sessionStorage.setItem(TOAST_KEY, toast);
    } catch (_) {}
    location.replace(to);
    return true;
  }

  function checkUrlRules() {
    const p = location.pathname;
    if (ROOT.hasAttribute('data-yf-shorts')) {
      if (p.startsWith('/shorts')) return redirect('/', 'Shorts are blocked by Focus Safelist');
      const m = p.match(/^(\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+))\/shorts\/?$/);
      if (m) return redirect(m[1] + '/videos', 'Shorts are blocked by Focus Safelist');
    }
    if (p === '/' && ROOT.getAttribute('data-yf-home') === 'subscriptions') return redirect('/feed/subscriptions');
    return false;
  }

  let warnedStale = false;
  function scan() {
    if (!YF.ready) return;
    if (!YF.alive()) {
      // The extension was reloaded or updated; this old copy can't reach storage.
      if (!warnedStale) YF.toast('Focus Safelist was updated. Reload this tab to keep filtering.');
      warnedStale = true;
      return;
    }
    if (checkUrlRules()) return;
    const route = YF.route();
    if (ROOT.getAttribute('data-yf-route') !== route) ROOT.setAttribute('data-yf-route', route);
    YF.updateTheme();
    if (ROOT.hasAttribute('data-yf-on')) YF.filterTiles();
    YF.markShortsChips();
    YF.updateButton();
    YF.updateGate();
    YF.enforceAutoplayOff();
    YF.updateHomeFeed();
    YF.enrichFromPage();
    YF.updatePill();
  }

  // Leading-edge throttle: react at once, then at most every 100 ms.
  let queued = false;
  let lastRun = 0;
  function queueScan() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      lastRun = Date.now();
      try {
        scan();
      } catch (err) {
        console.debug('[Focus Safelist]', err);
      }
    }, Math.max(0, 100 - (Date.now() - lastRun)));
  }

  function showPendingToast() {
    let text = null;
    try {
      text = sessionStorage.getItem(TOAST_KEY);
      sessionStorage.removeItem(TOAST_KEY);
    } catch (_) {}
    if (!text) return;
    if (document.body) YF.toast(text);
    else document.addEventListener('DOMContentLoaded', () => YF.toast(text), { once: true });
  }

  /* ---------- Start ---------- */

  // Use the last known state straight away so Shorts and unsafe tiles are
  // hidden before storage has even answered.
  YF.applyCachedRoot();
  YF.injectRules();
  checkUrlRules();
  ROOT.setAttribute('data-yf-sel', JSON.stringify(globalThis.__YF_SEL.pageWorld));

  new MutationObserver(queueScan).observe(ROOT, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'aria-checked', 'data-yf-key', 'data-yf-watch', 'data-yf-channel'],
  });

  document.addEventListener('yt-navigate-start', () => {
    YF.markNavigation();
    if (ROOT.hasAttribute('data-yf-peek')) YF.setPeek(false);
  });
  document.addEventListener('yt-navigate-finish', queueScan);
  document.addEventListener('fullscreenchange', () => YF.updatePill());

  // Stop clicks on any Short that slips through before YouTube navigates.
  document.addEventListener(
    'click',
    (e) => {
      if (!ROOT.hasAttribute('data-yf-shorts')) return;
      const a = e.target instanceof Element && e.target.closest('a[href^="/shorts"], a[href^="https://www.youtube.com/shorts"]');
      if (!a) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      YF.toast('Shorts are blocked by Focus Safelist');
    },
    true
  );

  YF.load()
    .then(() => {
      showPendingToast();
      queueScan();
    })
    .catch((err) => console.warn('[Focus Safelist] could not load settings', err));

  S.onChange(async () => {
    if (!YF.alive()) return;
    await YF.load();
    queueScan();
  });

  // Schedule windows and pauses end on their own; re-check twice a minute.
  setInterval(() => {
    if (!YF.ready || !YF.alive()) return;
    YF.refreshState();
    queueScan();
  }, 30000);

  YF.startStats();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'yf:getPage') return;
    const info = YF.pageInfo();
    sendResponse({ route: YF.route(), info, safelisted: !!info && YF.isSafe(info) });
  });
})();
