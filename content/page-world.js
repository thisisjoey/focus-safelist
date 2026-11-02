/*
 * Runs in YouTube's own JavaScript world (not the extension's), because only
 * here can we read the data objects YouTube attaches to its elements. That
 * data carries the real channel ID behind every tile, which the visible
 * markup often doesn't (sidebar tiles only show the channel name).
 *
 * This script knows nothing about the safelist. It talks to the extension
 * world through DOM attributes only:
 *   html[data-yf-sel]           selectors it needs (written by the extension)
 *   tile[data-yf-want]          extension asks: who made this video?
 *   tile[data-yf-key|cid|ch]    answer: video key, channel ID, handle
 *   html[data-yf-watch]         current video's channel (JSON)
 *   html[data-yf-channel]       current channel page (JSON)
 *
 * Note: this file must not share script files with the extension world;
 * Chrome injects each file only once per page.
 */
(function () {
  'use strict';
  if (window.__yfPageWorld) return;
  window.__yfPageWorld = true;

  const ROOT = document.documentElement;
  const CHANNEL_ID = /^UC[\w-]{22}$/;
  const STOP_AT = 'ytd-app, ytd-page-manager, ytd-browse, ytd-search, ytd-watch-flexy, body, html';

  let selJson = '';
  let sel = null;
  function selectors() {
    const json = ROOT.getAttribute('data-yf-sel') || '';
    if (json !== selJson) {
      selJson = json;
      try {
        sel = JSON.parse(json);
      } catch (_) {
        sel = null;
      }
    }
    return sel;
  }

  function dataOf(el) {
    try {
      return el.data || (el.__data && el.__data.data) || (el.polymerController && el.polymerController.data) || null;
    } catch (_) {
      return null;
    }
  }

  function handleFrom(url) {
    const m = String(url || '').match(/\/@([^/?#]+)/);
    return m ? m[1] : '';
  }

  // First channel browse endpoint in a renderer's data.
  function findChannel(obj, budget = 8000) {
    const stack = [obj];
    const seen = new Set();
    let n = 0;
    while (stack.length && n++ < budget) {
      const o = stack.pop();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      const be = o.browseEndpoint;
      if (be && CHANNEL_ID.test(be.browseId || '')) {
        return { id: be.browseId, handle: handleFrom(be.canonicalBaseUrl) };
      }
      const vals = Array.isArray(o) ? o : Object.values(o);
      for (let i = vals.length - 1; i >= 0; i--) {
        if (vals[i] && typeof vals[i] === 'object') stack.push(vals[i]);
      }
    }
    return null;
  }

  // video ID → renderer object, for every item in a list's data. Breadth-first
  // so list items are found before wandering into their (deep) menus.
  const itemIndexes = new WeakMap();
  function itemIndex(data) {
    let index = itemIndexes.get(data);
    if (index) return index;
    index = new Map();
    const queue = [data];
    const seen = new Set();
    for (let head = 0; head < queue.length && head < 20000; head++) {
      const o = queue[head];
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      const vid = (o.contentId && o.metadata && o.contentId) || (o.videoId && (o.title || o.thumbnail) && o.videoId);
      if (vid && !index.has(vid)) {
        index.set(vid, o);
        continue;
      }
      for (const v of Array.isArray(o) ? o : Object.values(o)) if (v && typeof v === 'object') queue.push(v);
    }
    itemIndexes.set(data, index);
    return index;
  }

  function channelForTile(tile, key) {
    const own = dataOf(tile);
    if (own) {
      const ch = findChannel(own);
      if (ch) return ch;
    }
    // Newer tiles carry no data of their own; find the video in the
    // nearest parent list's data instead.
    if (key.includes(':')) return null;
    let el = tile.parentElement;
    for (let depth = 0; el && depth < 6 && !el.matches(STOP_AT); depth++, el = el.parentElement) {
      const d = dataOf(el);
      if (!d) continue;
      const item = itemIndex(d).get(key);
      if (item) return findChannel(item);
    }
    return null;
  }

  function annotate(tile) {
    const want = tile.getAttribute('data-yf-want');
    if (!want || tile.getAttribute('data-yf-key') === want) return;
    let ch = null;
    try {
      ch = channelForTile(tile, want);
    } catch (_) {}
    tile.setAttribute('data-yf-cid', (ch && ch.id) || '');
    tile.setAttribute('data-yf-ch', (ch && ch.handle) || '');
    tile.setAttribute('data-yf-key', want); // last: the extension world listens for this
  }

  new MutationObserver((records) => {
    for (const r of records) annotate(r.target);
  }).observe(ROOT, { subtree: true, attributes: true, attributeFilter: ['data-yf-want'] });

  /* ---------- Current video / channel page ---------- */

  function setJson(attr, value) {
    const json = value ? JSON.stringify(value) : null;
    if (ROOT.getAttribute(attr) === json) return;
    if (json) ROOT.setAttribute(attr, json);
    else ROOT.removeAttribute(attr);
  }

  function lastThumb(thumb) {
    const list = (thumb && thumb.thumbnails) || [];
    const url = list.length ? list[list.length - 1].url : '';
    return url && url.startsWith('//') ? 'https:' + url : url || '';
  }

  function publishWatch(s) {
    if (location.pathname !== '/watch') return;
    const vid = new URLSearchParams(location.search).get('v');
    const player = document.querySelector(s.player);
    let details = null;
    try {
      details = player && player.getPlayerResponse && player.getPlayerResponse().videoDetails;
    } catch (_) {}
    if (!details || details.videoId !== vid) {
      const flexy = document.querySelector('ytd-watch-flexy');
      const pd = flexy && (flexy.playerData || (flexy.__data && flexy.__data.playerData));
      details = pd && pd.videoDetails;
    }
    if (!details || details.videoId !== vid || !details.channelId) return;

    const info = { vid, id: details.channelId, name: details.author || '', handle: '', avatar: '' };
    const owner = document.querySelector(s.owner);
    const od = owner && dataOf(owner);
    if (od) {
      const ch = findChannel(od.navigationEndpoint || od);
      if (ch && ch.id === info.id) {
        info.handle = ch.handle;
        info.avatar = lastThumb(od.thumbnail);
      }
    }
    setJson('data-yf-watch', info);
  }

  function publishChannel(s) {
    const m = location.pathname.match(/^\/(@[^/]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)/);
    if (!m) return;
    const browse = document.querySelector(s.channelBrowse);
    const d = browse && dataOf(browse);
    const md = d && d.metadata && d.metadata.channelMetadataRenderer;
    if (!md || !md.externalId) return;
    const handle = handleFrom(md.vanityChannelUrl);
    const seg = m[1];
    let fresh = true;
    if (seg.startsWith('@')) {
      try {
        fresh = decodeURIComponent(seg.slice(1)).toLowerCase() === decodeURIComponent(handle).toLowerCase();
      } catch (_) {
        fresh = false;
      }
    } else if (seg.startsWith('channel/')) {
      fresh = seg.slice(8) === md.externalId;
    }
    if (!fresh) return;
    setJson('data-yf-channel', {
      path: '/' + seg,
      id: md.externalId,
      name: md.title || '',
      handle,
      avatar: lastThumb(md.avatar),
    });
  }

  setInterval(() => {
    const s = selectors();
    if (!s) return;
    try {
      publishWatch(s);
      publishChannel(s);
    } catch (_) {}
  }, 400);
})();
