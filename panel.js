// Shared control-panel helpers for the screensaver sketches. Pure DOM utilities
// the sketches' panels all need; load BEFORE the sketch's own script so they're
// available while it builds its PANEL_HTML:
//   <script src="../panel.js"></script>
//   <script src="sketch.js"></script>
// Exposed on window.SS. (Visual/CSS and the panel scaffold are still per-sketch.)
window.SS = window.SS || {};
(function (SS) {
  // Append a <style> with the given CSS text.
  SS.injectCss = function (css) {
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  };

  // One control row: label, −/+ adjust buttons (data-action="adjust"), value
  // span (#v-<param>). `help` populates the data-help tooltip text.
  SS.paramRow = function (label, param, hint, help) {
    help = (help || '').replace(/"/g, '&quot;');
    return `<div class="row" data-help="${help}"><span class="label">${label}</span>` +
      `<div class="keys"><span class="kbd-pair">` +
      `<button class="kbd-btn" data-action="adjust" data-param="${param}" data-dir="-1">−</button>` +
      `<button class="kbd-btn" data-action="adjust" data-param="${param}" data-dir="1">+</button>` +
      `</span><span class="key-hint">${hint}</span></div>` +
      `<span id="v-${param}" class="val"></span></div>`;
  };

  // Fill `container` with numbered preset pills (1..9,0); onPick(i) on click.
  // Clears first, so it can be re-called to re-pill a container when the set of
  // presets changes under it (e.g. petri-dish switching preset packs).
  SS.presetPills = function (container, count, onPick) {
    container.textContent = '';
    for (let i = 0; i < count; i++) {
      const pill = document.createElement('button');
      pill.className = 'pill';
      pill.textContent = (i + 1) % 10;
      pill.addEventListener('click', () => { onPick(i); pill.blur(); });
      container.appendChild(pill);
    }
  };

  // Hold a button matching `selector` to auto-repeat fire(el): once on press,
  // then after `delay` ms, every `interval` ms until release.
  SS.attachHoldRepeat = function (container, selector, fire, opts) {
    opts = opts || {};
    const delay = opts.delay || 350;
    const interval = opts.interval || 60;
    let holdDelay, holdInterval;
    const stop = () => { clearTimeout(holdDelay); clearInterval(holdInterval); };
    container.addEventListener('pointerdown', (e) => {
      const el = e.target.closest(selector);
      if (!el || el.disabled) return;
      e.preventDefault();
      fire(el);
      el.setPointerCapture?.(e.pointerId);
      holdDelay = setTimeout(() => { holdInterval = setInterval(() => fire(el), interval); }, delay);
    });
    container.addEventListener('pointerup', stop);
    container.addEventListener('pointercancel', stop);
  };

  // --- modals --------------------------------------------------------------
  // A DOM text prompt, never the native prompt(): the native one blocks the p5
  // draw loop dead, looks like 1998 on an iPad, and freezes headless automation.
  //
  // Every sketch's keydown handler already returns early on an HTMLInputElement
  // target, so typing into this doesn't drive the sketch. SS.modalOpen() is for
  // the case that guard can't cover — a modal with no text field, where a bare
  // keypress would otherwise reach the sketch behind it.
  let openModal = null;
  SS.modalOpen = () => !!openModal;

  let modalCssDone = false;
  const MODAL_CSS = `
    .ss-modal {
      position: fixed; inset: 0; z-index: 40;
      display: flex; align-items: center; justify-content: center;
      background: rgba(6, 8, 12, 0.55);
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }
    .ss-modal-box {
      min-width: 280px; max-width: min(420px, calc(100vw - 2rem));
      box-sizing: border-box; padding: 1.1rem 1.2rem;
      background: rgba(14, 17, 24, 0.97);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border-radius: 6px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.55);
      color: #ddd; font-size: 12px;
    }
    .ss-modal-title { color: #fff; font-size: 12px; margin-bottom: 0.7rem; letter-spacing: 0.03em; }
    .ss-modal-input {
      width: 100%; box-sizing: border-box; padding: 0.5rem 0.6rem;
      background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(156, 204, 255, 0.35);
      border-radius: 3px; color: #fff; font-family: inherit; font-size: 13px;
    }
    .ss-modal-input:focus { outline: none; border-color: #9cf; }
    .ss-modal-note { color: #777; font-size: 10.5px; margin-top: 0.45rem; min-height: 1.2em; }
    .ss-modal-note.warn { color: #e8b76a; }
    .ss-modal-btns { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.9rem; }
    .ss-modal-btns button {
      font-family: inherit; font-size: 12px; cursor: pointer; border: none;
      padding: 0.42rem 0.8rem; border-radius: 3px;
      background: rgba(255, 255, 255, 0.08); color: #ccc;
    }
    .ss-modal-btns button:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
    .ss-modal-btns button.primary { background: rgba(156, 204, 255, 0.25); color: #9cf; }
    .ss-modal-btns button.primary:hover { background: rgba(156, 204, 255, 0.4); color: #fff; }
  `;

  // Ask for a string. Resolves to the trimmed text, or null if cancelled —
  // Escape, the Cancel button, or a click on the backdrop.
  //
  // `sanitize` runs on every keystroke rather than on submit, so characters a
  // caller can't store (a spec delimiter, say) visibly refuse to be typed instead
  // of silently vanishing from what you thought you had entered.
  SS.textInput = function (opts) {
    opts = opts || {};
    if (openModal) return Promise.resolve(null); // one at a time
    if (!modalCssDone) { SS.injectCss(MODAL_CSS); modalCssDone = true; }

    const wrap = document.createElement('div');
    wrap.className = 'ss-modal';
    const box = document.createElement('div');
    box.className = 'ss-modal-box';

    const title = document.createElement('div');
    title.className = 'ss-modal-title';
    title.textContent = opts.title || 'Name';

    const input = document.createElement('input');
    input.className = 'ss-modal-input';
    input.type = 'text';
    input.value = opts.value || '';
    input.placeholder = opts.placeholder || '';
    if (opts.maxLength) input.maxLength = opts.maxLength;
    // iOS turns a name field into a sentence otherwise.
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocomplete', 'off');
    input.spellcheck = false;

    const note = document.createElement('div');
    note.className = 'ss-modal-note';
    note.textContent = opts.note || '';

    const btns = document.createElement('div');
    btns.className = 'ss-modal-btns';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.className = 'primary';
    ok.textContent = opts.confirmLabel || 'OK';
    btns.append(cancel, ok);

    box.append(title, input, note, btns);
    wrap.appendChild(box);

    const restoreTo = document.activeElement;
    return new Promise((resolve) => {
      let settled = false;
      const close = (value) => {
        if (settled) return;
        settled = true;
        openModal = null;
        window.removeEventListener('keydown', onKey, true);
        wrap.remove();
        if (restoreTo && restoreTo.focus) restoreTo.focus();
        resolve(value);
      };
      // Capture phase: the sketch's own Escape binding must not get there first.
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); }
        else if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); submit(); }
      };
      const submit = () => {
        const v = input.value.trim();
        close(v ? v : null);
      };
      if (opts.sanitize) {
        input.addEventListener('input', () => {
          const clean = opts.sanitize(input.value);
          if (clean !== input.value) {
            const at = input.selectionStart;
            input.value = clean;
            input.setSelectionRange(Math.max(0, at - 1), Math.max(0, at - 1));
            note.textContent = opts.rejectNote || opts.note || '';
            note.classList.add('warn');
          } else {
            note.textContent = opts.note || '';
            note.classList.remove('warn');
          }
        });
      }
      cancel.addEventListener('click', () => close(null));
      ok.addEventListener('click', submit);
      wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(null); });

      openModal = wrap;
      window.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      input.focus();
      input.select();
    });
  };

  // Toggle the drawer open/closed.
  SS.toggleDrawer = function () {
    const d = document.getElementById('drawer');
    if (d) d.classList.toggle('open');
  };
})(window.SS);
