(function () {
  'use strict';
  const C = globalThis.YFCore;
  const S = globalThis.YFStore;
  const $ = (id) => document.getElementById(id);

  let settings = C.mergeSettings();
  let channels = [];
  let page = null; // what the active YouTube tab is showing

  function statusText(st) {
    if (!settings.enabled) return 'Off · YouTube is unfiltered';
    if (st.paused) return `Paused until ${C.clockTime(settings.pausedUntil)}`;
    if (!st.inHours) return `Resting · active ${C.scheduleLabel(settings.schedule)}`;
    return 'On · only safelisted channels';
  }

  function render() {
    const st = C.focusState(settings);
    $('master').checked = st.on;
    $('status').textContent = statusText(st);
    document.body.dataset.state = st.active ? 'active' : st.on ? 'waiting' : 'off';
    $('count').textContent = String(channels.length);
    renderCurrent();
  }

  function renderCurrent() {
    const box = $('current');
    const info = page && page.info;
    if (!info) {
      box.hidden = true;
      return;
    }
    const safe = C.isSafelisted(C.buildIndex(channels), info);
    const name = info.name || (info.handle ? '@' + info.handle : 'This channel');
    box.hidden = false;
    document.body.dataset.safe = String(safe);
    $('cur-name').textContent = name;
    $('cur-state').textContent = safe ? '✓ On your safelist' : 'Not on your safelist';
    const img = $('cur-avatar');
    img.hidden = !info.avatar;
    if (info.avatar) img.src = info.avatar;
    $('cur-initial').hidden = !!info.avatar;
    $('cur-initial').textContent = name.replace(/^@/, '').charAt(0).toUpperCase();
    const btn = $('cur-btn');
    btn.textContent = safe ? 'Remove' : '+ Safelist';
    btn.className = safe ? 'btn' : 'btn primary';
  }

  async function renderStats() {
    const stats = await S.getLocal('stats', {});
    const day = stats[C.dayKey()] || { safe: 0, other: 0 };
    const total = day.safe + day.other;
    $('today-total').textContent = C.formatDuration(total);
    $('today-safe').textContent = total >= 60 ? Math.round((100 * day.safe) / total) + '%' : '–';
  }

  async function refresh() {
    ({ settings, channels } = await S.loadAll());
    render();
  }

  async function loadPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && /^https:\/\/www\.youtube\.com\//.test(tab.url || '')) {
        page = await chrome.tabs.sendMessage(tab.id, { type: 'yf:getPage' });
      }
    } catch (_) {
      page = null; // tab opened before the extension was installed: no content script yet
    }
    renderCurrent();
  }

  $('master').addEventListener('change', async (e) => {
    const input = e.target;
    if (input.checked) {
      settings = await S.saveSettings({ enabled: true, pausedUntil: 0 });
      render();
      return;
    }
    input.checked = true; // stays on until the user gets through the lock
    input.disabled = true;
    $('current').hidden = true;
    const patch = await YFUnlock.askToTurnOff($('unlock'), settings.lock);
    input.disabled = false;
    if (patch) settings = await S.saveSettings(patch);
    render();
  });

  $('cur-btn').addEventListener('click', async () => {
    const info = page && page.info;
    if (!info) return;
    const btn = $('cur-btn');
    btn.disabled = true;
    try {
      if (C.isSafelisted(C.buildIndex(channels), info)) {
        const entry = C.findEntry(channels, info);
        if (entry) await S.removeChannel(entry.key);
      } else {
        await S.addChannel(info);
      }
      await refresh();
    } catch (err) {
      $('cur-state').textContent = err.message || 'Something went wrong';
    } finally {
      btn.disabled = false;
    }
  });

  $('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  S.onChange(refresh);
  refresh().then(loadPage);
  renderStats();
})();
