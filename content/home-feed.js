/*
 * The calm home page: instead of YouTube's recommendations, show the latest
 * uploads from safelisted channels, read from each channel's Videos tab
 * (YouTube's RSS feeds no longer work). Shorts and live streams live on other
 * tabs, so they never show up here. Falls back to the filtered YouTube home
 * if nothing can be loaded.
 */
(function () {
  'use strict';
  const C = globalThis.YFCore;
  const S = globalThis.YFStore;
  const SEL = globalThis.__YF_SEL;
  const YF = globalThis.YF;
  const ROOT = document.documentElement;
  const h = YF.h;

  const CACHE_KEY = 'feedCache2'; // bump when the cached item shape changes
  const TTL = 20 * 60 * 1000;
  const MAX_ITEMS = 60;

  let section = null;
  let loading = false;
  let loadedSig = '';
  let loadedAt = 0;
  const lookupTried = new Set();

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  // hl=en keeps the "3 days ago" labels parseable whatever the UI language.
  async function fetchUploads(ch) {
    const res = await fetch('/channel/' + encodeURIComponent(ch.id) + '/videos?hl=en');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const parsed = C.parseChannelVideos(await res.text());
    if (!parsed) throw new Error('No video data');
    if (!ch.avatar && parsed.channel.avatar && YF.alive()) {
      S.updateChannel(ch.key, { avatar: parsed.channel.avatar }).catch(() => {});
    }
    return parsed.items.slice(0, 15).map((it) => ({
      vid: it.vid,
      title: it.title,
      published: it.published,
      views: it.views,
      duration: it.duration,
      channelId: ch.id,
      channelName: parsed.channel.name || ch.name,
    }));
  }

  // Channels added by @handle only need their ID before we can read a feed.
  async function lookUpMissingIds() {
    const missing = YF.channels.filter((c) => !c.id && c.handle && !lookupTried.has(c.key)).slice(0, 5);
    for (const ch of missing) {
      lookupTried.add(ch.key);
      try {
        const res = await fetch('/@' + encodeURIComponent(ch.handle));
        if (!res.ok) continue;
        const found = C.parseYouTubePage(await res.text(), 'channel');
        if (found.id) {
          await S.updateChannel(ch.key, {
            id: found.id,
            name: ch.name && !ch.name.startsWith('@') ? ch.name : found.name || ch.name,
            avatar: ch.avatar || found.avatar,
          });
        }
      } catch (_) {}
    }
  }

  /* ---------- Rendering ---------- */

  function headButton(text, onclick) {
    return h('button', { type: 'button', class: 'yf-home-btn', text, onclick });
  }

  function buildSection() {
    return h(
      'section',
      { id: 'yf-home', 'aria-label': 'Latest from your safelist' },
      h(
        'header',
        { class: 'yf-home-head' },
        h('div', {}, h('h2', { class: 'yf-home-title', text: 'Latest from your safelist' }), h('p', { class: 'yf-home-sub' })),
        h(
          'div',
          { class: 'yf-home-actions' },
          headButton('Refresh', () => load(true)),
          headButton('Manage safelist', () => YF.openOptions())
        )
      ),
      h('p', { class: 'yf-home-note', hidden: true }),
      h('div', { class: 'yf-home-body' })
    );
  }

  function setSub(text) {
    section.querySelector('.yf-home-sub').textContent = text;
  }

  function setNote(text) {
    const note = section.querySelector('.yf-home-note');
    note.textContent = text || '';
    note.hidden = !text;
  }

  function setBody(...children) {
    section.querySelector('.yf-home-body').replaceChildren(...children);
  }

  function renderEmpty() {
    setSub('Your safelist is empty');
    setNote('');
    setBody(
      h(
        'div',
        { class: 'yf-home-empty' },
        h('p', { class: 'yf-home-empty-title', text: 'Nothing here yet, and that’s the point.' }),
        h('p', {
          text: 'Open a video from a channel you trust and click “+ Safelist” next to Subscribe. Its new uploads will show up here.',
        }),
        headButton('Add channels in settings', () => YF.openOptions())
      )
    );
  }

  // Laid out like YouTube's own home tiles: thumbnail with length, then
  // avatar + title, channel, and "views • time".
  function card(item) {
    const entry = YF.channels.find((c) => c.id === item.channelId);
    const avatar = entry && entry.avatar;
    const name = (entry && entry.name) || item.channelName;
    const meta = [item.views, C.timeAgo(item.published)].filter(Boolean).join(' • ');
    return h(
      'a',
      { class: 'yf-card', href: '/watch?v=' + item.vid, title: item.title },
      h(
        'div',
        { class: 'yf-card-thumb' },
        h('img', { src: `https://i.ytimg.com/vi/${item.vid}/hqdefault.jpg`, alt: '', loading: 'lazy' }),
        item.duration ? h('span', { class: 'yf-card-duration', text: item.duration }) : null
      ),
      h(
        'div',
        { class: 'yf-card-body' },
        avatar
          ? h('img', { class: 'yf-card-avatar', src: avatar, alt: '', loading: 'lazy' })
          : h('span', { class: 'yf-card-avatar yf-card-initial', text: (name || '?').trim().charAt(0).toUpperCase() }),
        h(
          'div',
          { class: 'yf-card-text' },
          h('h3', { class: 'yf-card-title', text: item.title }),
          h('p', { class: 'yf-card-meta', text: name }),
          h('p', { class: 'yf-card-meta', text: meta })
        )
      )
    );
  }

  function fallBack(message) {
    YF.homeOverride = 'filter';
    YF.applyRoot();
    YF.toast(message);
  }

  async function load(force) {
    if (loading || !section) return;
    loading = true;
    loadedSig = sig();
    try {
      if (!YF.channels.length) {
        renderEmpty();
        return;
      }
      setSub('Loading the latest uploads…');
      await lookUpMissingIds();
      const withId = YF.channels.filter((c) => c.id);
      const cache = await S.getLocal(CACHE_KEY, {});
      const now = Date.now();
      let failed = 0;
      let done = 0;
      const results = await mapLimit(withId, 4, async (ch) => {
        const hit = cache[ch.id];
        if (!force && hit && now - hit.at < TTL) return hit.items;
        try {
          const items = await fetchUploads(ch);
          cache[ch.id] = { at: now, items };
          return items;
        } catch (_) {
          failed++;
          return hit ? hit.items : [];
        } finally {
          setSub(`Loading the latest uploads… ${++done} of ${withId.length}`);
        }
      });
      const keep = {};
      for (const ch of withId) if (cache[ch.id]) keep[ch.id] = cache[ch.id];
      if (YF.alive()) await S.setLocal(CACHE_KEY, keep);

      if (withId.length && failed === withId.length && !results.some((r) => r.length)) {
        fallBack("Couldn't load your safelist's uploads, so here's the filtered YouTube home instead.");
        return;
      }

      const items = results
        .flat()
        .sort((a, b) => b.published - a.published)
        .slice(0, MAX_ITEMS);

      const pendingCount = YF.channels.length - withId.length;
      setSub(`${withId.length} channel${withId.length === 1 ? '' : 's'} · updated ${C.timeAgo(now)}`);
      const notes = [];
      if (failed) notes.push(`${failed} channel${failed === 1 ? '' : 's'} couldn't be loaded right now.`);
      if (pendingCount) {
        notes.push(
          `${pendingCount} channel${pendingCount === 1 ? ' is' : 's are'} still being looked up and will appear once verified.`
        );
      }
      setNote(notes.join(' '));
      setBody(
        items.length
          ? h('div', { class: 'yf-home-grid' }, items.map(card))
          : h('div', { class: 'yf-home-empty' }, h('p', { text: 'No recent uploads from your safelisted channels.' }))
      );
    } finally {
      loading = false;
      loadedAt = Date.now();
    }
  }

  // Reload when the safelist changes (adds, removals, filled-in details).
  function sig() {
    return YF.channels.map((c) => c.id).join(',');
  }

  YF.updateHomeFeed = function () {
    const want = YF.route() === 'home' && ROOT.getAttribute('data-yf-home') === 'feed';
    if (!want) {
      if (section) section.hidden = true;
      return;
    }
    const primary = document.querySelector(SEL.homePrimary);
    if (!primary) return;
    if (!section) section = buildSection();
    if (section.parentElement !== primary) primary.prepend(section);
    section.hidden = false;
    if (!loading && (sig() !== loadedSig || Date.now() - loadedAt > TTL)) load(false);
  };
})();
