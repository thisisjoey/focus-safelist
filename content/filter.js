/*
 * Hiding tiles. Every tile in a filtered area starts hidden (CSS) and is only
 * shown once we've confirmed its channel is safelisted, so nothing flashes
 * on screen while YouTube is still rendering.
 */
(function () {
  'use strict';
  const C = globalThis.YFCore;
  const SEL = globalThis.__YF_SEL;
  const YF = globalThis.YF;
  const ROOT = document.documentElement;

  const ON = 'html[data-yf-on]';
  const NO_PEEK = ':not([data-yf-peek])';
  const UNSAFE = ':not([data-yf-v="ok"])';

  function rules() {
    const blurred = `${ON}[data-yf-search="blur"]${NO_PEEK} :is(${SEL.searchTiles})${UNSAFE}:not([data-yf-revealed])`;
    return `
${ON}${NO_PEEK} :is(${SEL.filterTiles})${UNSAFE} { display: none !important; }
${ON}${NO_PEEK} :is(${SEL.clutter}) { display: none !important; }
${ON}[data-yf-peek] :is(${SEL.filterTiles}, ${SEL.searchTiles})${UNSAFE} { opacity: .38; }
${ON}[data-yf-search="hide"]${NO_PEEK} :is(${SEL.searchTiles})${UNSAFE} { display: none !important; }
${blurred} { position: relative !important; cursor: pointer !important; }
${blurred} > * { filter: blur(14px) grayscale(1) !important; opacity: .35 !important; pointer-events: none !important; user-select: none !important; }
${blurred}::after {
  content: "Not on your safelist · click to reveal";
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font: 500 14px/1.2 Roboto, Arial, sans-serif; color: var(--yt-spec-text-secondary, #606060);
  pointer-events: none; z-index: 2;
}
html[data-yf-shorts] :is(${SEL.shorts}) { display: none !important; }
${ON}[data-yf-endscreen] :is(${SEL.endscreen}) { display: none !important; }
${ON}[data-yf-comments] :is(${SEL.comments}) { display: none !important; }
${ON}[data-yf-explore] :is(${SEL.explore}) { display: none !important; }
${ON}[data-yf-bell] :is(${SEL.bell}) { display: none !important; }
${ON}[data-yf-home="feed"]${NO_PEEK} ${SEL.homeGrid} { display: none !important; }
${ON}[data-yf-home="feed"][data-yf-route="home"]${NO_PEEK} ${SEL.chipbarBackdrop} { height: 56px !important; }
`;
  }

  YF.injectRules = function () {
    if (document.getElementById('yf-rules')) return;
    const style = document.createElement('style');
    style.id = 'yf-rules';
    style.textContent = rules();
    ROOT.append(style);
  };

  /* ---------- Verdicts ---------- */

  const lastSig = new WeakMap();
  const REVEALED_KEY = 'yf-revealed';
  let revealed = new Set();
  try {
    revealed = new Set(JSON.parse(sessionStorage.getItem(REVEALED_KEY) || '[]'));
  } catch (_) {}

  function setAttr(el, name, value) {
    if (value === null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }

  function tileInfo(tile, key, name) {
    const info = { id: '', handle: '', name };
    if (key && tile.getAttribute('data-yf-key') === key) {
      info.id = tile.getAttribute('data-yf-cid') || '';
      info.handle = tile.getAttribute('data-yf-ch') || '';
    }
    if (!info.id || !info.handle) {
      for (const a of tile.querySelectorAll(SEL.channelLink)) {
        const ch = C.channelFromHref(a.getAttribute('href'));
        if (!ch) continue;
        info.id = info.id || ch.id;
        info.handle = info.handle || ch.handle;
        break;
      }
    }
    return info;
  }

  function decide(tile) {
    const key = SEL.tileKey(tile);
    const name = SEL.channelName(tile);
    const sig = [key, name, tile.getAttribute('data-yf-key'), tile.getAttribute('data-yf-cid'), YF.indexVersion].join('|');
    if (lastSig.get(tile) === sig) return;
    lastSig.set(tile, sig);
    // Ask page-world.js for the channel ID behind this video (it answers
    // through data-yf-key, which triggers another pass).
    if (key && tile.getAttribute('data-yf-key') !== key) setAttr(tile, 'data-yf-want', key);
    const ok = YF.isSafe(tileInfo(tile, key, name));
    setAttr(tile, 'data-yf-v', ok ? 'ok' : 'no');
    setAttr(tile, 'data-yf-revealed', !ok && key && revealed.has(key) ? '' : null);
  }

  YF.filterTiles = function () {
    for (const tile of document.querySelectorAll(SEL.allTiles)) decide(tile);
  };

  // Search filter chips are only identifiable by their label.
  YF.markShortsChips = function () {
    const block = ROOT.hasAttribute('data-yf-shorts');
    for (const chip of document.querySelectorAll(SEL.chips)) {
      setAttr(chip, 'data-yf-short-chip', block && chip.textContent.trim() === 'Shorts' ? '' : null);
    }
  };

  /* ---------- Click to reveal (search) ---------- */

  document.addEventListener(
    'click',
    (e) => {
      if (!ROOT.hasAttribute('data-yf-on') || ROOT.getAttribute('data-yf-search') !== 'blur') return;
      if (ROOT.hasAttribute('data-yf-peek')) return;
      const tile = e.target instanceof Element && e.target.closest(SEL.searchTiles);
      if (!tile || tile.getAttribute('data-yf-v') === 'ok' || tile.hasAttribute('data-yf-revealed')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const key = SEL.tileKey(tile);
      if (key) {
        revealed.add(key);
        try {
          sessionStorage.setItem(REVEALED_KEY, JSON.stringify([...revealed].slice(-300)));
        } catch (_) {}
        // You chose this one on purpose; don't ask again on the watch page.
        if (!key.includes(':')) YF.allowVideo(key);
      }
      tile.setAttribute('data-yf-revealed', '');
    },
    true
  );

  /* ---------- Hidden count + hold-to-peek pill ---------- */

  let pill = null;
  let holdTimer = 0;

  function hiddenCount() {
    const route = YF.route();
    const scope = SEL.scopes[route];
    if (!scope) return 0;
    if (route === 'search' && YF.settings.searchMode === 'show') return 0;
    const tiles = route === 'search' ? SEL.searchTiles : SEL.filterTiles;
    let n = 0;
    for (const t of document.querySelectorAll(`:is(${tiles})[data-yf-v="no"]`)) {
      if (t.closest(scope) && !t.hasAttribute('data-yf-revealed')) n++;
    }
    return n;
  }

  function buildPill() {
    const h = YF.h;
    const btn = h('button', { type: 'button', class: 'yf-pill-btn' },
      h('span', { class: 'yf-pill-fill' }),
      h('span', { class: 'yf-pill-label' }));
    pill = h('div', { id: 'yf-pill' },
      h('span', { class: 'yf-pill-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'yf-pill-text' }),
      btn,
      h('button', {
        type: 'button',
        class: 'yf-pill-gear',
        title: 'Focus Safelist settings',
        'aria-label': 'Focus Safelist settings',
        text: '⚙',
      }));
    const start = (e) => {
      if (ROOT.hasAttribute('data-yf-peek')) return;
      if (e.type === 'keydown' && (e.repeat || (e.key !== ' ' && e.key !== 'Enter'))) return;
      e.preventDefault();
      const secs = Math.max(1, Number(YF.settings.peekHoldSeconds) || 5);
      btn.style.setProperty('--yf-hold', secs + 's');
      btn.classList.add('yf-holding');
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        btn.classList.remove('yf-holding');
        YF.setPeek(true);
      }, secs * 1000);
    };
    const cancel = () => {
      clearTimeout(holdTimer);
      btn.classList.remove('yf-holding');
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('keydown', start);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur']) btn.addEventListener(ev, cancel);
    btn.addEventListener('click', () => {
      if (ROOT.hasAttribute('data-yf-peek')) YF.setPeek(false);
    });
    pill.querySelector('.yf-pill-gear').addEventListener('click', () => YF.openOptions());
    document.body.append(pill);
  }

  YF.setPeek = function (on) {
    if (on) ROOT.setAttribute('data-yf-peek', '');
    else ROOT.removeAttribute('data-yf-peek');
    YF.updatePill();
  };

  YF.updatePill = function () {
    if (!document.body) return;
    const peeking = ROOT.hasAttribute('data-yf-peek');
    const count = ROOT.hasAttribute('data-yf-on') ? hiddenCount() : 0;
    const show = (count > 0 || peeking) && !document.fullscreenElement;
    if (!show) {
      if (pill) pill.hidden = true;
      return;
    }
    if (!pill) buildPill();
    pill.hidden = false;
    pill.classList.toggle('yf-peeking', peeking);
    const text = peeking ? `Peeking at ${count} hidden` : `${count} hidden`;
    const label = peeking ? 'Hide again' : 'Hold to peek';
    const textEl = pill.querySelector('.yf-pill-text');
    const labelEl = pill.querySelector('.yf-pill-label');
    if (textEl.textContent !== text) textEl.textContent = text;
    if (labelEl.textContent !== label) labelEl.textContent = label;
  };
})();
