/*
 * Watch and channel pages: the Safelist button next to Subscribe, the
 * "Watch anyway?" gate, autoplay, watch-time stats, and quietly filling in
 * missing details (ID, avatar) for channels already on the safelist.
 */
(function () {
  'use strict';
  const C = globalThis.YFCore;
  const S = globalThis.YFStore;
  const SEL = globalThis.__YF_SEL;
  const YF = globalThis.YF;
  const ROOT = document.documentElement;
  const h = YF.h;

  let navAt = Date.now();
  YF.markNavigation = () => {
    navAt = Date.now();
  };
  const settled = () => Date.now() - navAt > 2500;
  const urlVid = () => new URLSearchParams(location.search).get('v') || '';

  function readJson(attr) {
    try {
      return JSON.parse(ROOT.getAttribute(attr) || 'null');
    } catch (_) {
      return null;
    }
  }

  /* ---------- Who made what's on screen ---------- */

  // `fresh` means it came from the player's own data for this exact video.
  YF.watchInfo = function () {
    if (YF.route() !== 'watch') return null;
    const vid = urlVid();
    const main = readJson('data-yf-watch');
    if (main && main.vid === vid) {
      if (!main.avatar) {
        // The owner row is current if its link agrees with the player data.
        const link = document.querySelector(SEL.watchOwnerLink);
        const ch = C.channelFromHref(link && link.getAttribute('href'));
        const img = document.querySelector(SEL.watchOwnerAvatar);
        if (ch && img && img.src && ((ch.id && ch.id === main.id) || (ch.handle && ch.handle === C.normHandle(main.handle)))) {
          main.avatar = img.src;
        }
      }
      return { ...main, fresh: true };
    }
    // Fallback: the visible owner row. Right after navigating it can still
    // show the previous video's channel, so give it a moment first.
    if (!settled()) return null;
    const link = document.querySelector(SEL.watchOwnerLink);
    const ch = C.channelFromHref(link && link.getAttribute('href'));
    const nameEl = document.querySelector(SEL.watchOwnerName);
    const info = {
      vid,
      id: (ch && ch.id) || '',
      handle: (ch && ch.handle) || '',
      name: nameEl ? nameEl.textContent.trim() : '',
      avatar: '',
      fresh: false,
    };
    return info.id || info.handle || info.name ? info : null;
  };

  YF.channelInfo = function () {
    if (YF.route() !== 'channel') return null;
    const m = location.pathname.match(/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/);
    const main = readJson('data-yf-channel');
    if (main && m && main.path === '/' + m[1]) return { ...main, fresh: true };
    const fromUrl = C.channelFromHref(location.pathname);
    if (!fromUrl) return null;
    const browse = document.querySelector(SEL.channelBrowse);
    const title = settled() && browse && browse.querySelector(SEL.channelTitle);
    return { ...fromUrl, name: title ? title.textContent.trim() : '', avatar: '', fresh: false };
  };

  YF.pageInfo = function () {
    const route = YF.route();
    if (route === 'watch') return YF.watchInfo();
    if (route === 'channel') return YF.channelInfo();
    return null;
  };

  /* ---------- Safelist button ---------- */

  async function toggleSafelist(info) {
    if (!YF.alive()) {
      YF.toast('Focus Safelist was updated. Reload this tab to use it.');
      return;
    }
    const entry = YF.entryFor(info);
    if (entry && YF.isSafe(info)) {
      await S.removeChannel(entry.key);
      YF.toast(`Removed ${entry.name || 'this channel'} from your safelist`);
    } else {
      await S.addChannel({ id: info.id, handle: info.handle, name: info.name, avatar: info.avatar });
      YF.toast(`${info.name || 'Channel'} added to your safelist`);
    }
  }

  function makeButton(kind) {
    const btn = h(
      'button',
      { type: 'button', id: 'yf-safelist-btn', class: 'yf-safelist-btn', 'data-kind': kind },
      h('span', { class: 'yf-btn-icon', 'aria-hidden': 'true' }),
      h('span', { class: 'yf-btn-label' })
    );
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const info = kind === 'channel' ? YF.channelInfo() : YF.watchInfo();
      if (!info) return;
      btn.disabled = true;
      try {
        await toggleSafelist(info);
      } catch (err) {
        YF.toast((err && err.message) || 'Something went wrong');
      } finally {
        btn.disabled = false;
      }
    });
    return btn;
  }

  function placeButton(container, anchorSel, kind) {
    let btn = document.getElementById('yf-safelist-btn');
    if (btn && (btn.dataset.kind !== kind || !container.contains(btn))) {
      btn.remove();
      btn = null;
    }
    if (btn) return btn;
    btn = makeButton(kind);
    const anchor = anchorSel && container.querySelector(anchorSel);
    if (anchor) {
      let a = anchor;
      while (a.parentElement && a.parentElement !== container) a = a.parentElement;
      a.after(btn);
    } else {
      container.append(btn);
    }
    return btn;
  }

  YF.updateButton = function () {
    const route = YF.route();
    let container = null;
    let info = null;
    if (YF.settings.enabled && route === 'watch') {
      container = document.querySelector(SEL.watchOwnerRow);
      info = YF.watchInfo();
    } else if (YF.settings.enabled && route === 'channel') {
      const browse = document.querySelector(SEL.channelBrowse);
      container = browse && browse.querySelector(SEL.channelActions);
      info = YF.channelInfo();
    }
    if (!container) {
      const stale = document.getElementById('yf-safelist-btn');
      if (stale) stale.remove();
      return;
    }
    const btn = placeButton(container, route === 'watch' ? SEL.watchSubscribe : null, route);
    const safe = !!info && YF.isSafe(info);
    btn.hidden = !info;
    btn.classList.toggle('yf-on', safe);
    const icon = safe ? '✓' : '+';
    const label = safe ? 'Safelisted' : 'Safelist';
    const iconEl = btn.querySelector('.yf-btn-icon');
    const labelEl = btn.querySelector('.yf-btn-label');
    if (iconEl.textContent !== icon) iconEl.textContent = icon;
    if (labelEl.textContent !== label) labelEl.textContent = label;
    btn.title = safe
      ? 'On your Focus safelist. Click to remove.'
      : 'Add this channel to your Focus safelist so its videos show up';
  };

  /* ---------- "Watch anyway?" gate ---------- */

  let gate = null;
  let gateInfo = null;

  function playVideo() {
    const v = document.querySelector(SEL.video);
    if (v) v.play().catch(() => {});
  }

  function buildGate() {
    const primary = h('button', {
      type: 'button',
      class: 'yf-gate-primary',
      text: 'Go back',
      onclick: () => {
        if (history.length > 1) history.back();
        else location.assign('/');
      },
    });
    const el = h(
      'div',
      { id: 'yf-gate', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'yf-gate-title', hidden: true },
      h(
        'div',
        { class: 'yf-gate-card' },
        h('p', { class: 'yf-gate-eyebrow', text: 'Focus Safelist' }),
        h(
          'div',
          { class: 'yf-gate-channel' },
          h('img', { class: 'yf-gate-avatar', alt: '', hidden: true }),
          h('strong', { class: 'yf-gate-name' })
        ),
        h('h2', { id: 'yf-gate-title', class: 'yf-gate-title', text: "isn't on your safelist." }),
        h('p', { class: 'yf-gate-sub', text: 'Is this video what you came to YouTube for?' }),
        h(
          'div',
          { class: 'yf-gate-actions' },
          primary,
          h('button', {
            type: 'button',
            class: 'yf-gate-secondary',
            text: 'Watch this video',
            onclick: () => {
              if (!gateInfo) return;
              YF.allowVideo(gateInfo.vid);
              hideGate();
              playVideo();
            },
          })
        ),
        h('button', {
          type: 'button',
          class: 'yf-gate-link',
          text: '+ Add channel to safelist',
          onclick: async () => {
            if (!gateInfo) return;
            const info = gateInfo;
            try {
              YF.allowVideo(info.vid);
              await toggleSafelist(info);
              hideGate();
              playVideo();
            } catch (err) {
              YF.toast((err && err.message) || 'Something went wrong');
            }
          },
        })
      )
    );
    document.body.append(el);
    return el;
  }

  function showGate(info) {
    if (!document.body) return;
    if (!gate) gate = buildGate();
    const wasHidden = gate.hidden;
    gateInfo = info;
    gate.querySelector('.yf-gate-name').textContent = info.name || 'This channel';
    const img = gate.querySelector('.yf-gate-avatar');
    if (info.avatar) {
      if (img.getAttribute('src') !== info.avatar) img.src = info.avatar;
      img.hidden = false;
    } else {
      img.hidden = true;
    }
    gate.hidden = false;
    for (const v of document.querySelectorAll('video')) v.pause();
    if (wasHidden) gate.querySelector('.yf-gate-primary').focus({ preventScroll: true });
  }

  function hideGate() {
    gateInfo = null;
    if (gate) gate.hidden = true;
  }

  YF.gateOpen = () => !!gateInfo;

  YF.updateGate = function () {
    const info = YF.watchInfo();
    const want =
      !!info &&
      ROOT.hasAttribute('data-yf-on') &&
      YF.settings.gateWatch &&
      !YF.isSafe(info) &&
      !YF.isVideoAllowed(info.vid);
    if (want) showGate(info);
    else if (gateInfo) hideGate();
  };

  // Media events don't bubble, but capture listeners still see them.
  document.addEventListener(
    'play',
    (e) => {
      if (gateInfo && e.target instanceof HTMLMediaElement) e.target.pause();
    },
    true
  );

  /* ---------- Autoplay ---------- */

  // A few tries per video (the player can ignore clicks while it loads), then
  // leave it alone so a user who switches autoplay back on isn't overruled.
  const autoplay = { vid: '', tries: 0, at: 0, done: false };
  YF.enforceAutoplayOff = function () {
    if (!ROOT.hasAttribute('data-yf-on') || !YF.settings.disableAutoplay || YF.route() !== 'watch') return;
    const vid = urlVid();
    if (autoplay.vid !== vid) Object.assign(autoplay, { vid, tries: 0, at: 0, done: false });
    if (autoplay.done) return;
    if (document.querySelector(SEL.autoplayOff)) {
      autoplay.done = true;
      return;
    }
    const on = document.querySelector(SEL.autoplayOn);
    if (!on || autoplay.tries >= 4 || Date.now() - autoplay.at < 1500) return;
    autoplay.tries++;
    autoplay.at = Date.now();
    // The click handler is on the surrounding button, which may be hidden.
    (on.closest('button') || on).click();
  };

  /* ---------- Keep safelist entries complete ---------- */

  let enrichedFor = '';
  YF.enrichFromPage = function () {
    const info = YF.pageInfo();
    if (!info || !info.fresh || !info.id) return;
    const sig = info.id + '|' + (info.vid || info.path || '');
    if (enrichedFor === sig) return;
    const entry = YF.entryFor(info);
    if (!entry) return;
    enrichedFor = sig;
    // Only trust a match made on ID or handle, never on name alone.
    const strong =
      (entry.id && entry.id === info.id) ||
      (entry.handle && info.handle && C.normHandle(entry.handle) === C.normHandle(info.handle));
    if (!strong) return;
    const patch = {};
    if (!entry.id) patch.id = info.id;
    if (info.handle && C.normHandle(entry.handle) !== C.normHandle(info.handle)) patch.handle = info.handle;
    if (info.name && entry.name !== info.name) patch.name = info.name;
    if (info.avatar && !entry.avatar) patch.avatar = info.avatar;
    if (Object.keys(patch).length && YF.alive()) S.updateChannel(entry.key, patch).catch(() => {});
  };

  /* ---------- Watch time ---------- */

  const STATS_KEY = 'stats';
  let pending = { safe: 0, other: 0 };
  let unsaved = 0;
  let lastTick = Date.now();

  async function flushStats() {
    const add = pending;
    pending = { safe: 0, other: 0 };
    unsaved = 0;
    if ((!add.safe && !add.other) || !YF.alive()) return;
    try {
      const stats = await S.getLocal(STATS_KEY, {});
      const key = C.dayKey();
      const day = stats[key] || { safe: 0, other: 0 };
      day.safe = Math.round(day.safe + add.safe);
      day.other = Math.round(day.other + add.other);
      stats[key] = day;
      for (const old of Object.keys(stats).sort().slice(0, -90)) delete stats[old];
      await S.setLocal(STATS_KEY, stats);
    } catch (_) {}
  }

  function tick() {
    const now = Date.now();
    // Background tabs tick less often, so count real elapsed time (capped).
    const dt = Math.min(now - lastTick, 65000) / 1000;
    lastTick = now;
    if (YF.route() !== 'watch' || gateInfo) return;
    const v = document.querySelector(SEL.video);
    if (!v || v.paused || v.ended || v.readyState < 2) return;
    if (document.querySelector(SEL.player + '.ad-showing')) return;
    const info = YF.watchInfo();
    pending[info && YF.isSafe(info) ? 'safe' : 'other'] += dt;
    unsaved += dt;
    if (unsaved >= 20) flushStats();
  }

  YF.startStats = function () {
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushStats();
    });
    window.addEventListener('pagehide', flushStats);
  };
})();
