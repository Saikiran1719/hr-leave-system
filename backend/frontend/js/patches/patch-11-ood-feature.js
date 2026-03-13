// ==============================================================
// HRnova — patch-11-ood-feature.js
// On Official Duty (OOD) feature
// Lines 2632–2920 of original patch.js
// ==============================================================

// ================================================================
// BIRTHDAY FEATURE
// ================================================================

// Add Birthday to nav for all roles
PAGES.employee = [...PAGES.employee, 'birthdays'];
PAGES.manager  = [...PAGES.manager,  'birthdays'];
PAGES.hr       = [...PAGES.hr,       'birthdays'];
NAV.push({ id:'birthdays', icon:'🎂', label:'Birthdays', group:'main' });

// Register Birthday API calls
api.birthdayToday    = () => req('GET',  '/birthdays/today');
api.birthdayUpcoming = () => req('GET',  '/birthdays/upcoming');
api.birthdayWish     = (toUserID, wishText) => req('POST', '/birthdays/wish', { toUserID, wishText });
api.birthdayMyWishes = () => req('GET',  '/birthdays/my-wishes');
api.birthdayWishes   = (uid) => req('GET', `/birthdays/wishes/${uid}`);

// Patch navigate for birthdays page — merged into attendance navigate patch above


function timeAgo(dt) {
  const diff = Math.floor((Date.now() - new Date(dt)) / 1000);
  if (diff < 60)  return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

function avatarCircle(name, size=44, fontSize='1rem') {
  const colors = ['#0052cc','#006644','#bf2600','#403294','#974f0c','#00695c','#6a1b9a','#c62828'];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  const initials = name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?';
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${colors[idx]};
                       display:flex;align-items:center;justify-content:center;
                       font-size:${fontSize};font-weight:700;color:#fff;flex-shrink:0">${initials}</div>`;
}

async function renderBirthdays(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">🎂 Birthdays</h2>
    </div>
    <div id="bday-content"><div class="loading">Loading...</div></div>`;

  const me = JSON.parse(localStorage.getItem('hr_user') || '{}');

  async function load() {
    try {
      const [todayRes, upRes, myWishesRes] = await Promise.all([
        api.birthdayToday(),
        api.birthdayUpcoming(),
        api.birthdayMyWishes(),
      ]);

    const todayBdays  = todayRes?.birthdays || [];
    const upcoming    = upRes?.upcoming || [];
    const isHR        = upRes?.isHR || false;
    const myWishes    = myWishesRes?.wishes || [];
    const myWishCount = myWishesRes?.count || 0;

    // Check if my birthday is today
    const myBdayToday = todayBdays.find(b => b.UserID === me.userID);

    let html = '';

    // ── My Birthday Banner ──────────────────────────────────────
    if (myBdayToday) {
      html += `
      <div style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:14px;
                  padding:28px 32px;margin-bottom:24px;color:#fff;text-align:center;
                  box-shadow:0 8px 32px rgba(124,58,237,.3)">
        <div style="font-size:3rem;margin-bottom:8px">🎂🎉🎈</div>
        <div style="font-size:1.6rem;font-weight:800;margin-bottom:6px">Happy Birthday, ${(me.fullName||'').split(' ')[0]}!</div>
        <div style="font-size:.9rem;opacity:.85">Your colleagues are sending you wishes today!</div>
        ${myWishCount > 0 ? `<div style="margin-top:16px;background:rgba(255,255,255,.2);border-radius:8px;
                              padding:8px 20px;display:inline-block;font-weight:700;font-size:1rem">
          🎁 ${myWishCount} wish${myWishCount!==1?'es':''} received!
        </div>` : ''}
      </div>`;

      // Show my wishes
      if (myWishCount > 0) {
        html += `<div class="card" style="margin-bottom:20px">
          <div class="card-title" style="margin-bottom:16px">🎁 Birthday Wishes For You</div>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${myWishes.map(w => `
              <div style="display:flex;gap:12px;align-items:flex-start;
                          background:#fdf4ff;border-radius:10px;padding:14px 16px">
                ${avatarCircle(w.FromName, 40, '.85rem')}
                <div style="flex:1">
                  <div style="font-weight:700;color:#1e293b;font-size:.9rem">${w.FromName}
                    ${w.FromCode?`<span style="color:#7c3aed;font-family:monospace;font-size:.75rem">#${w.FromCode}</span>`:''}
                    ${w.FromDept?`<span style="color:var(--text3);font-size:.75rem;margin-left:4px">${w.FromDept}</span>`:''}
                  </div>
                  <div style="color:#374151;font-size:.88rem;margin-top:4px;line-height:1.5">${w.WishText}</div>
                  <div style="color:var(--text3);font-size:.72rem;margin-top:4px">${timeAgo(w.CreatedAt)}</div>
                </div>
                <div style="font-size:1.4rem">💝</div>
              </div>`).join('')}
          </div>
        </div>`;
      }
    }

    // ── Today's Birthdays ───────────────────────────────────────
    if (todayBdays.length > 0) {
      html += `<div class="card" style="margin-bottom:20px">
        <div class="card-title" style="margin-bottom:16px">🎂 Today's Birthdays</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          ${todayBdays.map(b => {
            const isMe = b.UserID === me.userID;
            return `
            <div style="display:flex;align-items:center;gap:14px;
                        background:linear-gradient(135deg,#fdf4ff,#fce7f3);
                        border:1.5px solid #e879f9;border-radius:12px;padding:16px 20px">
              <div style="position:relative">
                ${avatarCircle(b.FullName, 52, '1.1rem')}
                <div style="position:absolute;bottom:-4px;right:-4px;font-size:1.1rem">🎂</div>
              </div>
              <div style="flex:1">
                <div style="font-weight:700;font-size:1rem;color:#1e293b">${b.FullName}
                  ${b.EmployeeCode?`<span style="color:#7c3aed;font-family:monospace;font-size:.75rem">#${b.EmployeeCode}</span>`:''}
                  ${isMe?`<span style="background:#7c3aed;color:#fff;border-radius:4px;
                                      padding:1px 8px;font-size:.7rem;margin-left:6px">You 🎉</span>`:''}
                </div>
                <div style="color:var(--text3);font-size:.8rem;margin-top:2px">${b.DepartmentName||'—'} · Turning ${b.Age}</div>
              </div>
              ${!isMe ? `
              <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
                <button class="btn btn-primary wish-btn" data-uid="${b.UserID}" data-name="${b.FullName}"
                        style="font-size:.8rem;padding:8px 18px;border-radius:8px;
                               background:linear-gradient(135deg,#7c3aed,#db2777);border:none">
                  🎉 Send Wish
                </button>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    } else if (!myBdayToday) {
      html += `<div class="card" style="margin-bottom:20px;text-align:center;padding:28px">
        <div style="font-size:2rem;margin-bottom:8px">🎂</div>
        <div style="color:var(--text3);font-size:.9rem">No birthdays today</div>
      </div>`;
    }

    // ── Upcoming Birthdays ──────────────────────────────────────
    if (upcoming.length > 0) {
      html += `<div class="card">
        <div class="card-title" style="margin-bottom:16px">📅 Upcoming Birthdays <span style="font-size:.75rem;color:var(--text3);font-weight:400">${isHR ? '(full year)' : '(next 30 days)'}</span></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${upcoming.map(b => {
            const bDate = new Date(new Date().getFullYear(), new Date(b.DateOfBirth).getMonth(), new Date(b.DateOfBirth).getDate());
            const label = b.DaysUntil === 1 ? 'Tomorrow 🎉' : `In ${b.DaysUntil} days`;
            return `
            <div style="display:flex;align-items:center;gap:12px;
                        background:var(--surface2);border-radius:10px;padding:12px 16px">
              ${avatarCircle(b.FullName, 40, '.85rem')}
              <div style="flex:1">
                <div style="font-weight:600;font-size:.9rem;color:#1e293b">${b.FullName}
                  ${b.EmployeeCode?`<span style="color:#0052cc;font-family:monospace;font-size:.72rem">#${b.EmployeeCode}</span>`:''}
                </div>
                <div style="color:var(--text3);font-size:.75rem;margin-top:2px">${b.DepartmentName||'—'} · ${bDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div>
              </div>
              <div style="font-size:.78rem;font-weight:700;color:${b.DaysUntil<=3?'#db2777':'#0052cc'};
                          background:${b.DaysUntil<=3?'#fce7f3':'#e0f2fe'};
                          border-radius:6px;padding:4px 12px">${label}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    document.getElementById('bday-content').innerHTML = html;

    // ── Wish button handlers ────────────────────────────────────
    document.querySelectorAll('.wish-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid  = parseInt(btn.dataset.uid);
        const name = btn.dataset.name;
        showWishModal(uid, name, load);
      });
    });
    } catch(e) {
      console.error('[Birthday] Load error:', e);
      const el = document.getElementById('bday-content');
      if (el) el.innerHTML = `<div class="card" style="padding:24px;color:#bf2600">
        ⚠️ Could not load birthday data. Please make sure you have run <code>migration_birthday.sql</code> in SSMS first.<br>
        <small style="color:var(--text3);margin-top:8px;display:block">Error: ${e.message}</small>
      </div>`;
    }
  }

  load();
}

// ── Wish Modal ──────────────────────────────────────────────
function showWishModal(toUserID, toName, onSuccess) {
  const existing = document.getElementById('wish-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'wish-modal-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;
                            display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;
                box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:2.5rem;margin-bottom:8px">🎉</div>
        <div style="font-size:1.1rem;font-weight:700;color:#1e293b">Wish ${toName}</div>
        <div style="color:var(--text3);font-size:.82rem;margin-top:4px">on their special day!</div>
      </div>
      <div style="margin-bottom:16px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${['🎂 Happy Birthday! Wishing you a great year ahead!',
             '🎉 Many happy returns of the day! Have a blast!',
             '🌟 Wishing you joy, health, and happiness today!',
             '🎈 Hope your birthday is as amazing as you are!'
            ].map(t => `<button class="quick-wish" style="background:#f1f5f9;border:1.5px solid #e2e8f0;
                border-radius:8px;padding:6px 12px;font-size:.75rem;cursor:pointer;color:#374151;
                text-align:left;width:100%;transition:background .15s" data-text="${t}">${t}</button>`).join('')}
        </div>
        <textarea id="wish-text" rows="3" placeholder="Or write a personal message..."
                  style="width:100%;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px;
                         font-size:.88rem;resize:vertical;box-sizing:border-box;font-family:inherit;
                         color:#1e293b;outline:none"></textarea>
      </div>
      <div style="display:flex;gap:10px">
        <button id="wish-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="wish-send" class="btn btn-primary" style="flex:2;
                background:linear-gradient(135deg,#7c3aed,#db2777);border:none">
          🎉 Send Wish
        </button>
      </div>
      <div id="wish-err" style="color:#dc2626;font-size:.8rem;margin-top:8px;text-align:center"></div>
    </div>`;

  document.body.appendChild(overlay);

  // Quick wish buttons
  overlay.querySelectorAll('.quick-wish').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById('wish-text').value = b.dataset.text;
      overlay.querySelectorAll('.quick-wish').forEach(x => x.style.background = '#f1f5f9');
      b.style.background = '#ede9fe';
    });
  });

  document.getElementById('wish-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('wish-send').onclick = async () => {
    const text = document.getElementById('wish-text').value.trim();
    if (!text) { document.getElementById('wish-err').textContent = 'Please write a wish first!'; return; }
    const btn = document.getElementById('wish-send');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const r = await api.birthdayWish(toUserID, text);
      if (r.success) {
        overlay.remove();
        // Show success toast
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
          background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;
          padding:14px 22px;border-radius:12px;font-weight:600;font-size:.88rem;
          box-shadow:0 8px 24px rgba(124,58,237,.4)`;
        toast.textContent = `🎉 Wish sent to ${toName}!`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        if (onSuccess) onSuccess();
      } else {
        document.getElementById('wish-err').textContent = r.error || 'Failed to send';
        btn.disabled = false; btn.textContent = '🎉 Send Wish';
      }
    } catch(e) {
      document.getElementById('wish-err').textContent = 'Network error';
      btn.disabled = false; btn.textContent = '🎉 Send Wish';
    }
  };
}

// ── Also show birthday notification badge in notification bell ─
// When a birthday notification arrives, it shows in the existing notification dropdown
// with a special birthday icon and a "Wish Now" action button

console.log('🎂 Birthday module loaded');


