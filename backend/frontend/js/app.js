// frontend/js/app.js — main shell + router

let currentPage = 'dashboard';

const PAGES = {
  employee: ['dashboard','apply','myleaves','calendar','profile'],
  manager:  ['dashboard','apply','myleaves','calendar','approvals','profile'],
  hr:       ['dashboard','apply','myleaves','calendar','approvals','employees','balances','reports','holidays','settings','profile'],
};

const NAV = [
  { id:'dashboard',  icon:'⊞',  label:'Dashboard',      group:'main' },
  { id:'apply',      icon:'＋', label:'Apply Leave',     group:'main' },
  { id:'myleaves',   icon:'📋',  label:'My Leaves',       group:'main' },
  { id:'calendar',   icon:'📅',  label:'Calendar',        group:'main' },
  { id:'approvals',  icon:'✔',  label:'Approvals',       group:'manage' },
  { id:'employees',  icon:'👥',  label:'Employees',       group:'hr' },
  { id:'balances',   icon:'⚖',  label:'Leave Balances',  group:'hr' },
  { id:'reports',    icon:'📊',  label:'Reports',         group:'hr' },
  { id:'holidays',   icon:'🎉',  label:'Holidays',        group:'hr' },
  { id:'settings',   icon:'⚙',  label:'Settings',        group:'' },
  { id:'profile',    icon:'👤',  label:'My Profile',      group:'main' },
];

async function startApp() {
  const user = getUser();
  if (!user) { renderLogin(); return; }

  const allowed = PAGES[user.role] || PAGES.employee;

  // Fetch pending count
  let pendingCnt = 0;
  try {
    if (user.role === 'manager' || user.role === 'hr') {
      const pend = await api.pendingLeaves();
      pendingCnt = pend.length;
    }
  } catch {}

  const navItems = NAV.filter(n => allowed.includes(n.id));

  // Group labels
  const groupLabels = {
    main:   '',
    manage: 'Management',
    hr:     'HR Admin',
  };

  let navHtml = '';
  let lastGroup = null;
  for (const n of navItems) {
    if (n.group !== lastGroup && groupLabels[n.group]) {
      navHtml += `<div class="nav-section-label">${groupLabels[n.group]}</div>`;
    }
    lastGroup = n.group;
    const badge = (n.id === 'approvals' && pendingCnt > 0)
      ? `<span class="nav-badge">${pendingCnt}</span>` : '';
    navHtml += `
      <button class="nav-item" data-page="${n.id}" title="${n.label}">
        <span class="nav-icon">${n.icon}</span>
        <span class="nav-label">${n.label}</span>
        ${badge}
      </button>`;
  }

  document.getElementById('app').innerHTML = `
    <!-- Mobile overlay -->
    <div class="mob-overlay" id="mob-overlay"></div>

    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <span class="logo-icon">🏢</span>
        <div>
          <div class="logo-name">HRnova</div>
          <div class="logo-sub">HR System</div>
        </div>
      </div>
      <nav id="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          ${avatarHtml(getInitials(user.fullName), 34)}
          <div class="sidebar-user-info">
            <div class="u-name">${user.fullName.split(' ')[0]}</div>
            <div class="u-role">${user.role}</div>
          </div>
        </div>
        <button class="btn-signout" id="btn-signout">
          <span>↩</span><span>Sign Out</span>
        </button>
      </div>
    </aside>

    <!-- Mobile topbar -->
    <div class="topbar" id="topbar">
      <button class="btn-menu" id="mob-menu">☰</button>
      <span class="topbar-logo">HRnova</span>
      ${pendingCnt > 0 ? `<span class="badge badge-pending" style="font-size:.7rem">${pendingCnt} pending</span>` : ''}
      ${avatarHtml(getInitials(user.fullName), 28)}
    </div>

    <!-- Main -->
    <div class="main-wrap" id="main-wrap">
      <main class="main-content" id="main-content">
        <div class="loader"><div class="spinner"></div>Loading…</div>
      </main>
    </div>`;

  // Nav click
  document.getElementById('sidebar-nav').addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (btn) navigate(btn.dataset.page);
  });

  // Mobile menu
  document.getElementById('mob-menu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('mob-overlay').classList.add('show');
  });
  document.getElementById('mob-overlay').addEventListener('click', closeMobMenu);

  // Sign out
  document.getElementById('btn-signout').addEventListener('click', () => {
    clearSession(); renderLogin();
  });

  navigate('dashboard');
}

function closeMobMenu() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('mob-overlay')?.classList.remove('show');
}

function navigate(page) {
  const user    = getUser();
  const allowed = PAGES[user?.role] || PAGES.employee;
  if (!allowed.includes(page)) page = 'dashboard';

  currentPage = page;

  // Highlight active nav
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  closeMobMenu();

  const content = document.getElementById('main-content');
  content.innerHTML = `<div class="loader"><div class="spinner"></div>Loading…</div>`;

  const map = {
    dashboard: renderDashboard,
    apply:     renderApply,
    myleaves:  renderMyLeaves,
    calendar:  renderCalendar,
    approvals: renderApprovals,
    employees: renderEmployees,
    balances:  renderBalances,
    reports:   renderReports,
    holidays:  renderHolidays,
    settings:  renderSettings,
    profile:   renderProfile,
  };

  (map[page] || renderDashboard)(content);
}

window.startApp  = startApp;
window.navigate  = navigate;
window.currentPage = currentPage;
