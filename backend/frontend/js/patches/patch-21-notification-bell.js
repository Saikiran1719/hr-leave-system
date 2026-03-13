// ==============================================================
// HRnova — patch-21-notification-bell.js
// Notification Bell — unread count + slide panel
// Lines 6857–7069 of original patch.js
// ==============================================================

// ================================================================
// NOTIFICATION BELL — Bell icon with unread count + slide panel
// ================================================================

api.getNotifications = (limit) => req('GET', `/users/notifications${limit?'?limit='+limit:''}`);
api.markAllRead      = ()      => req('PATCH','/users/notifications/read');

let _notifPollTimer = null;
let _notifUnread    = 0;

// Inject bell into sidebar footer after shell renders
const _origRenderApp = window.renderApp || function(){};
function initNotifBell() {
  // Find sidebar footer and inject bell button before sign-out
  const footer = document.querySelector('.sidebar-footer');
  if (!footer || footer.querySelector('#notif-bell')) return;

  const bell = document.createElement('button');
  bell.id = 'notif-bell';
  bell.title = 'Notifications';
  bell.style.cssText = `
    display:flex;align-items:center;gap:8px;width:100%;background:rgba(255,255,255,.08);
    border:none;border-radius:10px;padding:10px 12px;cursor:pointer;color:#fff;
    font-size:.85rem;font-weight:600;margin-bottom:8px;position:relative;
    transition:background .15s;`;
  bell.innerHTML = `
    <span style="font-size:1.1rem">🔔</span>
    <span>Notifications</span>
    <span id="notif-badge" style="display:none;background:#ef4444;color:#fff;border-radius:20px;
      padding:1px 7px;font-size:.65rem;font-weight:800;margin-left:auto">0</span>`;
  bell.onmouseover = () => bell.style.background = 'rgba(255,255,255,.15)';
  bell.onmouseout  = () => bell.style.background = 'rgba(255,255,255,.08)';
  bell.onclick = toggleNotifPanel;

  const signout = footer.querySelector('.btn-signout');
  if (signout) footer.insertBefore(bell, signout);
  else footer.appendChild(bell);

  // Start polling unread count every 30s
  fetchUnreadCount();
  if (_notifPollTimer) clearInterval(_notifPollTimer);
  _notifPollTimer = setInterval(fetchUnreadCount, 30000);
}

async function fetchUnreadCount() {
  try {
    const all = await api.getNotifications(200);
    const unread = (all?.notifications || []).filter(n => !n.IsRead).length;
    _notifUnread = unread;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.style.display = unread > 0 ? '' : 'none';
      badge.textContent   = unread > 99 ? '99+' : unread;
    }
    // Also update any existing panel
    const panel = document.getElementById('notif-panel');
    if (panel && panel.style.transform === 'translateX(0px)') refreshNotifPanel();
  } catch(e) {}
}

function toggleNotifPanel() {
  let panel = document.getElementById('notif-panel');
  if (panel) {
    const isOpen = panel.style.transform === 'translateX(0px)';
    panel.style.transform = isOpen ? 'translateX(110%)' : 'translateX(0px)';
    if (!isOpen) refreshNotifPanel();
    return;
  }
  // Create panel
  panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText = `
    position:fixed;top:0;right:0;width:360px;max-width:95vw;height:100vh;
    background:#fff;box-shadow:-4px 0 32px rgba(0,0,0,.18);z-index:10000;
    display:flex;flex-direction:column;transform:translateX(110%);
    transition:transform .28s cubic-bezier(.4,0,.2,1)`;
  panel.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a3c6e,#2563eb);padding:18px 20px;
                display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="color:#fff;font-weight:800;font-size:1rem">🔔 Notifications</div>
        <div id="notif-sub" style="color:rgba(255,255,255,.7);font-size:.75rem;margin-top:2px">Loading...</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="notif-mark-all" style="background:rgba(255,255,255,.15);color:#fff;border:none;
          border-radius:7px;padding:5px 10px;font-size:.72rem;cursor:pointer;font-weight:600">
          ✓ Mark all read
        </button>
        <button id="notif-close" style="background:rgba(255,255,255,.15);color:#fff;border:none;
          border-radius:7px;padding:5px 10px;font-size:1rem;cursor:pointer;line-height:1">✕</button>
      </div>
    </div>
    <div id="notif-list" style="flex:1;overflow-y:auto;padding:0">
      <div style="text-align:center;padding:40px;color:var(--text3)">Loading...</div>
    </div>`;
  document.body.appendChild(panel);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'notif-backdrop';
  backdrop.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:9999`;
  backdrop.onclick = () => {
    panel.style.transform = 'translateX(110%)';
    backdrop.remove();
  };
  document.body.appendChild(backdrop);

  panel.querySelector('#notif-close').onclick = () => {
    panel.style.transform = 'translateX(110%)';
    backdrop.remove();
  };
  panel.querySelector('#notif-mark-all').onclick = async () => {
    await api.markAllRead().catch(()=>{});
    _notifUnread = 0;
    const badge = document.getElementById('notif-badge');
    if (badge) { badge.style.display='none'; badge.textContent='0'; }
    refreshNotifPanel();
  };

  // Slide in
  requestAnimationFrame(() => panel.style.transform = 'translateX(0px)');
  refreshNotifPanel();
}

