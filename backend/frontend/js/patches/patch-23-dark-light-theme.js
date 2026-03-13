// ==============================================================
// HRnova — patch-23-dark-light-theme.js
// Dark / Light Theme Toggle
// Lines 7268–7366 of original patch.js
// ==============================================================

// ================================================================
// DARK / LIGHT THEME TOGGLE
// ================================================================
(function() {
  const THEME_KEY = 'hr_theme';

  function applyTheme(theme) {
    const html = document.documentElement;
    html.classList.remove('theme-light','theme-dark');
    html.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
    localStorage.setItem(THEME_KEY, theme);
    updateToggleBtn(theme);
  }

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  function updateToggleBtn(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    const isDark = theme === 'dark';
    btn.innerHTML = isDark
      ? `<span style="font-size:1rem">☀️</span><span style="font-size:.72rem;font-weight:700">Light</span>`
      : `<span style="font-size:1rem">🌙</span><span style="font-size:.72rem;font-weight:700">Dark</span>`;
    btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    btn.style.background = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';
    btn.style.color = isDark ? '#e6edf3' : '#42526e';
    btn.style.borderColor = isDark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.12)';
  }

  function injectToggleBtn() {
    if (document.getElementById('theme-toggle-btn')) {
      updateToggleBtn(getTheme()); return;
    }
    const footer = document.querySelector('.sidebar-footer');
    if (!footer) return;

    const btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.style.cssText = `
      display:flex;align-items:center;gap:8px;width:100%;
      border:1px solid;border-radius:10px;padding:9px 12px;
      cursor:pointer;font-size:.82rem;margin-bottom:8px;
      transition:all .2s;font-family:inherit;`;
    btn.addEventListener('click', () => {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);

      // Ripple effect
      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position:fixed;inset:0;background:${next==='dark'?'rgba(0,0,0,.4)':'rgba(255,255,255,.4)'};
        pointer-events:none;z-index:99998;
        animation:themeRipple .35s ease forwards`;
      document.body.appendChild(ripple);
      setTimeout(()=>ripple.remove(), 400);
    });

    // Inject ripple animation if not exists
    if (!document.getElementById('theme-ripple-style')) {
      const style = document.createElement('style');
      style.id = 'theme-ripple-style';
      style.textContent = `
        @keyframes themeRipple {
          0%   { opacity:1 }
          100% { opacity:0 }
        }`;
      document.head.appendChild(style);
    }

    const signout = footer.querySelector('.btn-signout');
    const bell    = footer.querySelector('#notif-bell');
    const ref     = bell || signout;
    if (ref) footer.insertBefore(btn, ref);
    else footer.appendChild(btn);

    updateToggleBtn(getTheme());
  }

  // Apply theme on load immediately
  applyTheme(getTheme());

  // Inject button whenever nav renders
  const _origNavTheme = window.navigate;
  window.navigate = function(page) {
    const r = _origNavTheme(page);
    setTimeout(injectToggleBtn, 150);
    return r;
  };

  // Also try immediately
  setTimeout(injectToggleBtn, 600);
  window._applyTheme = applyTheme;
  window._getTheme   = getTheme;
})();

console.log('🌙 Theme toggle loaded');

