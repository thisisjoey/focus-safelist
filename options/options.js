(function () {
  'use strict';
  const C = globalThis.YFCore;
  const S = globalThis.YFStore;
  const $ = (id) => document.getElementById(id);

  let settings = C.mergeSettings();
  let channels = [];
  let editingKey = null;
  let lockEditing = false;

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }

  function setMsg(id, text, kind) {
    const m = $(id);
    m.textContent = text || '';
    m.className = 'form-msg' + (kind ? ' ' + kind : '');
  }

  let toastTimer = 0;
  function toast(text, undo) {
    $('toast-text').textContent = text;
    const btn = $('toast-action');
    btn.hidden = !undo;
    btn.onclick = undo
      ? async () => {
          $('toast').hidden = true;
          await undo();
        }
      : null;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('toast').hidden = true), 6000);
  }

  /* ---------- Lock ---------- */

  const dialog = $('unlock-dialog');
  dialog.addEventListener('cancel', (e) => e.preventDefault()); // Escape doesn't skip the lock

  const lockApplies = () => settings.lock.mode !== 'none' && C.focusState(settings).on;

  async function unlock(action) {
    if (!lockApplies()) return true;
    dialog.showModal();
    const ok = await YFUnlock.requireUnlock($('unlock-body'), settings.lock, action);
    dialog.close();
    return ok;
  }

  // Settings whose "off" makes YouTube more distracting.
  const PROTECTIVE = new Set([
    'hideShorts',
    'shortsAlways',
    'disableAutoplay',
    'hideEndscreen',
    'gateWatch',
    'hideComments',
    'hideExplore',
    'hideNotifications',
  ]);

  function loosens(path, value) {
    if (PROTECTIVE.has(path)) return value === false;
    if (path === 'searchMode') return value === 'show' || (value === 'blur' && settings.searchMode === 'hide');
    if (path === 'schedule.enabled') return value === true;
    if (path.startsWith('schedule.')) return settings.schedule.enabled;
    if (path === 'peekHoldSeconds') return value < settings.peekHoldSeconds;
    return false;
  }

  async function save(patch) {
    settings = await S.saveSettings(patch);
    renderSettings();
    renderStatus();
  }

  /* ---------- Status & master switch ---------- */

  function renderStatus() {
    const st = C.focusState(settings);
    $('master').checked = st.on;
    $('status-card').dataset.state = st.active ? 'active' : st.on ? 'waiting' : 'off';
    let title = 'Focus is on';
    let text = 'Only safelisted channels are showing.';
    if (!settings.enabled) {
      title = 'Focus is off';
      text = 'YouTube is unfiltered.';
    } else if (st.paused) {
      title = 'Focus is paused';
      text = `Back on at ${C.clockTime(settings.pausedUntil)}.`;
    } else if (!st.inHours) {
      title = 'Focus is resting';
      text = `Back on ${C.scheduleLabel(settings.schedule)}.`;
    } else if (settings.schedule.enabled) {
      text += ` Scheduled ${C.scheduleLabel(settings.schedule)}.`;
    }
    $('status-title').textContent = title;
    $('status-text').textContent = text;
  }

  $('master').addEventListener('change', async (e) => {
    const input = e.target;
    if (input.checked) {
      await save({ enabled: true, pausedUntil: 0 });
      return;
    }
    input.checked = true;
    dialog.showModal();
    const patch = await YFUnlock.askToTurnOff($('unlock-body'), settings.lock);
    dialog.close();
    if (patch) await save(patch);
    else renderStatus();
  });

  /* ---------- Rules & schedule ---------- */

  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function getPath(path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), settings);
  }

  function patchFor(path, value) {
    const [a, b] = path.split('.');
    return b ? { [a]: { [b]: value } } : { [a]: value };
  }

  function renderSettings() {
    for (const input of document.querySelectorAll('[data-setting]')) {
      const v = getPath(input.dataset.setting);
      if (input.type === 'checkbox') input.checked = !!v;
      else if (input.type === 'radio') input.checked = input.value === v;
      else if (document.activeElement !== input) input.value = v;
    }
    for (const box of $('days').querySelectorAll('input')) {
      box.checked = settings.schedule.days.includes(Number(box.dataset.day));
    }
    $('schedule-fields').disabled = !settings.schedule.enabled;
    $('schedule-summary').textContent = settings.schedule.enabled
      ? `Active ${C.scheduleLabel(settings.schedule)}.`
      : 'Focus is on all the time.';
    if (!lockEditing) renderLock();
  }

  async function onSettingInput(input) {
    const path = input.dataset.setting;
    if (input.type === 'radio' && !input.checked) return;
    let value = input.value;
    if (input.type === 'checkbox') value = input.checked;
    if (input.type === 'number') {
      value = Math.round(Number(input.value));
      if (!Number.isFinite(value)) return renderSettings();
      value = Math.min(Number(input.max) || value, Math.max(Number(input.min) || value, value));
    }
    if (input.type === 'time' && !value) return renderSettings();
    if (loosens(path, value) && !(await unlock('Apply'))) return renderSettings();
    await save(patchFor(path, value));
  }

  for (const input of document.querySelectorAll('[data-setting]')) {
    input.addEventListener('change', () => onSettingInput(input));
  }

  $('days').replaceChildren(
    ...DAY_ORDER.map((d) =>
      el(
        'label',
        { class: 'day' },
        el('input', {
          type: 'checkbox',
          'data-day': String(d),
          'aria-label': DAY_NAMES[d],
          onchange: async () => {
            const days = [...$('days').querySelectorAll('input:checked')].map((i) => Number(i.dataset.day));
            const fewer = days.length < settings.schedule.days.length;
            if (settings.schedule.enabled && fewer && !(await unlock('Apply'))) return renderSettings();
            await save({ schedule: { days } });
          },
        }),
        el('span', { text: DAY_NAMES[d] })
      )
    )
  );

  /* ---------- Lock settings ---------- */

  function renderLock() {
    for (const r of document.querySelectorAll('input[name="lockMode"]')) r.checked = r.value === settings.lock.mode;
    $('lock-seconds').value = settings.lock.seconds;
    $('lock-phrase').value = settings.lock.phrase;
  }

  function setLockEditing(on) {
    lockEditing = on;
    $('lock-fields').disabled = !on;
    $('lock-edit').hidden = on;
    $('lock-save').hidden = !on;
    $('lock-cancel').hidden = !on;
  }

  $('lock-edit').addEventListener('click', async () => {
    if (await unlock('Change lock')) setLockEditing(true);
  });
  $('lock-cancel').addEventListener('click', () => {
    setLockEditing(false);
    renderLock();
  });
  $('lock-save').addEventListener('click', async () => {
    const checked = document.querySelector('input[name="lockMode"]:checked');
    const seconds = Math.min(600, Math.max(5, Math.round(Number($('lock-seconds').value) || 60)));
    const phrase = $('lock-phrase').value.trim() || C.DEFAULT_SETTINGS.lock.phrase;
    setLockEditing(false);
    await save({ lock: { mode: checked ? checked.value : 'wait', seconds, phrase } });
    toast('Lock saved');
  });

  /* ---------- Safelist ---------- */

  function channelUrl(c) {
    if (c.id) return 'https://www.youtube.com/channel/' + c.id;
    if (c.handle) return 'https://www.youtube.com/@' + encodeURIComponent(c.handle);
    return null;
  }

  function avatar(c) {
    if (c.avatar) return el('img', { class: 'avatar', src: c.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    const letter = (c.name || c.handle || '?').replace(/^@/, '').charAt(0).toUpperCase();
    return el('span', { class: 'avatar initial', 'aria-hidden': 'true', text: letter });
  }

  function row(c) {
    const meta = [c.handle ? '@' + c.handle : null, c.addedAt ? 'added ' + C.timeAgo(c.addedAt) : null]
      .filter(Boolean)
      .join(' · ');
    const url = channelUrl(c);
    return el(
      'li',
      { class: 'channel' },
      avatar(c),
      el(
        'div',
        { class: 'info' },
        el('p', { class: 'name', text: c.name || '@' + c.handle }),
        el('p', { class: 'meta', text: meta }),
        c.id
          ? null
          : el('p', {
              class: 'meta pending',
              text: 'Not verified yet. It completes the next time you watch this channel.',
            })
      ),
      el(
        'div',
        { class: 'actions' },
        url ? el('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener', text: 'Open' }) : null,
        el('button', {
          type: 'button',
          class: 'btn ghost',
          text: 'Edit',
          onclick: () => {
            editingKey = c.key;
            renderList();
          },
        }),
        el('button', { type: 'button', class: 'btn ghost danger', text: 'Remove', onclick: () => removeChannel(c) })
      )
    );
  }

  function editRow(c) {
    const name = el('input', { type: 'text', value: c.name, 'aria-label': 'Channel name' });
    const handle = el('input', {
      type: 'text',
      value: c.handle ? '@' + c.handle : '',
      placeholder: '@handle',
      'aria-label': 'Channel handle',
      spellcheck: 'false',
    });
    const msg = el('p', { class: 'form-msg' });
    const done = () => {
      editingKey = null;
      renderList();
    };
    const saveBtn = el('button', {
      type: 'button',
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        try {
          await S.updateChannel(c.key, { name: name.value.trim() || c.name, handle: C.normHandle(handle.value) });
          done();
        } catch (err) {
          msg.textContent = err.message;
          msg.className = 'form-msg error';
        }
      },
    });
    const lookUp = el('button', {
      type: 'button',
      class: 'btn',
      text: 'Refresh from YouTube',
      onclick: async () => {
        msg.textContent = 'Looking it up on YouTube…';
        msg.className = 'form-msg';
        try {
          const h = C.normHandle(handle.value) || c.handle;
          const info = await S.resolveChannel(c.id || (h ? '@' + h : c.name));
          await S.updateChannel(c.key, info);
          done();
        } catch (err) {
          msg.textContent = err.message;
          msg.className = 'form-msg error';
        }
      },
    });
    const li = el(
      'li',
      { class: 'channel editing' },
      avatar(c),
      el(
        'div',
        { class: 'edit-fields' },
        el('label', {}, 'Name', name),
        el('label', {}, 'Handle', handle)
      ),
      el('div', { class: 'edit-actions' }, msg, lookUp, el('button', { type: 'button', class: 'btn ghost', text: 'Cancel', onclick: done }), saveBtn)
    );
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') saveBtn.click();
      if (e.key === 'Escape') done();
    });
    requestAnimationFrame(() => name.focus());
    return li;
  }

  async function removeChannel(c) {
    await S.removeChannel(c.key);
    toast(`Removed ${c.name || '@' + c.handle}`, () => S.writeChannel(c));
  }

  function renderList() {
    const q = $('filter').value.trim().toLowerCase();
    const qHandle = C.normHandle(q);
    let list = channels.filter(
      (c) => !q || C.normName(c.name).includes(q) || (qHandle && c.handle.includes(qHandle)) || c.id.toLowerCase() === q
    );
    if ($('sort').value === 'recent') list = [...list].sort((a, b) => b.addedAt - a.addedAt);
    $('channel-list').replaceChildren(...list.map((c) => (c.key === editingKey ? editRow(c) : row(c))));
    $('count-badge').textContent = String(channels.length);
    const empty = $('list-empty');
    empty.hidden = list.length > 0;
    if (!channels.length) {
      empty.replaceChildren(
        'No channels yet. Add one above, or click ',
        el('b', { text: '+ Safelist' }),
        ' next to Subscribe while watching.'
      );
    } else if (!list.length) {
      empty.textContent = 'No channels match your search.';
    }
    $('welcome').hidden = channels.length > 0 && location.hash !== '#welcome';
  }

  $('filter').addEventListener('input', renderList);
  $('sort').addEventListener('change', renderList);

  $('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const parts = $('add-input').value.split(/[\s,]+/).filter(Boolean);
    if (!parts.length) return;
    $('add-btn').disabled = true;
    setMsg('add-msg', 'Looking it up on YouTube…');
    const added = [];
    const already = [];
    const failed = [];
    let unverified = 0;
    for (const part of parts) {
      try {
        const info = await S.resolveChannel(part);
        const index = C.buildIndex(channels);
        if (C.isSafelisted(index, info)) {
          already.push(info.name);
          continue;
        }
        const saved = await S.addChannel(info);
        channels = (await S.loadAll()).channels;
        added.push(saved.name);
        if (!saved.id) unverified++;
      } catch (err) {
        failed.push(parts.length > 1 ? `${part}: ${err.message}` : err.message);
      }
    }
    $('add-btn').disabled = false;
    const lines = [];
    if (added.length) lines.push(`Added ${added.join(', ')}.`);
    if (unverified) lines.push("YouTube couldn't confirm it yet. It'll be verified the next time you watch one of their videos.");
    if (already.length) lines.push(`${already.join(', ')} ${already.length === 1 ? 'is' : 'are'} already on your safelist.`);
    if (failed.length) lines.push(failed.join(' '));
    setMsg('add-msg', lines.join(' '), failed.length && !added.length ? 'error' : 'ok');
    if (!failed.length) $('add-input').value = '';
    renderList();
  });

  /* ---------- Watch time ---------- */

  async function renderStats() {
    const stats = await S.getLocal('stats', {});
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const v = stats[C.dayKey(d)] || { safe: 0, other: 0 };
      days.push({ date: d, safe: v.safe, other: v.other, total: v.safe + v.other });
    }
    const week = days.slice(0, 7).reduce((a, d) => ({ safe: a.safe + d.safe, total: a.total + d.total }), { safe: 0, total: 0 });
    const pct = (safe, total) => (total >= 60 ? Math.round((100 * safe) / total) + '%' : '–');
    const card = (value, label) => el('div', { class: 'stat-card' }, el('strong', { text: value }), el('span', { text: label }));
    $('stat-cards').replaceChildren(
      card(C.formatDuration(days[0].total), 'watched today'),
      card(C.formatDuration(week.total), 'in the last 7 days'),
      card(pct(week.safe, week.total), 'from your safelist (7 days)')
    );

    const max = Math.max(60, ...days.map((d) => d.total));
    const label = (d, i) =>
      i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    $('days-list').replaceChildren(
      el(
        'li',
        { class: 'legend', 'aria-hidden': 'true' },
        el('span', {}, el('i', { style: 'background:var(--accent)' }), 'Safelisted'),
        el('span', {}, el('i', { style: 'background:var(--warn);opacity:.75' }), 'Other channels')
      ),
      ...days.map((d, i) =>
        el(
          'li',
          { class: 'day-row' },
          el('span', { class: 'label', text: label(d.date, i) }),
          el(
            'div',
            { class: 'bar', role: 'img', 'aria-label': `${C.formatDuration(d.safe)} safelisted, ${C.formatDuration(d.other)} other` },
            el('span', { class: 'safe', style: `width:${(100 * d.safe) / max}%` }),
            el('span', { class: 'other', style: `width:${(100 * d.other) / max}%` })
          ),
          el('span', { class: 'value', text: d.total ? `${C.formatDuration(d.total)} · ${pct(d.safe, d.total)}` : '–' })
        )
      )
    );
  }

  /* ---------- Backup ---------- */

  $('export').addEventListener('click', async () => {
    const data = await S.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = el('a', { href: url, download: `focus-safelist-${C.dayKey()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg('backup-msg', `Exported ${data.channels.length} channel${data.channels.length === 1 ? '' : 's'}.`, 'ok');
  });

  $('import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const includeSettings = $('import-settings').checked;
      if (includeSettings && !(await unlock('Import settings'))) return;
      const res = await S.importData(data, { includeSettings });
      setMsg('backup-msg', `Imported ${res.total} channel${res.total === 1 ? '' : 's'} (${res.added} new).`, 'ok');
    } catch (err) {
      setMsg('backup-msg', err instanceof SyntaxError ? "That file isn't valid JSON." : err.message, 'error');
    }
  });

  async function renderUsage() {
    try {
      const bytes = await chrome.storage.sync.getBytesInUse(null);
      $('usage').textContent = `Using ${(bytes / 1024).toFixed(1)} KB of Chrome’s 100 KB sync storage (about 400 channels fit).`;
    } catch (_) {}
  }

  /* ---------- Navigation highlight ---------- */

  const links = new Map([...document.querySelectorAll('.nav a')].map((a) => [a.getAttribute('href').slice(1), a]));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const a of links.values()) a.classList.remove('current');
        const a = links.get(entry.target.id);
        if (a) a.classList.add('current');
      }
    },
    { rootMargin: '-20% 0px -70% 0px' }
  );
  for (const id of links.keys()) {
    const section = $(id);
    if (section) observer.observe(section);
  }

  /* ---------- Start ---------- */

  async function load() {
    ({ settings, channels } = await S.loadAll());
    renderStatus();
    renderSettings();
    if (!editingKey) renderList();
    else $('count-badge').textContent = String(channels.length);
    renderUsage();
  }

  S.onChange(load);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.stats) renderStats();
  });
  setInterval(renderStatus, 30000);

  load();
  renderStats();
})();
