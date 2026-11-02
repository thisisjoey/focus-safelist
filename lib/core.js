/*
 * Pure helpers shared by the content scripts, popup, options page and tests.
 * No chrome.* or DOM access in here.
 */
(function (root) {
  'use strict';

  const SETTINGS_VERSION = 3;

  const DEFAULT_SETTINGS = {
    v: SETTINGS_VERSION,
    enabled: true,
    pausedUntil: 0,
    hideShorts: true,
    shortsAlways: true, // keep Shorts blocked outside scheduled hours
    disableAutoplay: true,
    hideEndscreen: true,
    gateWatch: true, // "Watch anyway?" before videos from other channels
    hideComments: false,
    hideExplore: true,
    hideNotifications: true,
    homeMode: 'feed', // 'feed' | 'filter' | 'subscriptions'
    searchMode: 'blur', // 'blur' | 'hide' | 'show'
    peekHoldSeconds: 2,
    schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
    lock: { mode: 'none', seconds: 60, phrase: 'I am choosing distraction over focus' }, // friction is opt-in
  };

  function mergeSettings(stored) {
    const s = stored || {};
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      schedule: { ...DEFAULT_SETTINGS.schedule, ...(s.schedule || {}) },
      lock: { ...DEFAULT_SETTINGS.lock, ...(s.lock || {}) },
    };
  }

  // Brings settings saved by an older version up to date. Returns the new
  // settings, or null if nothing needs to change. Each step runs only once.
  function migrateSettings(stored) {
    if (!stored || (stored.v || 1) >= SETTINGS_VERSION) return null;
    const from = stored.v || 1;
    const next = { ...stored, v: SETTINGS_VERSION };
    // v2: the 60-second turn-off countdown became opt-in.
    const lock = stored.lock;
    if (from < 2 && lock && lock.mode === 'wait' && Number(lock.seconds) === 60) next.lock = { ...lock, mode: 'none' };
    // v3: the default hold to peek went from 5 seconds to 2.
    if (from < 3 && Number(stored.peekHoldSeconds) === 5) next.peekHoldSeconds = 2;
    return next;
  }

  /* ---------- Channel identity ---------- */

  const CHANNEL_ID = /^UC[\w-]{22}$/;

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch (_) {
      return s;
    }
  }

  function normName(s) {
    return String(s || '')
      .normalize('NFKC')
      .replace(/[​-‍⁠﻿]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normHandle(h) {
    return safeDecode(String(h || ''))
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
  }

  function isYouTubeHost(host) {
    return host === 'youtube.com' || host.endsWith('.youtube.com');
  }

  // "/@name/videos" or "https://www.youtube.com/channel/UC…" → { id, handle }
  function channelFromHref(href) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, 'https://www.youtube.com');
    } catch (_) {
      return null;
    }
    if (!isYouTubeHost(url.hostname)) return null;
    let m = url.pathname.match(/^\/@([^/?#]+)/);
    if (m) return { id: '', handle: normHandle(m[1]) };
    m = url.pathname.match(/^\/channel\/(UC[\w-]{22})/);
    if (m) return { id: m[1], handle: '' };
    return null;
  }

  function channelKey(ch) {
    if (ch.id) return 'ch:' + ch.id;
    if (ch.handle) return 'ch:@' + normHandle(ch.handle);
    return 'ch:n:' + normName(ch.name);
  }

  function buildIndex(channels) {
    const ids = new Set();
    const handles = new Set();
    const names = new Map();
    for (const c of channels) {
      if (c.id) ids.add(c.id);
      if (c.handle) handles.add(normHandle(c.handle));
      const n = normName(c.name);
      if (!n) continue;
      if (!names.has(n)) names.set(n, []);
      names.get(n).push(c);
    }
    return { ids, handles, names, size: channels.length };
  }

  // Display names aren't unique, so a name only counts when IDs and handles
  // can't settle the question (e.g. sidebar tiles that only show the name).
  function nameMatches(entry, info, handle) {
    if (info.id && entry.id) return false;
    if (handle && entry.handle && normHandle(entry.handle) !== handle) return false;
    return true;
  }

  function isSafelisted(index, info) {
    if (!info) return false;
    if (info.id && index.ids.has(info.id)) return true;
    const handle = normHandle(info.handle);
    if (handle && index.handles.has(handle)) return true;
    const byName = index.names.get(normName(info.name));
    return !!byName && byName.some((c) => nameMatches(c, info, handle));
  }

  // The stored entry for a channel, matched the same way as isSafelisted.
  function findEntry(channels, info) {
    if (!info) return null;
    const handle = normHandle(info.handle);
    const name = normName(info.name);
    return (
      (info.id && channels.find((c) => c.id === info.id)) ||
      (handle && channels.find((c) => normHandle(c.handle) === handle)) ||
      (name && channels.find((c) => normName(c.name) === name && nameMatches(c, info, handle))) ||
      null
    );
  }

  /* ---------- Parsing what the user pastes ---------- */

  // Accepts a channel URL, @handle, channel ID or video URL.
  function parseChannelInput(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    if (CHANNEL_ID.test(s)) {
      return { kind: 'channel', id: s, handle: '', url: 'https://www.youtube.com/channel/' + s };
    }
    if (!/[/\s]/.test(s) && !/\.(com|be)$/i.test(s)) {
      const handle = normHandle(s);
      if (!handle) return null;
      return { kind: 'channel', id: '', handle, url: 'https://www.youtube.com/@' + encodeURIComponent(handle) };
    }

    let url;
    try {
      if (s.startsWith('/')) url = new URL(s, 'https://www.youtube.com');
      else url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    } catch (_) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    const path = url.pathname;

    if (host === 'youtu.be') {
      const v = path.slice(1).split('/')[0];
      return v ? { kind: 'video', id: '', handle: '', url: 'https://www.youtube.com/watch?v=' + v } : null;
    }
    if (!isYouTubeHost(host)) return null;

    if (path === '/watch' && url.searchParams.get('v')) {
      return { kind: 'video', id: '', handle: '', url: 'https://www.youtube.com/watch?v=' + url.searchParams.get('v') };
    }
    let m = path.match(/^\/(?:shorts|live)\/([\w-]+)/);
    if (m) return { kind: 'video', id: '', handle: '', url: 'https://www.youtube.com/watch?v=' + m[1] };

    const ch = channelFromHref(url.href);
    if (ch && ch.id) return { kind: 'channel', id: ch.id, handle: '', url: 'https://www.youtube.com/channel/' + ch.id };
    if (ch && ch.handle) {
      return { kind: 'channel', id: '', handle: ch.handle, url: 'https://www.youtube.com/@' + encodeURIComponent(ch.handle) };
    }
    m = path.match(/^\/(c|user)\/([^/]+)/);
    if (m) return { kind: 'channel', id: '', handle: '', url: `https://www.youtube.com/${m[1]}/${m[2]}` };
    return null;
  }

  function decodeEntities(s) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      const l = e.toLowerCase();
      if (l[0] !== '#') return named[l];
      const code = l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    });
  }

  function decodeJsonString(s) {
    try {
      return JSON.parse('"' + s + '"');
    } catch (_) {
      return s;
    }
  }

  // Pull channel details out of a fetched channel or watch page.
  function parseYouTubePage(html, kind) {
    const pick = (re, from = html) => {
      const m = from.match(re);
      return m ? m[1] : '';
    };
    const out = { id: '', handle: '', name: '', avatar: '' };
    if (kind === 'video') {
      const at = html.indexOf('"videoDetails"');
      const details = at >= 0 ? html.slice(at, at + 20000) : html;
      out.id = pick(/"channelId":"(UC[\w-]{22})"/, details);
      out.name = decodeJsonString(pick(/"author":"((?:[^"\\]|\\.)*)"/, details)) ||
        decodeJsonString(pick(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/));
      out.handle = normHandle(pick(/"ownerProfileUrl":"https?:\/\/www\.youtube\.com\/@([^"/\\]+)"/));
    } else {
      out.id =
        pick(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
        pick(/<meta itemprop="identifier" content="(UC[\w-]{22})"/) ||
        pick(/"externalId":"(UC[\w-]{22})"/);
      out.name = decodeEntities(pick(/<meta property="og:title" content="([^"]*)"/));
      out.avatar = decodeEntities(pick(/<meta property="og:image" content="([^"]*)"/));
      out.handle = normHandle(pick(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/@([^"/\\]+)"/));
    }
    return out;
  }

  /* ---------- A channel's /videos page (for the home feed) ---------- */

  const AGO = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i;
  const UNIT_MS = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 };

  // "3 days ago" → approximate timestamp; 0 if it can't be read.
  function agoToTime(text, now = Date.now()) {
    const m = String(text || '').match(AGO);
    return m ? now - Number(m[1]) * UNIT_MS[m[2].toLowerCase()] : 0;
  }

  function textOf(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    return t.content || t.simpleText || (t.runs || []).map((r) => r.text).join('');
  }

  function lastThumbUrl(thumb) {
    const list = (thumb && thumb.thumbnails) || [];
    const url = list.length ? list[list.length - 1].url : '';
    return url.startsWith('//') ? 'https:' + url : url;
  }

  const DURATION = /^\d{1,2}(:\d{2}){1,2}$/;

  // First string anywhere in `obj` that matches `re` (thumbnail badges).
  function findString(obj, re, budget = 2000) {
    const stack = [obj];
    let n = 0;
    while (stack.length && n++ < budget) {
      const o = stack.pop();
      if (typeof o === 'string') {
        if (re.test(o)) return o;
      } else if (o && typeof o === 'object') {
        const vals = Array.isArray(o) ? o : Object.values(o);
        for (let i = vals.length - 1; i >= 0; i--) stack.push(vals[i]);
      }
    }
    return '';
  }

  const withViews = (t) => (!t || /view/i.test(t) ? t : t + ' views');

  // One uploaded video from either renderer format YouTube uses.
  function uploadFrom(o) {
    const vr = o.videoRenderer || o.gridVideoRenderer;
    if (vr && vr.videoId) {
      const ago = textOf(vr.publishedTimeText);
      if (!AGO.test(ago)) return null;
      return {
        vid: vr.videoId,
        title: textOf(vr.title),
        ago,
        views: withViews(textOf(vr.shortViewCountText) || textOf(vr.viewCountText)),
        duration: textOf(vr.lengthText),
      };
    }
    const lv = o.lockupViewModel;
    if (lv && lv.contentId && /VIDEO/.test(lv.contentType || 'VIDEO')) {
      const meta = (lv.metadata && lv.metadata.lockupMetadataViewModel) || {};
      const rows = (((meta.metadata || {}).contentMetadataViewModel || {}).metadataRows || []);
      let ago = '';
      let views = '';
      for (const row of rows) {
        for (const part of row.metadataParts || []) {
          const label = part.accessibilityLabel || textOf(part.text);
          if (!ago && AGO.test(label)) ago = label;
          else if (!views && /views?$/i.test(label)) views = withViews(textOf(part.text) || label);
        }
      }
      // Upcoming premieres have no "… ago" and are skipped.
      if (!ago) return null;
      return {
        vid: lv.contentId,
        title: textOf(meta.title),
        ago,
        views,
        duration: findString(lv.contentImage, DURATION),
      };
    }
    return null;
  }

  // Parses the HTML of youtube.com/channel/<id>/videos into channel details
  // and its latest uploads (newest first). Returns null if the page has no data.
  function parseChannelVideos(html, now = Date.now()) {
    const m = String(html).match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!m) return null;
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (_) {
      return null;
    }
    const md = (data.metadata && data.metadata.channelMetadataRenderer) || {};
    const items = [];
    const seen = new Set();
    const stack = [data];
    let n = 0;
    while (stack.length && n++ < 400000) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      const up = !Array.isArray(o) && uploadFrom(o);
      if (up) {
        if (!seen.has(up.vid)) {
          seen.add(up.vid);
          // Uploads are listed newest first; keep that order for equal "ago"s.
          up.published = agoToTime(up.ago, now) - items.length;
          items.push(up);
        }
        continue;
      }
      const vals = Array.isArray(o) ? o : Object.values(o);
      for (let i = vals.length - 1; i >= 0; i--) if (vals[i] && typeof vals[i] === 'object') stack.push(vals[i]);
    }
    const handle = (String(md.vanityChannelUrl || '').match(/\/@([^/?#]+)/) || [])[1] || '';
    return {
      channel: { id: md.externalId || '', name: md.title || '', handle: normHandle(handle), avatar: lastThumbUrl(md.avatar) },
      items,
    };
  }

  /* ---------- Schedule & on/off state ---------- */

  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function minutesOf(hhmm) {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function inSchedule(schedule, date) {
    const now = date.getHours() * 60 + date.getMinutes();
    const start = minutesOf(schedule.start);
    const end = minutesOf(schedule.end);
    const day = date.getDay();
    const days = schedule.days || [];
    if (start === end) return days.includes(day);
    if (start < end) return days.includes(day) && now >= start && now < end;
    // Overnight window (e.g. 22:00–02:00): after midnight belongs to yesterday's window.
    if (now >= start) return days.includes(day);
    if (now < end) return days.includes((day + 6) % 7);
    return false;
  }

  function focusState(settings, date = new Date()) {
    const paused = settings.pausedUntil > date.getTime();
    const on = !!settings.enabled && !paused;
    const inHours = !settings.schedule.enabled || inSchedule(settings.schedule, date);
    return {
      on,
      paused,
      inHours,
      active: on && inHours,
      shortsBlocked: on && !!settings.hideShorts && (inHours || !!settings.shortsAlways),
    };
  }

  function daysLabel(days) {
    const set = [...new Set(days || [])].sort();
    const key = set.join(',');
    if (key === '0,1,2,3,4,5,6') return 'Every day';
    if (key === '1,2,3,4,5') return 'Weekdays';
    if (key === '0,6') return 'Weekends';
    if (!set.length) return 'No days';
    return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.includes(d)).map((d) => DAY_SHORT[d]).join(', ');
  }

  function scheduleLabel(schedule) {
    return `${daysLabel(schedule.days)} · ${schedule.start}–${schedule.end}`;
  }

  /* ---------- Formatting ---------- */

  function dayKey(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (sec === 0) return '0m';
    if (sec < 60) return '<1m';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }

  function timeAgo(ts, now = Date.now()) {
    const s = Math.max(0, (now - ts) / 1000);
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    for (const [unit, size] of units) {
      const n = Math.floor(s / size);
      if (n >= 1) return `${n} ${unit}${n > 1 ? 's' : ''} ago`;
    }
    return 'just now';
  }

  function clockTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const api = {
    DEFAULT_SETTINGS,
    CHANNEL_ID,
    mergeSettings,
    migrateSettings,
    normName,
    normHandle,
    channelFromHref,
    channelKey,
    buildIndex,
    isSafelisted,
    findEntry,
    parseChannelInput,
    parseYouTubePage,
    parseChannelVideos,
    agoToTime,
    decodeEntities,
    inSchedule,
    focusState,
    daysLabel,
    scheduleLabel,
    dayKey,
    formatDuration,
    timeAgo,
    clockTime,
  };

  root.YFCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
