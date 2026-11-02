/*
 * Storage layer. Settings and the safelist live in chrome.storage.sync so they
 * survive restarts and follow you to other Chrome browsers signed into the
 * same profile. Each channel is its own "ch:…" key to stay under sync's
 * 8 KB-per-item limit. Stats and caches stay in chrome.storage.local.
 */
(function (root) {
  'use strict';
  const C = root.YFCore;

  function toEntry(key, v) {
    return {
      key,
      id: v.id || '',
      handle: v.handle || '',
      name: v.name || '',
      avatar: v.avatar || '',
      addedAt: v.addedAt || 0,
    };
  }

  function friendlyError(err) {
    const msg = String((err && err.message) || err);
    if (/QUOTA|MAX_ITEMS/i.test(msg)) {
      return new Error('Chrome sync storage is full. Remove some channels and try again.');
    }
    return err instanceof Error ? err : new Error(msg);
  }

  const YFStore = {
    async loadAll() {
      const all = await chrome.storage.sync.get(null);
      const channels = Object.keys(all)
        .filter((k) => k.startsWith('ch:'))
        .map((k) => toEntry(k, all[k]))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return { settings: C.mergeSettings(all.settings), channels };
    },

    async getSettings() {
      const { settings } = await chrome.storage.sync.get('settings');
      return C.mergeSettings(settings);
    },

    async saveSettings(patch) {
      const cur = await this.getSettings();
      const next = C.mergeSettings({
        ...cur,
        ...patch,
        schedule: { ...cur.schedule, ...(patch.schedule || {}) },
        lock: { ...cur.lock, ...(patch.lock || {}) },
      });
      await chrome.storage.sync.set({ settings: next });
      return next;
    },

    async writeChannel(entry, oldKey) {
      const value = {
        id: entry.id || '',
        handle: C.normHandle(entry.handle),
        name: entry.name || '',
        avatar: entry.avatar || '',
        addedAt: entry.addedAt || Date.now(),
      };
      const key = C.channelKey(value);
      try {
        await chrome.storage.sync.set({ [key]: value });
        if (oldKey && oldKey !== key) await chrome.storage.sync.remove(oldKey);
      } catch (err) {
        throw friendlyError(err);
      }
      return toEntry(key, value);
    },

    // Adds a channel, or fills in missing details if it's already listed.
    async addChannel(info) {
      const { channels } = await this.loadAll();
      const existing = C.findEntry(channels, info);
      return this.writeChannel(
        {
          id: info.id || (existing && existing.id),
          handle: info.handle || (existing && existing.handle),
          name: info.name || (existing && existing.name),
          avatar: info.avatar || (existing && existing.avatar),
          addedAt: existing && existing.addedAt,
        },
        existing && existing.key
      );
    },

    async updateChannel(key, patch) {
      const got = await chrome.storage.sync.get(key);
      if (!got[key]) return null;
      return this.writeChannel({ ...got[key], ...patch }, key);
    },

    async removeChannel(key) {
      await chrome.storage.sync.remove(key);
    },

    onChange(cb) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') cb(changes);
      });
    },

    // Looks a channel up on YouTube from whatever the user pasted.
    async resolveChannel(input) {
      const parsed = C.parseChannelInput(input);
      if (!parsed) throw new Error('Paste a channel link, @handle, channel ID or video link.');
      const info = { id: parsed.id, handle: parsed.handle, name: '', avatar: '' };
      try {
        const res = await fetch(parsed.url, { credentials: 'include' });
        if (res.ok) {
          const found = C.parseYouTubePage(await res.text(), parsed.kind);
          for (const k of Object.keys(info)) if (found[k]) info[k] = found[k];
        }
      } catch (_) {
        // Offline or blocked: keep whatever the input itself told us.
      }
      if (!info.id && !info.handle) {
        throw new Error(
          parsed.kind === 'video'
            ? "Couldn't find the channel for that video."
            : "Couldn't reach YouTube to look that channel up. Try its @handle instead."
        );
      }
      if (!info.name) info.name = info.handle ? '@' + info.handle : info.id;
      return info;
    },

    async getLocal(key, fallback) {
      const got = await chrome.storage.local.get(key);
      return got[key] === undefined ? fallback : got[key];
    },

    setLocal(key, value) {
      return chrome.storage.local.set({ [key]: value });
    },

    async exportData() {
      const { settings, channels } = await this.loadAll();
      return {
        app: 'focus-safelist',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        channels: channels.map(({ key, ...c }) => c),
      };
    },

    // Merges channels from a backup; settings are replaced only if asked.
    async importData(data, { includeSettings = false } = {}) {
      if (!data || !Array.isArray(data.channels)) throw new Error("That file isn't a Focus Safelist backup.");
      const { channels } = await this.loadAll();
      const writes = {};
      const removals = [];
      let added = 0;
      for (const raw of data.channels) {
        const info = {
          id: C.CHANNEL_ID.test(raw.id || '') ? raw.id : '',
          handle: C.normHandle(raw.handle),
          name: String(raw.name || '').slice(0, 200),
          avatar: /^https:\/\//.test(raw.avatar || '') ? raw.avatar : '',
        };
        if (!info.id && !info.handle && !info.name) continue;
        const existing = C.findEntry(channels, info);
        const value = {
          id: info.id || (existing && existing.id) || '',
          handle: info.handle || (existing && existing.handle) || '',
          name: info.name || (existing && existing.name) || '',
          avatar: info.avatar || (existing && existing.avatar) || '',
          addedAt: (existing && existing.addedAt) || Number(raw.addedAt) || Date.now(),
        };
        const key = C.channelKey(value);
        writes[key] = value;
        if (existing && existing.key !== key) removals.push(existing.key);
        if (!existing) {
          added++;
          channels.push(toEntry(key, value));
        }
      }
      if (includeSettings && data.settings) writes.settings = C.mergeSettings(data.settings);
      try {
        await chrome.storage.sync.set(writes);
        if (removals.length) await chrome.storage.sync.remove(removals);
      } catch (err) {
        throw friendlyError(err);
      }
      return { added, total: Object.keys(writes).filter((k) => k.startsWith('ch:')).length };
    },
  };

  root.YFStore = YFStore;
})(globalThis);
