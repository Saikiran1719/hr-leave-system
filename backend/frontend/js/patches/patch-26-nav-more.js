// ================================================================
// HRnova — patch-26-nav-more.js
// Collapsible "More" button in sidebar for Employee & HR
// ================================================================

// ── EMPLOYEE: pinned tabs (always visible) ──────────────────────
const EMP_PINNED = [
  'dashboard','apply','myleaves','calendar',
  'myattendance','notices','profile'
];

// ── HR: pinned tabs (always visible) ───────────────────────────
// HR gets 2 sections: core nav + HR Admin tools
const HR_PINNED = [
  'dashboard','apply','myleaves','calendar',
  'approvals','employees','balances','reports'
];

// ── Override renderApp shell to inject smart nav ────────────────
const _origStartApp = window.startApp;
window.startApp = async function() {
  await _origStartApp();
  // Hook is applied — smartNav is injected inside renderAppShell override below
};

// Intercept the sidebar-nav rendering inside renderApp
const _origRenderApp_nav = window.renderApp;
window.renderApp = async function() {
  await _origRenderApp_nav();
  injectSmartNav();
};

function injectSmartNav() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const user = getUser();
  if (!user) return;

  const isHR      = user.role === 'hr';
  const isManager = user.role === 'manager';
  const pinnedIDs = isHR ? HR_PINNED : EMP_PINNED;

  // Split NAV into pinned + more
  const allowed    = nav.querySelectorAll('[data-page]');
  const allItems   = [...allowed];
  const pinnedEls  = allItems.filter(el => pinnedIDs.includes(el.dataset.page));
  const moreEls    = allItems.filter(el => !pinnedIDs.includes(el.dataset.page));

  if (!moreEls.length) return; // nothing to collapse

  // ── Build new nav HTML structure ──────────────────────────────
  nav.innerHTML = '';

  // Pinned items
  pinnedEls.forEach(el => nav.appendChild(el));

  // ── More button ───────────────────────────────────────────────
  const moreBtn = document.createElement('button');
  moreBtn.id = 'nav-more-btn';
  moreBtn.className = 'nav-item';
  moreBtn.style.cssText = `
    width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;
    border:none;background:rgba(255,255,255,.06);border-radius:8px;
    color:rgba(255,255,255,.7);cursor:pointer;font-size:.84rem;font-weight:600;
    margin-top:6px;border:1px dashed rgba(255,255,255,.15);
    transition:background .15s;`;
  moreBtn.innerHTML = `
    <span class="nav-icon" style="font-size:.9rem">≡</span>
    <span class="nav-label">More</span>
    <span id="more-arrow" style="margin-left:auto;font-size:.65rem;transition:transform .2s">▼</span>`;

  nav.appendChild(moreBtn);

  // ── More panel (collapsed by default) ────────────────────────
  const morePanel = document.createElement('div');
  morePanel.id = 'nav-more-panel';
  morePanel.style.cssText = `
    overflow:hidden;max-height:0;transition:max-height .3s cubic-bezier(.4,0,.2,1);`;

  // Section divider for HR
  if (isHR || isManager) {
    const divider = document.createElement('div');
    divider.style.cssText = `height:1px;background:rgba(255,255,255,.1);margin:6px 0 4px`;
    morePanel.appendChild(divider);
  }

  // Group more items by nav section
  let lastGroup = null;
  moreEls.forEach(el => {
    // Find matching NAV entry for group label
    const navEntry = (typeof NAV !== 'undefined') ? NAV.find(n=>n.id===el.dataset.page) : null;
    const group    = navEntry?.group;

    if (group && group !== lastGroup && group !== 'main') {
      const lbl = document.createElement('div');
      lbl.className = 'nav-section-label';
      lbl.style.cssText = 'font-size:.6rem;font-weight:700;color:rgba(255,255,255,.4);' +
                          'text-transform:uppercase;letter-spacing:.1em;padding:8px 14px 2px';
      lbl.textContent = group === 'hr' ? 'HR Admin' : group === 'manage' ? 'Management' : '';
      if (lbl.textContent) morePanel.appendChild(lbl);
      lastGroup = group;
    }
    morePanel.appendChild(el);
  });

  nav.appendChild(morePanel);

  // ── Toggle logic ──────────────────────────────────────────────
  let moreOpen = false;
  moreBtn.addEventListener('click', () => {
    moreOpen = !moreOpen;
    morePanel.style.maxHeight = moreOpen ? morePanel.scrollHeight + 'px' : '0';
    document.getElementById('more-arrow').style.transform = moreOpen ? 'rotate(180deg)' : '';
    moreBtn.style.background = moreOpen ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.06)';
    moreBtn.style.color = moreOpen ? '#fff' : 'rgba(255,255,255,.7)';
  });

  // Auto-open More if current page is in moreEls
  const activePage = document.querySelector('.nav-item.active')?.dataset?.page;
  if (activePage && moreEls.some(el => el.dataset.page === activePage)) {
    moreOpen = true;
    morePanel.style.maxHeight = '1000px'; // open immediately
    document.getElementById('more-arrow').style.transform = 'rotate(180deg)';
    moreBtn.style.background = 'rgba(255,255,255,.1)';
    moreBtn.style.color = '#fff';
  }

  // Re-expand after navigation (panel resets on navigate)
  morePanel.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      // Keep panel open after clicking an item inside it
      setTimeout(() => {
        if (moreOpen) morePanel.style.maxHeight = morePanel.scrollHeight + 'px';
      }, 50);
    });
  });
}

// Re-inject on every navigate call since renderApp rebuilds the shell
const _origNav26 = window.navigate;
window.navigate = function(page) {
  const r = _origNav26(page);
  setTimeout(injectSmartNav, 120);
  return r;
};

// Initial injection
setTimeout(injectSmartNav, 700);

console.log('📌 Smart nav More button loaded');
