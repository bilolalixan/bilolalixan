/* Light/dark toggle shared by every page. The initial theme is applied by an
   inline script in <head> (before first paint); this file only wires up the
   [data-theme-toggle] buttons and remembers the choice site-wide. */
(function () {
  const root = document.documentElement;
  const COLORS = { light: '#eeeef0', dark: '#0b0b0c' };

  function apply(t) {
    root.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = COLORS[t];
  }

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      apply(root.dataset.theme === 'light' ? 'dark' : 'light');
    });
  });
})();
