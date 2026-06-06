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
  SS.presetPills = function (container, count, onPick) {
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

  // Toggle the drawer open/closed.
  SS.toggleDrawer = function () {
    const d = document.getElementById('drawer');
    if (d) d.classList.toggle('open');
  };
})(window.SS);
