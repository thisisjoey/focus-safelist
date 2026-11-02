/*
 * Content-script state: settings, safelist, and whether Focus is active right
 * now. Behaviour is switched on through attributes on <html>, which the CSS
 * rules key off:
 *   data-yf-enabled   extension turned on (Safelist button shows)
 *   data-yf-on        filtering active now (enabled, not paused, in schedule)
 *   data-yf-shorts    Shorts blocked
 *   data-yf-endscreen / -comments / -explore / -bell   extra hiding
 *   data-yf-home      'feed' | 'filter' | 'subscriptions'
 *   data-yf-search    'blur' | 'hide' | 'show'
 *   data-yf-peek      user held "peek" and is looking at hidden tiles
 *   data-yf-route     'home' | 'watch' | 'search' | … (set by main.js)
 *   data-yf-theme     'light' | 'dark', for our own UI's colours
 */
(function () {
  'use strict';
  const C = globalThis.YFCore;
  const S = globalThis.YFStore;
  const ROOT = document.documentElement;
  const CACHE_KEY = 'yf-root';

  const YF = (globalThis.YF = {
    settings: C.mergeSettings(),
    channels: [],
    index: C.buildIndex([]),
    indexVersion: 0,
    state: C.focusState(C.mergeSettings()),
    ready: false,
    homeOverride: '', // set when the focus feed can't load
  });

  const ROOT_ATTRS = [
    'data-yf-enabled',
    'data-yf-on',
    'data-yf-shorts',
    'data-yf-endscreen',
    'data-yf-comments',
    'data-yf-explore',
    'data-yf-bell',
    'data-yf-home',
    'data-yf-search',
  ];

  YF.alive = function () {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  };

  YF.isSafe = (info) => C.isSafelisted(YF.index, info);
  YF.entryFor = (info) => C.findEntry(YF.channels, info);

  YF.route = function () {
    const p = location.pathname;
    if (p === '/') return 'home';
    if (p === '/watch') return 'watch';
    if (p === '/results') return 'search';
    if (p.startsWith('/feed/subscriptions')) return 'subscriptions';
    if (/^\/(@|channel\/|c\/|user\/)/.test(p)) return 'channel';
    return 'other';
  };

  function rootAttrs() {
    const s = YF.settings;
    const st = YF.state;
    const a = {};
    if (s.enabled) a['data-yf-enabled'] = '';
    if (st.shortsBlocked) a['data-yf-shorts'] = '';
    if (st.active) {
      a['data-yf-on'] = '';
      if (s.hideEndscreen) a['data-yf-endscreen'] = '';
      if (s.hideComments) a['data-yf-comments'] = '';
      if (s.hideExplore) a['data-yf-explore'] = '';
      if (s.hideNotifications) a['data-yf-bell'] = '';
      a['data-yf-home'] = YF.homeOverride || s.homeMode;
      a['data-yf-search'] = s.searchMode;
    }
    return a;
  }

  function writeRoot(attrs) {
    for (const name of ROOT_ATTRS) {
      if (name in attrs) {
        if (ROOT.getAttribute(name) !== attrs[name]) ROOT.setAttribute(name, attrs[name]);
      } else if (ROOT.hasAttribute(name)) {
        ROOT.removeAttribute(name);
      }
    }
  }

  YF.applyRoot = function () {
    const attrs = rootAttrs();
    writeRoot(attrs);
    // Remembered so the next page load can hide things before storage answers.
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(attrs));
    } catch (_) {}
  };

  YF.applyCachedRoot = function () {
    try {
      const attrs = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (attrs && typeof attrs === 'object') writeRoot(attrs);
    } catch (_) {}
  };

  // Light or dark, judged by YouTube's `dark` attribute or, failing that, by
  // how dark the page background actually is.
  function luminance(color) {
    const m = String(color).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m || m[4] === '0') return null; // transparent: look further up
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
  }
  let themeCheckedAt = 0;
  YF.updateTheme = function () {
    if (Date.now() - themeCheckedAt < 1000) return;
    themeCheckedAt = Date.now();
    let dark = ROOT.hasAttribute('dark');
    if (!dark) {
      for (const el of [document.querySelector('ytd-app'), document.body, ROOT]) {
        const l = el && luminance(getComputedStyle(el).backgroundColor);
        if (l !== null && l !== undefined) {
          dark = l < 0.5;
          break;
        }
      }
    }
    const theme = dark ? 'dark' : 'light';
    if (ROOT.getAttribute('data-yf-theme') !== theme) ROOT.setAttribute('data-yf-theme', theme);
  };

  YF.setChannels = function (channels) {
    YF.channels = channels;
    YF.index = C.buildIndex(channels);
    YF.indexVersion++;
  };

  YF.refreshState = function () {
    YF.state = C.focusState(YF.settings);
    YF.applyRoot();
  };

  YF.load = async function () {
    const { settings, channels } = await S.loadAll();
    YF.settings = settings;
    YF.setChannels(channels);
    YF.refreshState();
    YF.ready = true;
  };

  /* Videos the user chose to watch anyway, for this browser tab only. */
  const ALLOW_KEY = 'yf-allowed-videos';
  function allowed() {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(ALLOW_KEY) || '[]'));
    } catch (_) {
      return new Set();
    }
  }
  YF.isVideoAllowed = (vid) => !!vid && allowed().has(vid);
  YF.allowVideo = function (vid) {
    if (!vid) return;
    const set = allowed();
    set.add(vid);
    try {
      sessionStorage.setItem(ALLOW_KEY, JSON.stringify([...set].slice(-200)));
    } catch (_) {}
  };

  // Tiny element builder. YouTube enforces Trusted Types, so no innerHTML.
  YF.h = function (tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
  };

  YF.toast = function (text) {
    if (!document.body) return;
    let el = document.getElementById('yf-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'yf-toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.add('yf-show');
    clearTimeout(el._yfTimer);
    el._yfTimer = setTimeout(() => el.classList.remove('yf-show'), 3200);
  };

  YF.openOptions = function () {
    if (YF.alive()) chrome.runtime.sendMessage({ type: 'yf:openOptions' }).catch(() => {});
  };
})();
