// Shared sketch chrome: fullscreen toggle (F) + fading hint + toast + dev
// live-reload. Designed to drop into any sketch via <script src="../chrome.js">.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .ss-hint { position: fixed; right: 1.1rem; bottom: 1.1rem;
      color: #888; font-size: 11px; line-height: 1.5;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      opacity: 0; transition: opacity 400ms ease; pointer-events: none;
      text-shadow: 0 1px 2px rgba(0,0,0,0.6); z-index: 9999; }
    .ss-hint.show { opacity: 1; }
    .ss-hint kbd { font-family: inherit; color: #bbb;
      border: 1px solid rgba(255,255,255,0.18); padding: 0 4px;
      border-radius: 2px; background: rgba(0,0,0,0.35); }

    .ss-toast { position: fixed; top: 1.1rem; left: 50%;
      transform: translateX(-50%);
      padding: 0.35rem 0.7rem; font-size: 12px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      background: rgba(0,0,0,0.6); color: #ddd;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
      opacity: 0; transition: opacity 240ms ease; pointer-events: none;
      z-index: 9999; white-space: nowrap; }
    .ss-toast.show { opacity: 1; }
  `;
  document.head.appendChild(style);

  const hint = document.createElement('div');
  hint.className = 'ss-hint';
  const kbd = document.createElement('kbd');
  kbd.textContent = 'F';
  hint.appendChild(kbd);
  hint.appendChild(document.createTextNode(' fullscreen'));
  document.body.appendChild(hint);

  const toast = document.createElement('div');
  toast.className = 'ss-toast';
  document.body.appendChild(toast);
  let toastTimer;
  window.flashToast = function (msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1300);
  };

  let hideTimer;
  function flashHint(ms = 3500) {
    hint.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hint.classList.remove('show'), ms);
  }

  window.toggleFullscreen = function () {
    const el = document.documentElement;
    const inFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!inFs) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // don't clobber Cmd+F etc.
    if (e.key === 'f' || e.key === 'F') window.toggleFullscreen();
    else if (e.key === '?') flashHint();
  });

  // Dev-only live reload: on localhost, poll the sketch's sketch.js (resolved
  // relative to the page) and reload when it changes. Skipped on GitHub Pages.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    let last = null;
    setInterval(async () => {
      try {
        const r = await fetch('sketch.js', { method: 'HEAD', cache: 'no-store' });
        const m = r.headers.get('last-modified');
        if (last && m && m !== last) location.reload();
        if (m) last = m;
      } catch (e) {}
    }, 800);
  }

  flashHint();
})();