const NOTIF_ICONS = {
  leave:'📝', leave_approved:'✅', leave_rejected:'❌', payslip:'💵',
  review:'⭐', shift:'🕐', asset:'📦', encashment:'💰', exit:'🚪',
  notice:'📢', birthday:'🎂', ood:'🏢', encashment_result:'💰',
};

async function refreshNotifPanel() {
  const list = document.getElementById('notif-list');
  const sub  = document.getElementById('notif-sub');
  if (!list) return;
  try {
    const r = await api.getNotifications(50);
    const notifs = r?.notifications || [];
    const unread = notifs.filter(n=>!n.IsRead).length;
    _notifUnread = unread;
    const badge = document.getElementById('notif-badge');
    if (badge) { badge.style.display=unread>0?'':'none'; badge.textContent=unread>99?'99+':unread; }
    if (sub) sub.textContent = unread > 0 ? `${unread} unread` : 'All caught up!';

    if (!notifs.length) {
      list.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text3)">
        <div style="font-size:3rem;margin-bottom:12px">🔔</div>
        <div style="font-weight:600">No notifications yet</div>
        <div style="font-size:.82rem;margin-top:6px">You're all caught up!</div>
      </div>`; return;
    }

    // Group by date
    const groups = {};
    notifs.forEach(n => {
      const d = parseIST(n.CreatedAt);
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
      let key;
      if (d.toDateString()===today.toDateString()) key = 'Today';
      else if (d.toDateString()===yesterday.toDateString()) key = 'Yesterday';
      else key = d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });

    list.innerHTML = Object.entries(groups).map(([date, items]) => `
      <div style="padding:8px 16px 4px;font-size:.68rem;font-weight:800;color:var(--text3);
                  text-transform:uppercase;letter-spacing:.06em;background:#f8faff;
                  border-bottom:1px solid #f1f5f9">${date}</div>
      ${items.map(n => {
        const icon = NOTIF_ICONS[n.Type] || '🔔';
        const time = fmtISTTime(n.CreatedAt);
        const isUnread = !n.IsRead;
        return `
        <div style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid #f8faff;
                    background:${isUnread?'#f0f7ff':'#fff'};transition:background .15s;cursor:default"
             onmouseover="this.style.background='${isUnread?'#e0f0ff':'#f8faff'}'"
             onmouseout="this.style.background='${isUnread?'#f0f7ff':'#fff'}'">
          <div style="width:36px;height:36px;border-radius:10px;background:${isUnread?'#dbeafe':'#f1f5f9'};
                      display:flex;align-items:center;justify-content:center;
                      font-size:1.1rem;flex-shrink:0">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:${isUnread?'700':'600'};font-size:.83rem;color:#1e293b;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.Title}</div>
            <div style="font-size:.75rem;color:#64748b;margin-top:2px;line-height:1.4;
                        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
                        overflow:hidden">${n.Message}</div>
            <div style="font-size:.68rem;color:#94a3b8;margin-top:4px">${time}</div>
          </div>
          ${isUnread?`<div style="width:8px;height:8px;border-radius:50%;background:#2563eb;
                                   flex-shrink:0;margin-top:4px"></div>`:''}
        </div>`;
      }).join('')}
    `).join('');
  } catch(e) {
    if (list) list.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`;
  }
}

// Hook into renderApp to init bell after shell renders
const _origNavigateForBell = window.navigate;
window.navigate = function(page) {
  const result = _origNavigateForBell(page);
  // Init bell on every navigation (in case shell re-rendered)
  setTimeout(initNotifBell, 100);
  return result;
};

// Also init immediately if shell is already rendered
setTimeout(initNotifBell, 500);

console.log('🔔 Notification bell loaded');

