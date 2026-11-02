/*
 * Friction before Focus gets weaker: a countdown or a typed sentence,
 * depending on the Lock setting. Used by the popup and the options page.
 * It's a speed bump for impulses, not a security barrier.
 */
(function (root) {
  'use strict';

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

  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.!]+$/, '')
      .trim();

  // Resolves true once the user gets through the lock, false if they back out.
  function requireUnlock(container, lock, actionLabel = 'Continue') {
    if (!lock || lock.mode === 'none') return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer = 0;
      const finish = (ok) => {
        clearInterval(timer);
        container.replaceChildren();
        container.hidden = true;
        resolve(ok);
      };
      const go = el('button', { type: 'button', class: 'btn primary', text: actionLabel, disabled: true, onclick: () => finish(true) });
      const back = el('button', { type: 'button', class: 'btn', text: 'Never mind', onclick: () => finish(false) });
      const row = el('div', { class: 'unlock-row' }, back, go);
      container.hidden = false;

      if (lock.mode === 'phrase') {
        const phrase = lock.phrase || 'I am choosing distraction over focus';
        const input = el('input', {
          type: 'text',
          class: 'unlock-input',
          autocomplete: 'off',
          spellcheck: 'false',
          placeholder: 'Type the sentence above',
          'aria-label': 'Type the sentence above',
          onpaste: (e) => e.preventDefault(),
          ondrop: (e) => e.preventDefault(),
          oninput: () => {
            go.disabled = normalize(input.value) !== normalize(phrase);
          },
          onkeydown: (e) => {
            if (e.key === 'Enter' && !go.disabled) finish(true);
          },
        });
        container.replaceChildren(
          el('p', { class: 'unlock-title', text: 'Type this to continue' }),
          el('blockquote', { class: 'unlock-phrase', text: phrase }),
          input,
          row
        );
        input.focus();
        return;
      }

      // Default: wait it out.
      const secs = Math.max(5, Number(lock.seconds) || 60);
      const ends = Date.now() + secs * 1000;
      const text = el('p', { class: 'unlock-text' });
      const fill = el('span', { class: 'unlock-fill' });
      container.replaceChildren(
        el('p', { class: 'unlock-title', text: 'Take a breath.' }),
        text,
        el('div', { class: 'unlock-bar' }, fill),
        row
      );
      fill.style.transitionDuration = secs + 's';
      requestAnimationFrame(() => requestAnimationFrame(() => fill.classList.add('go')));
      const update = () => {
        const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
        text.textContent = left
          ? `Still want to do this? You can in ${left} second${left === 1 ? '' : 's'}.`
          : 'Okay. It’s your call.';
        if (!left) {
          clearInterval(timer);
          go.disabled = false;
        }
      };
      update();
      timer = setInterval(update, 250);
      back.focus();
    });
  }

  const DURATIONS = [
    { label: 'For 15 minutes', ms: 15 * 60 * 1000 },
    { label: 'For 1 hour', ms: 60 * 60 * 1000 },
    { label: 'Until I turn it back on', ms: 0 },
  ];

  // Asks how long to switch off for, then applies the lock. Resolves with a
  // settings patch, or null if the user kept Focus on.
  function askToTurnOff(container, lock) {
    return new Promise((resolve) => {
      container.hidden = false;
      const choose = async (d) => {
        const ok = await requireUnlock(container, lock, 'Turn off');
        container.replaceChildren();
        container.hidden = true;
        if (!ok) return resolve(null);
        resolve(d.ms ? { pausedUntil: Date.now() + d.ms } : { enabled: false, pausedUntil: 0 });
      };
      container.replaceChildren(
        el('p', { class: 'unlock-title', text: 'Turn Focus off…' }),
        el(
          'div',
          { class: 'unlock-choices' },
          DURATIONS.map((d) => el('button', { type: 'button', class: 'btn', text: d.label, onclick: () => choose(d) }))
        ),
        el(
          'div',
          { class: 'unlock-row' },
          el('button', {
            type: 'button',
            class: 'btn primary',
            text: 'Keep focusing',
            onclick: () => {
              container.replaceChildren();
              container.hidden = true;
              resolve(null);
            },
          })
        )
      );
    });
  }

  root.YFUnlock = { requireUnlock, askToTurnOff };
})(globalThis);
